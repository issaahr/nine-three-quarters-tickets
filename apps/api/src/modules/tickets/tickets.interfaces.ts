import { AdmissionMode } from '../events/admissionMode.enum';
import { EventCategory } from '../events/eventCategory.enum';
import { TicketStatus } from './ticketStatus.enum';

/** Dados locais da ocorrência necessários para apresentar um Ticket. */
export interface TicketEventDetails {
  id: string;
  title: string;
  category: EventCategory;
  admissionMode: AdmissionMode;
  startsAt: Date;
  venueName: string;
  venueCity: string;
  venueTimeZone: string;
}

/** Ticket individual preparado para apresentação autenticada ou compartilhada. */
export interface TicketDetails {
  publicId: string;
  credential: string;
  manualCode: string;
  status: TicketStatus;
  issuedAt: Date;
  seatLabel: string | null;
  event: TicketEventDetails;
}

/** Compra confirmada com seus Tickets independentes. */
export interface TicketPurchase {
  reservationId: string;
  confirmedAt: Date;
  event: TicketEventDetails;
  tickets: TicketDetails[];
}
