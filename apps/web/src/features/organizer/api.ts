import { api } from '../../lib/api';
import {
  CatalogPage,
  CreatedMovieEvent,
  CreateMovieEventRequest,
  OrganizerEvent,
  Venue,
} from './types';

export async function fetchOrganizerEvents(): Promise<OrganizerEvent[]> {
  const response = await api.get<OrganizerEvent[]>('/organizer/me/events');
  return response.data;
}

export async function fetchVenues(): Promise<Venue[]> {
  const response = await api.get<Venue[]>('/venues');
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

export async function createMovieEvent(
  request: CreateMovieEventRequest,
): Promise<CreatedMovieEvent> {
  const response = await api.post<CreatedMovieEvent>('/events/movies', request);
  return response.data;
}

export async function publishEvent(eventId: string): Promise<CreatedMovieEvent> {
  const response = await api.post<CreatedMovieEvent>(`/events/${eventId}/publish`);
  return response.data;
}
