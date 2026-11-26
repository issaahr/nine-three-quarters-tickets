import { HostedCheckoutUnavailableError } from '../errors/hostedCheckoutUnavailable.error';
import {
  HostedPaymentGateway,
  HostedPaymentRedirect,
  HostedPaymentRequest,
} from '../hostedPaymentGateway.interfaces';
import { PaymentMethod } from '../paymentMethod.enum';
import { PaymentProvider } from '../paymentProvider.enum';
import {
  StripeCheckoutMode,
  StripeCheckoutObject,
  StripeCheckoutPaymentStatus,
  StripeCheckoutSessionStatus,
  StripePaymentMethod,
} from './stripeCheckout.enums';

const stripeApiVersion = '2026-11-18.endive';
const stripeCheckoutSessionsUrl = 'https://api.stripe.com/v1/checkout/sessions';
const stripeCheckoutOrigin = 'https://checkout.stripe.com';
const stripeCheckoutUiMode = 'hosted_page';
const stripeTestSessionIdPrefix = 'cs_test_';
const stripeRequestTimeoutMs = 10_000;
const stripePixExpirationSeconds = 600;
// Mantém margem para a repetição chegar à Stripe antes do limite de retenção de 24 horas.
const stripeCreationRetryWindowMs = 23 * 60 * 60 * 1000;
const stripeCheckoutProductName = 'Ingressos 9¾ Tickets';
const stripeCheckoutLineItemQuantity = 1;
const stripeCheckoutAdaptivePricingEnabled = false;

export class StripeHostedPaymentGateway implements HostedPaymentGateway {
  public readonly provider = PaymentProvider.Stripe;
  public readonly creationRetryWindowMs = stripeCreationRetryWindowMs;

  public constructor(private readonly secretKey: string) {}

  /**
   * Cria ou recupera uma sessão usando a identidade da tentativa local como chave idempotente.
   *
   * @param request - Dados persistidos da tentativa, que devem ser iguais em cada repetição.
   * @param returnUrl - URL confiável da aplicação para retorno por conclusão ou desistência.
   * @returns Referência externa e link quando a sessão ainda aceita pagamento.
   */
  public createCheckout(
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

    return this.requestSession(stripeCheckoutSessionsUrl, request, {
      method: 'POST',
      body: params,
      headers: { 'Idempotency-Key': `checkout-${request.paymentId}` },
    });
  }

  /**
   * Consulta a sessão vinculada à tentativa para retomar o checkout existente.
   *
   * @param request - Dados locais usados para validar a resposta do provedor.
   * @param externalReference - Identificador da sessão já gravado na tentativa.
   * @returns Referência validada e link quando a sessão ainda aceita pagamento.
   */
  public retrieveCheckout(
    request: HostedPaymentRequest,
    externalReference: string,
  ): Promise<HostedPaymentRedirect> {
    return this.requestSession(
      `${stripeCheckoutSessionsUrl}/${encodeURIComponent(externalReference)}`,
      request,
      {},
      externalReference,
    );
  }

  /**
   * Valida o vínculo, o valor e o ambiente da sessão antes de expor a resposta ao checkout.
   *
   * @param expectedReference - Na consulta, restringe a resposta ao identificador já persistido.
   * @returns Referência validada e link apenas para sessões abertas e ainda não pagas.
   * @throws {@link HostedCheckoutUnavailableError} se a chamada falhar ou a sessão divergir da tentativa.
   */
  private async requestSession(
    endpoint: string,
    request: HostedPaymentRequest,
    init: RequestInit,
    expectedReference?: string,
  ): Promise<HostedPaymentRedirect> {
    let data: unknown;
    try {
      const headers = new Headers(init.headers);
      headers.set('Authorization', `Bearer ${this.secretKey}`);
      headers.set('Stripe-Version', stripeApiVersion);
      // A credencial deve permanecer no endpoint da Stripe, mesmo se a resposta indicar um redirecionamento.
      const response = await fetch(endpoint, {
        ...init,
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(stripeRequestTimeoutMs),
      });
      if (!response.ok) throw new HostedCheckoutUnavailableError();
      data = await response.json();
    } catch {
      // A falha de comunicação pode ocorrer depois da criação remota. A tentativa local segue recuperável.
      throw new HostedCheckoutUnavailableError();
    }

    if (typeof data !== 'object' || data === null) throw new HostedCheckoutUnavailableError();
    const session = data as Record<string, unknown>;
    if (
      session.object !== StripeCheckoutObject.Session ||
      session.livemode !== false ||
      session.mode !== StripeCheckoutMode.Payment ||
      session.client_reference_id !== request.paymentId ||
      session.amount_total !== request.amountCents ||
      session.currency !== request.currency.toLowerCase() ||
      !Array.isArray(session.payment_method_types) ||
      !session.payment_method_types.includes(this.paymentMethod(request.method)) ||
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
      externalReference: session.id,
      checkoutUrl:
        session.status === StripeCheckoutSessionStatus.Open &&
        session.payment_status === StripeCheckoutPaymentStatus.Unpaid
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
