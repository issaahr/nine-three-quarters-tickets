export interface CardPaymentGatewayRequest {
  cardNumber: string;
  cardholderName: string;
  expiry: string;
  cvv: string;
  amountCents: number;
}

export enum CardPaymentGatewayStatus {
  Approved = 'APPROVED',
  Declined = 'DECLINED',
}

export interface CardPaymentGatewayResult {
  status: CardPaymentGatewayStatus;
}

// Fronteira para o processamento síncrono de cartões
export interface PaymentGateway {
  processCard(request: CardPaymentGatewayRequest): Promise<CardPaymentGatewayResult>;
}
