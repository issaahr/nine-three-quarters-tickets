import { RefundStatus } from '../../refunds/refundStatus.enum';
import { HostedCheckoutUnavailableError } from '../errors/hostedCheckoutUnavailable.error';
import { UnsupportedCheckoutAmountError } from '../errors/unsupportedCheckoutAmount.error';
import {
  HostedPaymentGateway,
  HostedPaymentOutcome,
  HostedPaymentRedirect,
  HostedPaymentRequest,
  HostedRefundOutcome,
  HostedRefundRequest,
} from '../hostedPaymentGateway.interfaces';
import { HostedPaymentOutcomeStatus } from '../hostedPaymentOutcomeStatus.enum';
import { PaymentCurrency } from '../paymentCurrency.enum';
import { PaymentMethod } from '../paymentMethod.enum';
import { PaymentProvider } from '../paymentProvider.enum';
import { stripePaymentIntentIdPrefix, stripeTestSessionIdPrefix } from './stripeCheckout.constants';
import {
  StripeCheckoutMode,
  StripeCheckoutObject,
  StripeCheckoutPaymentStatus,
  StripeCheckoutSessionStatus,
  StripePaymentMethod,
  StripePaymentIntentStatus,
  StripeRefundStatus,
} from './stripeCheckout.enums';
import { StripeCheckoutSession } from './stripeCheckout.interfaces';

const stripeApiVersion = '2026-11-18.endive';
const stripeApiUrl = 'https://api.stripe.com/v1';
const stripeCheckoutSessionsUrl = `${stripeApiUrl}/checkout/sessions`;
const stripeRefundsUrl = `${stripeApiUrl}/refunds`;
const stripeListPageSize = 100;
const stripeCheckoutDiscoveryClockSkewSeconds = 300;
const millisecondsPerSecond = 1_000;
const stripeCheckoutOrigin = 'https://checkout.stripe.com';
const stripeCheckoutUiMode = 'hosted_page';
const stripeRequestTimeoutMs = 10_000;
const stripePixExpirationSeconds = 600;
const stripeIdempotencyRetentionMs = 24 * 60 * 60 * 1000;
// Mantém margem para a repetição chegar à Stripe antes do limite de retenção de 24 horas.
const stripeCreationRetryWindowMs = 23 * 60 * 60 * 1000;
const stripeCheckoutProductName = 'Ingressos 9¾ Tickets';
const stripeCheckoutLineItemQuantity = 1;
const stripeCheckoutAdaptivePricingEnabled = false;
const stripeBrlMinimumAmountCents = 50;
const stripeBrlMaximumPixAmountCents = 99_999_999;
// Redes específicas podem impor limites adicionais ao cartão escolhido na Stripe.
const stripeMaximumCardAmountCents = 999_999_999_999;

export class StripeHostedPaymentGateway implements HostedPaymentGateway {
  public readonly provider = PaymentProvider.Stripe;
  public readonly creationRetryWindowMs = stripeCreationRetryWindowMs;
  public readonly refundIdempotencyRetentionMs = stripeIdempotencyRetentionMs;

  public constructor(private readonly secretKey: string) {}

  /**
   * Valida o intervalo conhecido antes de abrir a sessão. A rede do cartão ainda pode aplicar
   * um limite próprio depois que o cliente escolher o cartão hospedado.
   *
   * @param amountCents - Total positivo em centavos da moeda.
   * @param currency - Moeda da tentativa, que deve ser BRL.
   * @param method - Meio de pagamento da tentativa, que deve ser cartão ou Pix.
   */
  public assertCheckoutAmount(
    amountCents: number,
    currency: PaymentCurrency,
    method: PaymentMethod,
  ): void {
    const maximum =
      method === PaymentMethod.Pix ? stripeBrlMaximumPixAmountCents : stripeMaximumCardAmountCents;
    if (
      currency !== PaymentCurrency.Brl ||
      !Number.isSafeInteger(amountCents) ||
      amountCents < stripeBrlMinimumAmountCents ||
      amountCents > maximum
    ) {
      throw new UnsupportedCheckoutAmountError();
    }
  }

