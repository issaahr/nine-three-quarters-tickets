import { PaymentMethod } from './paymentMethod.enum';

// Token da fronteira externa de processamento de pagamentos.
export const paymentGatewayToken = Symbol('PaymentGateway');
export const hostedPaymentGatewayToken = Symbol('HostedPaymentGateway');
export const stripeCheckoutWebhookToken = Symbol('StripeCheckoutWebhook');

export const hostedReconciliationIntervalMs = 30_000;
export const hostedReconciliationBatchSize = 10;
// Payment e Refund armazenam o total em colunas PostgreSQL integer.
export const hostedCheckoutMaxStoredAmountCents = 2_147_483_647;

export const simulatedPixCompletionDelayMs = 15_000;

export const checkoutPaymentMethods: readonly PaymentMethod[] = [
  PaymentMethod.Card,
  PaymentMethod.Pix,
];
