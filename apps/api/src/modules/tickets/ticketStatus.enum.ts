/** Estado atual de apresentação do Ticket, derivado de seus timestamps persistidos. */
export enum TicketStatus {
  Valid = 'VALID',
  Used = 'USED',
  Cancelled = 'CANCELLED',
}
