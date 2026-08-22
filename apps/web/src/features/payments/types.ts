export enum PaymentMethod {
  Card = 'CARD',
}

export enum PaymentStatus {
  Pending = 'PENDING',
  Approved = 'APPROVED',
  Declined = 'DECLINED',
  Failed = 'FAILED',
}

export interface CardPaymentRequest {
  cardNumber: string;
  cardholderName: string;
  expiry: string;
  cvv: string;
}

export interface Payment {
  id: string;
  reservationId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  approvedAt: string | null;
  failedAt: string | null;
}
