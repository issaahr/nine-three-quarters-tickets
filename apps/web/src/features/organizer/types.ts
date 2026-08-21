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
}

export interface CreateMovieEventRequest {
  externalId: string;
  venueId: string;
  startsAtLocal: string;
  priceCents: number;
}

export interface CreatedMovieEvent {
  id: string;
  status: EventStatus;
}