  /**
   * Cria ou recupera uma sessão usando a identidade da tentativa local como chave idempotente.
   *
   * @param request - Dados persistidos da tentativa, que devem ser iguais em cada repetição.
   * @param returnUrl - URL confiável da aplicação para retorno por conclusão ou desistência.
   * @returns Referência externa e link quando a sessão ainda aceita pagamento.
   */
  public async createCheckout(
    request: HostedPaymentRequest,
    returnUrl: string,
  ): Promise<HostedPaymentRedirect> {
    const params = new URLSearchParams({
      mode: StripeCheckoutMode.Payment,
      ui_mode: stripeCheckoutUiMode,
      success_url: returnUrl,
      cancel_url: returnUrl,
      client_reference_id: request.paymentId,
      'payment_intent_data[metadata][paymentId]': request.paymentId,
      'allowed_payment_method_types[0]': this.paymentMethod(request.method),
      'adaptive_pricing[enabled]': String(stripeCheckoutAdaptivePricingEnabled),
      'line_items[0][price_data][currency]': request.currency.toLowerCase(),
      'line_items[0][price_data][product_data][name]': stripeCheckoutProductName,
      'line_items[0][price_data][unit_amount]': String(request.amountCents),
      'line_items[0][quantity]': String(stripeCheckoutLineItemQuantity),
    });
    if (request.method === PaymentMethod.Pix) {
      params.set(
        `payment_method_options[${StripePaymentMethod.Pix}][expires_after_seconds]`,
        String(stripePixExpirationSeconds),
      );
    }

    const session = await this.requestSession(stripeCheckoutSessionsUrl, request, {
      method: 'POST',
      body: params,
      headers: { 'Idempotency-Key': `checkout-${request.paymentId}` },
    });
    return this.redirect(session);
  }

  /**
   * Consulta a sessão vinculada à tentativa para retomar o checkout existente.
   *
   * @param request - Dados locais usados para validar a resposta do provedor.
   * @param externalReference - Identificador da sessão já gravado na tentativa.
   * @returns Referência validada e link quando a sessão ainda aceita pagamento.
   */
  public async retrieveCheckout(
    request: HostedPaymentRequest,
    externalReference: string,
  ): Promise<HostedPaymentRedirect> {
    const session = await this.requestSession(
      this.checkoutSessionUrl(externalReference),
      request,
      {},
      externalReference,
    );
    return this.redirect(session);
  }

  /**
   * Percorre a janela de criação e rejeita vínculos múltiplos ou malformados.
   * A listagem sem correspondência não prova que uma falha anterior foi definitiva.
   *
   * @param request - Dados persistidos da intenção local usados para validar a operação e a resposta externa.
   * @param createdAt - Instante persistido de criação da tentativa que delimita a busca da sessão.
   * @returns Sessão validada ou null quando a busca concluída ainda não encontrou correspondência.
   */
  public async findCheckout(
    request: HostedPaymentRequest,
    createdAt: Date,
  ): Promise<HostedPaymentRedirect | null> {
    const query = new URLSearchParams({
      'created[gte]': String(
        Math.floor(createdAt.getTime() / millisecondsPerSecond) -
          stripeCheckoutDiscoveryClockSkewSeconds,
      ),
      'created[lte]': String(
        Math.ceil((createdAt.getTime() + this.creationRetryWindowMs) / millisecondsPerSecond) +
          stripeCheckoutDiscoveryClockSkewSeconds,
      ),
      limit: String(stripeListPageSize),
    });
    const seenCursors = new Set<string>();
    let match: StripeCheckoutSession | null = null;
    while (true) {
      const page = this.record(await this.requestStripe(`${stripeCheckoutSessionsUrl}?${query}`));
      if (
        !page ||
        page.object !== StripeCheckoutObject.List ||
        typeof page.has_more !== 'boolean' ||
        !Array.isArray(page.data)
      ) {
        throw new HostedCheckoutUnavailableError();
      }
      for (const item of page.data as unknown[]) {
        const candidate = this.record(item);
        if (candidate?.client_reference_id !== request.paymentId) continue;
        if (match) throw new HostedCheckoutUnavailableError();
        match = this.readSession(candidate, request);
      }
      if (!page.has_more) {
        if (!match) return null;
        return this.retrieveCheckout(request, match.id);
      }
      const cursor = this.record(page.data.at(-1))?.id;
      if (!this.hasOpaqueId(cursor) || seenCursors.has(cursor)) {
        throw new HostedCheckoutUnavailableError();
      }
      seenCursors.add(cursor);
      query.set('starting_after', cursor);
    }
  }

