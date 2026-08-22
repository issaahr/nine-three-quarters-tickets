import { Payment } from './payment.entity';

/** Projeção do timestamp autoritativo retornado pela conexão PostgreSQL. */
export interface DatabaseTimestampRow {
  now: Date;
}

/** Resultado da criação ou recuperação idempotente de uma tentativa de pagamento. */
export interface PaymentInitiation {
  payment: Payment;
  shouldProcess: boolean;
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
