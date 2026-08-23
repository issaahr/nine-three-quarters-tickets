import { AdmissionMode, EventCategory, EventStatus } from '../events/types';

export { EventStatus } from '../events/types';

export interface CatalogItem {
  source: string;
  externalId: string;
  category: EventCategory;
  title: string;
  description?: string;
  imageUrl?: string;
  genres: string[];
}

export interface CatalogPage {
  items: CatalogItem[];
  page: number;
  hasMore: boolean;
}

export interface Venue {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  country: string;
  timeZone: string;
  admissionMode: AdmissionMode;
}

export interface OrganizerEvent {
  id: string;
  venueId: string;
  venueName: string;
  venueCity: string;
  venueTimeZone: string;
  title: string;
  description?: string;
  imageUrl?: string;
  genres: string[];
  category: EventCategory;
  admissionMode: AdmissionMode;
  status: EventStatus;
  startsAt: string;
  priceCents: number;
  isActive: boolean;
  soldTickets: number;
  availableTickets: number | null;
  inventoryTotal: number | null;
  revenueCents: number;
}

export interface CreateMovieEventRequest {
  externalId: string;
  venueId: string;
  startsAtLocal: string;
  priceCents: number;
}

export interface CreateShowEventRequest extends CreateMovieEventRequest {
  capacity: number;
}

export interface CreatedEvent {
  id: string;
  status: EventStatus;
}