  /**
   * Verifica a situação atual da sessão e do PaymentIntent antes de conciliar a tentativa local.
   * Uma sessão sem cobrança mantém a tentativa pendente enquanto o provedor ainda pode cobrar.
   *
   * @param request - Dados persistidos da intenção local usados para validar a operação e a resposta externa.
   * @param externalReference - Identificador da sessão no provedor, validado contra a tentativa local.
   * @returns Situação consultada da cobrança, distinguindo confirmação, pendência e encerramento sem cobrança.
   */
  public async retrievePaymentOutcome(
    request: HostedPaymentRequest,
    externalReference: string,
  ): Promise<HostedPaymentOutcome> {
    const query = new URLSearchParams({ 'expand[]': StripeCheckoutObject.PaymentIntent });
    const session = await this.requestSession(
      `${this.checkoutSessionUrl(externalReference)}?${query}`,
      request,
      {},
      externalReference,
    );
    const intent = this.record(session.paymentIntent);

    if (session.paymentStatus === StripeCheckoutPaymentStatus.Paid) {
      if (
        session.status !== StripeCheckoutSessionStatus.Complete ||
        !intent ||
        !this.matchesPaymentIntent(intent, request) ||
        intent.status !== StripePaymentIntentStatus.Succeeded ||
        intent.amount_received !== request.amountCents ||
        typeof intent.id !== 'string'
      )
        throw new HostedCheckoutUnavailableError();
      return { status: HostedPaymentOutcomeStatus.Paid, externalPaymentReference: intent.id };
    }

    const noCharge =
      intent &&
      this.matchesPaymentIntent(intent, request) &&
      intent.amount_received === 0 &&
      (intent.status === StripePaymentIntentStatus.Canceled ||
        intent.status === StripePaymentIntentStatus.RequiresPaymentMethod);
    // O Checkout só permite tentar outro meio de pagamento enquanto a sessão continuar aberta.
    if (
      session.paymentStatus === StripeCheckoutPaymentStatus.Unpaid &&
      ((session.status === StripeCheckoutSessionStatus.Expired &&
        (session.paymentIntent === null || noCharge)) ||
        (session.status === StripeCheckoutSessionStatus.Complete && noCharge))
    )
      return { status: HostedPaymentOutcomeStatus.Closed };

    return {
      status: HostedPaymentOutcomeStatus.Pending,
      canExpire: session.status === StripeCheckoutSessionStatus.Open,
    };
  }

  /**
   * Relê o resultado porque a sessão pode já ter sido encerrada ou paga enquanto expirava.
   * Uma falha do POST, sozinha, não determina se o provedor pode cobrar.
   *
   * @param request - Dados persistidos da intenção local usados para validar a operação e a resposta externa.
   * @param externalReference - Identificador da sessão no provedor, validado contra a tentativa local.
   * @returns Situação observada após solicitar a expiração, incluindo eventual cobrança concorrente.
   */
  public async expireCheckout(
    request: HostedPaymentRequest,
    externalReference: string,
  ): Promise<HostedPaymentOutcome> {
    try {
      await this.requestSession(
        `${this.checkoutSessionUrl(externalReference)}/expire`,
        request,
        { method: 'POST' },
        externalReference,
      );
    } catch (error) {
      if (!(error instanceof HostedCheckoutUnavailableError)) throw error;
    }
    return this.retrievePaymentOutcome(request, externalReference);
  }

  /**
   * Solicita o estorno integral usando a geração persistida para repetir a mesma operação.
   *
   * @param request - Identidade da intenção de estorno, cobrança externa, valor integral e moeda persistidos.
   * @param submissionStartedAt - Instante da geração de envio que compõe a chave idempotente.
   * @returns Referência opaca da Stripe e estado verificado da intenção.
   */
  public async createRefund(
    request: HostedRefundRequest,
    submissionStartedAt: Date,
  ): Promise<HostedRefundOutcome> {
    const payload = await this.requestStripe(stripeRefundsUrl, {
      method: 'POST',
      headers: { 'Idempotency-Key': `refund-${request.refundId}-${submissionStartedAt.getTime()}` },
      body: new URLSearchParams({
        payment_intent: request.externalPaymentReference,
        amount: String(request.amountCents),
        'metadata[refundId]': request.refundId,
      }),
    });
    return this.readRefund(payload, request);
  }

