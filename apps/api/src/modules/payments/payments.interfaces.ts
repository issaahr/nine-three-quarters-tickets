import { HostedPaymentOutcome, HostedPaymentRequest } from './hostedPaymentGateway.interfaces';
import { Payment } from './payment.entity';
import { PaymentProvider } from './paymentProvider.enum';

/** Resultado consultado no provedor e os dados locais usados para validar a mesma tentativa. */
export interface HostedPaymentObservation {
  request: HostedPaymentRequest;
  provider: PaymentProvider;
  externalReference: string;
  outcome: HostedPaymentOutcome;
}

/** Projeção do timestamp autoritativo retornado pela conexão PostgreSQL. */
export interface DatabaseTimestampRow {
  now: Date;
}

/** Resultado da criação ou recuperação idempotente de uma tentativa de pagamento. */
export interface PaymentInitiation {
  payment: Payment;
  created: boolean;
}

export interface SimulatedPixPaymentInitiation {
  payment: Payment;
  qrCodePayload: string | null;
}

export interface HostedCheckout {
  payment: Payment;
  checkoutUrl: string | null;
  canResume: boolean;
}

/** Projeção mínima retornada pelo PostgreSQL para cada EventSeat vendido. */
export interface SoldEventSeatRow {
  id: string;
}

/** Resultado interno necessário para responder e publicar uma venda depois do commit. */
export interface PaymentFinalizationResult {
  payment: Payment;
  eventId: string | null;
  soldEventSeatIds: string[];
}
