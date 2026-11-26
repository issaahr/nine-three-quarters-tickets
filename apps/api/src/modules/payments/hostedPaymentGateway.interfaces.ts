import { RefundStatus } from '../refunds/refundStatus.enum';
import { HostedPaymentOutcomeStatus } from './hostedPaymentOutcomeStatus.enum';
import { PaymentCurrency } from './paymentCurrency.enum';
import { PaymentMethod } from './paymentMethod.enum';
import { PaymentProvider } from './paymentProvider.enum';

/** Parâmetros locais necessários para persistir e validar uma criação de Checkout hospedado. */
export interface HostedPaymentInitiationOptions {
  gateway: HostedPaymentGateway;
  returnUrl: string;
}

export interface HostedPaymentRequest {
  paymentId: string;
  amountCents: number;
  currency: PaymentCurrency;
  method: PaymentMethod;
}

export interface HostedPaymentRedirect {
  externalReference: string;
  checkoutUrl: string | null;
}

export type HostedPaymentOutcome =
  | { status: HostedPaymentOutcomeStatus.Paid; externalPaymentReference: string }
  | { status: HostedPaymentOutcomeStatus.Pending; canExpire: boolean }
  | { status: HostedPaymentOutcomeStatus.Closed };

/** Dados da cobrança conciliada e da intenção persistida de estorno integral. */
export interface HostedRefundRequest {
  refundId: string;
  externalPaymentReference: string;
  amountCents: number;
  currency: PaymentCurrency;
}

export interface HostedRefundOutcome {
  externalReference: string;
  status: RefundStatus;
}

/** A tentativa local identifica uma única criação durante a janela de idempotência do provedor. */
export interface HostedPaymentGateway {
  readonly provider: PaymentProvider;
  readonly creationRetryWindowMs: number;
  /** Intervalo durante o qual uma nova geração de estorno ainda poderia competir com a anterior. */
  readonly refundIdempotencyRetentionMs: number;
  /**
   * Valida os limites de um método para o total positivo antes de persistir ou executar I/O.
   * A confirmação local de compras gratuitas não usa essa validação.
   *
   * @param amountCents - Total positivo em centavos, calculado a partir dos itens persistidos.
   * @param currency - Moeda persistida usada para validar os limites do provedor.
   * @param method - Meio de pagamento solicitado para a tentativa local.
   */
  assertCheckoutAmount(amountCents: number, currency: PaymentCurrency, method: PaymentMethod): void;
  /**
   * Cria uma sessão hospedada com a identidade persistida da tentativa como chave idempotente.
   *
   * @param request - Dados persistidos da intenção local usados para validar a operação e a resposta externa.
   * @param returnUrl - URL confiável da aplicação para retorno após conclusão ou desistência.
   * @returns Referência externa e URL quando a sessão ainda aceita pagamento.
   */
  createCheckout(request: HostedPaymentRequest, returnUrl: string): Promise<HostedPaymentRedirect>;
  /**
   * Descobre uma sessão com a identidade da tentativa quando a primeira resposta se perdeu.
   *
   * @param request - Dados persistidos da intenção local usados para validar a operação e a resposta externa.
   * @param createdAt - Instante persistido antes de a sessão poder existir.
   * @returns Sessão validada ou null quando a busca ainda não encontrou correspondência.
   */
  findCheckout(
    request: HostedPaymentRequest,
    createdAt: Date,
  ): Promise<HostedPaymentRedirect | null>;
  /**
   * Consulta a sessão vinculada e valida sua correspondência com a tentativa local.
   *
   * @param request - Dados persistidos da intenção local usados para validar a operação e a resposta externa.
   * @param externalReference - Identificador da sessão no provedor, validado contra a tentativa local.
   * @returns Referência validada e URL para retomada, ou URL nula quando indisponível.
   */
  retrieveCheckout(
    request: HostedPaymentRequest,
    externalReference: string,
  ): Promise<HostedPaymentRedirect>;
  /**
   * Consulta o provedor para distinguir cobrança confirmada, operação aberta e encerramento sem cobrança.
   *
   * @param request - Dados persistidos da intenção local usados para validar a operação e a resposta externa.
   * @param externalReference - Identificador da sessão no provedor, validado contra a tentativa local.
   * @returns Situação consultada da cobrança, distinguindo confirmação, pendência e encerramento sem cobrança.
   */
  retrievePaymentOutcome(
    request: HostedPaymentRequest,
    externalReference: string,
  ): Promise<HostedPaymentOutcome>;
  /**
   * Solicita o encerramento da sessão aberta e consulta o desfecho mesmo em caso de corrida.
   *
   * @param request - Dados persistidos da intenção local usados para validar a operação e a resposta externa.
   * @param externalReference - Identificador da sessão no provedor, validado contra a tentativa local.
   * @returns Situação observada após solicitar a expiração, incluindo eventual cobrança concorrente.
   */
  expireCheckout(
    request: HostedPaymentRequest,
    externalReference: string,
  ): Promise<HostedPaymentOutcome>;
  /**
   * Usa a identidade persistida do Refund e a geração de envio como chave idempotente.
   *
   * @param request - Identidade da intenção de estorno, cobrança externa, valor integral e moeda persistidos.
   * @param submissionStartedAt - Geração gravada antes da solicitação e reutilizada nas repetições.
   * @returns Referência externa e estado validado do estorno integral.
   */
  createRefund(
    request: HostedRefundRequest,
    submissionStartedAt: Date,
  ): Promise<HostedRefundOutcome>;
  /**
   * Retorna null somente após verificar a ausência da intenção em toda a lista da cobrança.
   *
   * @param request - Identidade da intenção de estorno, cobrança externa, valor integral e moeda persistidos.
   * @returns Estorno da intenção local ou null após concluir a busca sem correspondência.
   */
  findRefund(request: HostedRefundRequest): Promise<HostedRefundOutcome | null>;
  /**
   * Consulta uma referência já vinculada e valida os dados da intenção antes de retornar seu estado.
   *
   * @param request - Identidade da intenção de estorno, cobrança externa, valor integral e moeda persistidos.
   * @param externalReference - Identificador do estorno no provedor, já associado à intenção local.
   * @returns Referência e estado do estorno após validar sua correspondência com a intenção persistida.
   */
  retrieveRefund(
    request: HostedRefundRequest,
    externalReference: string,
  ): Promise<HostedRefundOutcome>;
}
