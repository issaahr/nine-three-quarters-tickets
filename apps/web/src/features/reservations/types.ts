export enum ReservationStatus {
  Active = 'ACTIVE',
  Confirmed = 'CONFIRMED',
  Cancelled = 'CANCELLED',
  Expired = 'EXPIRED',
}

export interface ReservationItem {
  id: string;
  eventSeatId: string;
  unitPriceCents: number;
}

export interface ReservationDetail {
  id: string;
  eventId: string;
  status: ReservationStatus;
  expiresAt: string;
  confirmedAt: string | null;
  cancelledAt: string | null;
  items: ReservationItem[];
}

export interface CreateReservationRequest {
  eventId: string;
  eventSeatIds: string[];
}

export interface CreatedReservation {
  id: string;
  eventId: string;
  expiresAt: string;
  items: ReservationItem[];
}
