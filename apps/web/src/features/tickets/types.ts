import { AdmissionMode, EventCategory } from '../events/types';

export enum TicketStatus {
  Valid = 'VALID',
  Used = 'USED',
  Cancelled = 'CANCELLED',
}

export interface TicketEvent {
  id: string;
  title: string;
  category: EventCategory;
  admissionMode: AdmissionMode;
  startsAt: string;
  venueName: string;
  venueCity: string;
  venueTimeZone: string;
}

export interface TicketItem {
  publicId: string;
  credential: string;
  manualCode: string;
  status: TicketStatus;
  issuedAt: string;
  seatLabel: string | null;
}

/** Representa uma compra confirmada e os Tickets que ela emitiu individualmente. */
export interface TicketPurchase {
  reservationId: string;
  confirmedAt: string;
  event: TicketEvent;
  tickets: TicketItem[];
  canCancel?: boolean;
  eligibleUntil?: string | null;
  paymentMethod?: 'CARD' | null;
}

export interface TicketsFilters {
  page?: number;
  reservationId?: string;
}

export interface TicketPurchasesPage {
  items: TicketPurchase[];
  page: number;
  hasMore: boolean;
}

export interface SharedTicket extends TicketItem {
  event: TicketEvent;
}
