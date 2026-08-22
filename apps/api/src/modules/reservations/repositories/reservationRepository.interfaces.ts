import { ReservationItem } from '../reservationItem.entity';
import { Reservation } from '../reservation.entity';
import { ReservationStatus } from '../reservationStatus.enum';

/**
 * Reservation com itens e estado temporal calculado pelo PostgreSQL.
 */
export interface ReservationDetail {
  reservation: Reservation;
  items: ReservationItem[];
  status: ReservationStatus;
}

/** Parâmetros autoritativos da aquisição condicional de EventSeats por uma Reservation. */
export interface AcquireEventSeatsParameters {
  eventId: string;
  eventSeatIds: string[];
  reservationId: string;
  expiresAt: Date;
  now: Date;
}

/** Projeção mínima retornada pelo PostgreSQL para cada EventSeat liberado. */
export interface ReleasedEventSeatRow {
  id: string;
}

/** Resultado interno do cancelamento necessário para responder e publicar o delta pós-commit. */
export interface CancellationTransactionResult {
  detail: ReservationDetail;
  releasedEventSeatIds: string[];
}

/** Projeção do timestamp autoritativo retornado pela conexão PostgreSQL. */
export interface DatabaseTimestampRow {
  now: Date;
}
