/** Estado derivado da Reservation, sem duplicar uma coluna temporal persistida. */
export enum ReservationStatus {
  Active = 'ACTIVE',
  Confirmed = 'CONFIRMED',
  Cancelled = 'CANCELLED',
  Expired = 'EXPIRED',
}
