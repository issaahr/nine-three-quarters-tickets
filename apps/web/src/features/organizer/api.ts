import { api } from '@/lib/api';
import {
  CatalogPage,
  CreatedEvent,
  CreateMovieEventRequest,
  CreateShowEventRequest,
  OrganizerEvent,
  OrganizerEventsFilters,
  OrganizerEventsPage,
  Venue,
} from './types';
import { AdmissionMode } from '../events/types';

export async function fetchOrganizerEvents(
  filters?: OrganizerEventsFilters,
): Promise<OrganizerEventsPage> {
  const response = await api.get<OrganizerEventsPage>('/organizer/me/events', {
    params: {
      page: filters?.page,
    },
  });
  return response.data;
}

export async function fetchVenues(admissionMode: AdmissionMode): Promise<Venue[]> {
  const response = await api.get<Venue[]>('/venues', { params: { admissionMode } });
  return response.data;
}

export async function searchCatalogMovies(query: string, page: number): Promise<CatalogPage> {
  const response = await api.get<CatalogPage>('/catalog/movies', { params: { query, page } });
  return response.data;
}

export async function fetchPopularMovies(page: number): Promise<CatalogPage> {
  const response = await api.get<CatalogPage>('/catalog/movies/popular', { params: { page } });
  return response.data;
}

export async function searchCatalogAttractions(query: string, page: number): Promise<CatalogPage> {
  const response = await api.get<CatalogPage>('/catalog/attractions', {
    params: { query, page },
  });
  return response.data;
}

export async function fetchPopularAttractions(page: number): Promise<CatalogPage> {
  const response = await api.get<CatalogPage>('/catalog/attractions/popular', {
    params: { page },
  });
  return response.data;
}

export async function createMovieEvent(request: CreateMovieEventRequest): Promise<CreatedEvent> {
  const response = await api.post<CreatedEvent>('/events/movies', request);
  return response.data;
}

export async function createShowEvent(request: CreateShowEventRequest): Promise<CreatedEvent> {
  const response = await api.post<CreatedEvent>('/events/shows', request);
  return response.data;
}

export async function publishEvent(eventId: string): Promise<CreatedEvent> {
  const response = await api.post<CreatedEvent>(`/events/${eventId}/publish`);
  return response.data;
}

export async function updateEventPrice(
  eventId: string,
  priceCents: number,
): Promise<OrganizerEvent> {
  const response = await api.patch<OrganizerEvent>(`/organizer/me/events/${eventId}/price`, {
    priceCents,
  });
  return response.data;
}

export async function cancelOrganizerEvent(eventId: string): Promise<OrganizerEvent> {
  const response = await api.post<OrganizerEvent>(`/organizer/me/events/${eventId}/cancel`);
  return response.data;
}
