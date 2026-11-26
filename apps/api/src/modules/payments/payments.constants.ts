// Token da fronteira externa de processamento de pagamentos.
export const paymentGatewayToken = Symbol('PaymentGateway');
export const hostedPaymentGatewayToken = Symbol('HostedPaymentGateway');

export const simulatedPixCompletionDelayMs = 15_000;
