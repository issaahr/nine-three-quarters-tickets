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
  | { status: HostedPaymentOutcomeStatus.Pending | HostedPaymentOutcomeStatus.Closed };

/** A tentativa local identifica uma única criação durante a janela de idempotência do provedor. */
export interface HostedPaymentGateway {
  readonly provider: PaymentProvider;
  readonly creationRetryWindowMs: number;
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
}
