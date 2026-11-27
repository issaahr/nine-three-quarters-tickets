export enum PaymentMethod {
  Card = 'CARD',
  Pix = 'PIX',
}

export enum PaymentStatus {
  Pending = 'PENDING',
  Approved = 'APPROVED',
  Declined = 'DECLINED',
  Failed = 'FAILED',
}

export enum PaymentCheckoutMode {
  Simulated = 'SIMULATED',
  Hosted = 'HOSTED',
}

export interface PaymentCheckoutConfiguration {
  mode: PaymentCheckoutMode;
  methods: PaymentMethod[];
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

export interface SimulatedPixPayment extends Payment {
  simulationCompletionAt: string | null;
  qrCodePayload: string | null;
}

export interface HostedCheckoutPayment extends Payment {
  checkoutUrl: string | null;
  canResume: boolean;
}
