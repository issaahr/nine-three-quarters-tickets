export enum EventCategory {
  Movie = 'MOVIE',
  Show = 'SHOW',
}

export enum AdmissionMode {
  Seated = 'SEATED',
  GeneralAdmission = 'GENERAL_ADMISSION',
}

export enum EventStatus {
  Draft = 'DRAFT',
  Published = 'PUBLISHED',
  Cancelled = 'CANCELLED',
}

export interface EventDiscoveryItem {
  id: string;
  title: string;
  description?: string;
  imageUrl?: string;
  genres: string[];
  category: EventCategory;
  admissionMode: AdmissionMode;
  startsAt: string;
  priceCents: number;
  venueName: string;
  venueCity: string;
  venueTimeZone: string;
}

export interface EventDiscoveryPage {
  items: EventDiscoveryItem[];
  page: number;
  hasMore: boolean;
}

export interface EventDetail extends EventDiscoveryItem {
  status: EventStatus;
  isPast: boolean;
}

export interface EventDiscoveryFilters {
  query?: string;
  category?: EventCategory;
  genre?: string;
  city?: string;
  dateFrom?: string;
  dateTo?: string;
}
