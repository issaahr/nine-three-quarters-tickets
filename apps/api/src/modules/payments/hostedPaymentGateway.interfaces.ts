import { RefundStatus } from '../refunds/refundStatus.enum';
import { HostedPaymentOutcomeStatus } from './hostedPaymentOutcomeStatus.enum';
import { PaymentCurrency } from './paymentCurrency.enum';
import { PaymentMethod } from './paymentMethod.enum';
import { PaymentProvider } from './paymentProvider.enum';

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
  createCheckout(request: HostedPaymentRequest, returnUrl: string): Promise<HostedPaymentRedirect>;
  retrieveCheckout(
    request: HostedPaymentRequest,
    externalReference: string,
  ): Promise<HostedPaymentRedirect>;
  /** Consulta o provedor para distinguir cobrança confirmada, operação aberta e encerramento sem cobrança. */
  retrievePaymentOutcome(
    request: HostedPaymentRequest,
    externalReference: string,
  ): Promise<HostedPaymentOutcome>;
  /** Solicita o encerramento da sessão aberta e consulta o desfecho mesmo em caso de corrida. */
  expireCheckout(
    request: HostedPaymentRequest,
    externalReference: string,
  ): Promise<HostedPaymentOutcome>;
  /**
   * Usa a identidade persistida do Refund e a geração de envio como chave idempotente.
   *
   * @param submissionStartedAt - Geração gravada antes da solicitação e reutilizada nas repetições.
   */
  createRefund(
    request: HostedRefundRequest,
    submissionStartedAt: Date,
  ): Promise<HostedRefundOutcome>;
  /** Retorna null somente após verificar a ausência da intenção em toda a lista da cobrança. */
  findRefund(request: HostedRefundRequest): Promise<HostedRefundOutcome | null>;
  retrieveRefund(
    request: HostedRefundRequest,
    externalReference: string,
  ): Promise<HostedRefundOutcome>;
}
