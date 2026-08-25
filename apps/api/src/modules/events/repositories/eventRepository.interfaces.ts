import { Event } from '../event.entity';
import { EventCategory } from '../eventCategory.enum';
import { EventStatus } from '../eventStatus.enum';

export interface EventDiscoveryFilters {
  query?: string;
  category?: EventCategory;
  genre?: string;
  city?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: 'recent' | 'oldest';
  page: number;
}

export interface EventDiscoveryPage {
  events: Event[];
  page: number;
  hasMore: boolean;
}

export interface PublicEventDetail {
  event: Event;
  isPast: boolean;
  availableQuantity: number | null;
}

export interface OrganizerEventsFilters {
  page: number;
  query?: string;
  category?: EventCategory;
  status?: EventStatus;
  dateFrom?: string;
  dateTo?: string;
  sort?: 'recent' | 'oldest';
}

export interface OrganizerEventsPage {
  items: OrganizerEventWithStats[];
  page: number;
  hasMore: boolean;
}

export interface OrganizerEventWithStats {
  event: Event;
  isActive: boolean;
  soldTickets: number;
  availableTickets: number | null;
  inventoryTotal: number | null;
  revenueCents: number;
}

export interface GateEventsFilters {
  page: number;
  today?: boolean;
}

export interface GateEventsPage {
  events: Event[];
  page: number;
  hasMore: boolean;
}

export interface EventCancellationResult {
  event: Event;
  releasedEventSeatIds: string[];
}
