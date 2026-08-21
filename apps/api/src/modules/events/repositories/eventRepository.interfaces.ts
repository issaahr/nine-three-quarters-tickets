import { Event } from '../event.entity';
import { EventCategory } from '../eventCategory.enum';

export interface EventDiscoveryFilters {
  query?: string;
  category?: EventCategory;
  genre?: string;
  city?: string;
  dateFrom?: string;
  dateTo?: string;
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
}