  /**
   * O metadado identifica a mesma intenção mesmo após a retenção da chave idempotente.
   *
   * @param request - Identidade da intenção de estorno, cobrança externa, valor integral e moeda persistidos.
   * @returns Estorno da intenção local ou null após concluir a busca sem correspondência.
   */
  public async findRefund(request: HostedRefundRequest): Promise<HostedRefundOutcome | null> {
    const query = new URLSearchParams({
      payment_intent: request.externalPaymentReference,
      limit: String(stripeListPageSize),
    });
    const seenCursors = new Set<string>();
    while (true) {
      const page = this.record(await this.requestStripe(`${stripeRefundsUrl}?${query}`));
      if (
        !page ||
        page.object !== StripeCheckoutObject.List ||
        typeof page.has_more !== 'boolean' ||
        !Array.isArray(page.data)
      ) {
        throw new HostedCheckoutUnavailableError();
      }
      let cursor: string | undefined;
      for (const item of page.data as unknown[]) {
        const refund = this.record(item);
        if (
          !refund ||
          refund.object !== StripeCheckoutObject.Refund ||
          refund.livemode === true ||
          !this.hasOpaqueId(refund.id) ||
          refund.payment_intent !== request.externalPaymentReference ||
          refund.currency !== request.currency.toLowerCase()
        ) {
          throw new HostedCheckoutUnavailableError();
        }
        if (this.record(refund.metadata)?.refundId === request.refundId) {
          return this.readRefund(refund, request);
        }
        cursor = refund.id;
      }
      if (!page.has_more) return null;
      if (cursor === undefined || seenCursors.has(cursor)) {
        throw new HostedCheckoutUnavailableError();
      }
      seenCursors.add(cursor);
      query.set('starting_after', cursor);
    }
  }

  /**
   * Valida vínculo, total e moeda antes de aceitar a situação do estorno já registrado.
   *
   * @param request - Identidade da intenção de estorno, cobrança externa, valor integral e moeda persistidos.
   * @param externalReference - Identificador opaco persistido da Stripe.
   * @returns Referência e estado do estorno após validar sua correspondência com a intenção persistida.
   */
  public async retrieveRefund(
    request: HostedRefundRequest,
    externalReference: string,
  ): Promise<HostedRefundOutcome> {
    const payload = await this.requestStripe(
      `${stripeRefundsUrl}/${encodeURIComponent(externalReference)}`,
    );
    return this.readRefund(payload, request, externalReference);
  }

  /**
   * Valida o vínculo, o valor e o ambiente da sessão antes de expor a resposta ao checkout.
   *
   * @param endpoint - Endereço da API Stripe montado pelo adapter, sem controle pelo cliente HTTP da aplicação.
   * @param request - Dados persistidos da intenção local usados para validar a operação e a resposta externa.
   * @param init - Método, corpo e cabeçalhos; o adapter aplica autenticação e limite de espera.
   * @param expectedReference - Na consulta, restringe a resposta ao identificador já persistido.
   * @returns Campos usados para retomar ou conciliar a sessão externa.
   */
  private async requestSession(
    endpoint: string,
    request: HostedPaymentRequest,
    init: RequestInit,
    expectedReference?: string,
  ): Promise<StripeCheckoutSession> {
    return this.readSession(await this.requestStripe(endpoint, init), request, expectedReference);
  }

  private readSession(
    payload: unknown,
    request: HostedPaymentRequest,
    expectedReference?: string,
  ): StripeCheckoutSession {
    const session = this.record(payload);
    if (
      !session ||
      session.object !== StripeCheckoutObject.Session ||
      session.livemode !== false ||
      session.mode !== StripeCheckoutMode.Payment ||
      session.client_reference_id !== request.paymentId ||
      session.amount_total !== request.amountCents ||
      session.currency !== request.currency.toLowerCase() ||
      !Array.isArray(session.payment_method_types) ||
      session.payment_method_types.length !== 1 ||
      session.payment_method_types[0] !== this.paymentMethod(request.method) ||
      typeof session.id !== 'string' ||
      !session.id.startsWith(stripeTestSessionIdPrefix) ||
      (expectedReference !== undefined && session.id !== expectedReference) ||
      (session.status !== StripeCheckoutSessionStatus.Open &&
        session.status !== StripeCheckoutSessionStatus.Complete &&
        session.status !== StripeCheckoutSessionStatus.Expired)
    ) {
      throw new HostedCheckoutUnavailableError();
    }

    return {
      id: session.id,
      status: session.status,
      paymentStatus: session.payment_status,
      paymentIntent: session.payment_intent,
      url: session.url,
    };
  }

