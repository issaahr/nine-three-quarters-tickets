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