  /**
   * Mantém credenciais no endpoint original e transforma falhas de transporte em resultado recuperável.
   *
   * @param endpoint - Endereço da API Stripe montado pelo adapter, sem controle pelo cliente HTTP da aplicação.
   * @param init - Método, corpo e cabeçalhos; o adapter aplica autenticação e limite de espera.
   * @returns Corpo JSON recebido da Stripe, ainda sem validação específica da sessão ou do estorno.
   */
  private async requestStripe(endpoint: string, init: RequestInit = {}): Promise<unknown> {
    try {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${this.secretKey}`);
      headers.set('Stripe-Version', stripeApiVersion);
      const response = await fetch(endpoint, {
        ...init,
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(stripeRequestTimeoutMs),
      });
      if (!response.ok) throw new HostedCheckoutUnavailableError();
      return await response.json();
    } catch {
      throw new HostedCheckoutUnavailableError();
    }
  }

  /**
   * O estorno só pode avançar se pertencer à mesma cobrança, intenção, moeda e valor integral.
   *
   * @param payload - Corpo JSON do estorno, ainda sem validação de estrutura ou de vínculo com a intenção.
   * @param request - Identidade da intenção de estorno, cobrança externa, valor integral e moeda persistidos.
   * @param expectedReference - Identificador externo esperado quando a operação já possui vínculo persistido.
   * @returns Referência e estado do estorno após validar cobrança, intenção, total e moeda.
   */
  private readRefund(
    payload: unknown,
    request: HostedRefundRequest,
    expectedReference?: string,
  ): HostedRefundOutcome {
    const refund = this.record(payload);
    if (
      !refund ||
      refund.object !== StripeCheckoutObject.Refund ||
      refund.livemode === true ||
      !this.hasOpaqueId(refund.id) ||
      (expectedReference !== undefined && refund.id !== expectedReference) ||
      refund.payment_intent !== request.externalPaymentReference ||
      this.record(refund.metadata)?.refundId !== request.refundId ||
      refund.amount !== request.amountCents ||
      refund.currency !== request.currency.toLowerCase()
    )
      throw new HostedCheckoutUnavailableError();

    switch (refund.status) {
      case StripeRefundStatus.Succeeded:
        return { externalReference: refund.id, status: RefundStatus.Completed };
      case StripeRefundStatus.Pending:
      case StripeRefundStatus.RequiresAction:
        return { externalReference: refund.id, status: RefundStatus.Pending };
      case StripeRefundStatus.Failed:
      case StripeRefundStatus.Canceled:
        return { externalReference: refund.id, status: RefundStatus.Failed };
      default:
        throw new HostedCheckoutUnavailableError();
    }
  }

  private checkoutSessionUrl(externalReference: string): string {
    return `${stripeCheckoutSessionsUrl}/${encodeURIComponent(externalReference)}`;
  }

  private hasOpaqueId(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private matchesPaymentIntent(
    intent: Record<string, unknown>,
    request: HostedPaymentRequest,
  ): boolean {
    return (
      intent.object === StripeCheckoutObject.PaymentIntent &&
      intent.livemode === false &&
      typeof intent.id === 'string' &&
      intent.id.startsWith(stripePaymentIntentIdPrefix) &&
      this.record(intent.metadata)?.paymentId === request.paymentId &&
      intent.amount === request.amountCents &&
      intent.currency === request.currency.toLowerCase()
    );
  }

  private record(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  }

  private redirect(session: StripeCheckoutSession): HostedPaymentRedirect {
    return {
      externalReference: session.id,
      checkoutUrl:
        session.status === StripeCheckoutSessionStatus.Open &&
        session.paymentStatus === StripeCheckoutPaymentStatus.Unpaid
          ? this.hostedUrl(session.url)
          : null,
    };
  }

  private hostedUrl(value: unknown): string {
    if (typeof value !== 'string' || !URL.canParse(value))
      throw new HostedCheckoutUnavailableError();
    const url = new URL(value);
    if (url.origin !== stripeCheckoutOrigin || url.username || url.password) {
      throw new HostedCheckoutUnavailableError();
    }
    return url.href;
  }

  private paymentMethod(method: PaymentMethod): StripePaymentMethod {
    return method === PaymentMethod.Pix ? StripePaymentMethod.Pix : StripePaymentMethod.Card;
  }
}
