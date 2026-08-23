import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createMovieEvent,
  createShowEvent,
  fetchPopularMovies,
  fetchRelevantAttractions,
  fetchOrganizerEvents,
  fetchVenues,
  publishEvent,
  updateEventPrice,
  cancelOrganizerEvent,
  searchCatalogMovies,
  searchCatalogAttractions,
} from './api';
import { AdmissionMode, EventCategory } from '../events/types';

export const organizerEventsQueryKey = ['organizer', 'events'] as const;
const venuesQueryKey = ['venues'] as const;

export function useOrganizerEvents() {
  return useQuery({
    queryKey: organizerEventsQueryKey,
    queryFn: fetchOrganizerEvents,
  });
}

export function useVenues(category: EventCategory) {
  const admissionMode =
    category === EventCategory.Show ? AdmissionMode.GeneralAdmission : AdmissionMode.Seated;

  return useQuery({
    queryKey: [...venuesQueryKey, admissionMode],
    queryFn: () => fetchVenues(admissionMode),
    staleTime: 1000 * 60 * 10,
  });
}

export function useCatalog(category: EventCategory, query?: string) {
  return useInfiniteQuery({
    queryKey: ['catalog', category, query ?? 'popular'],
    queryFn: ({ pageParam }) =>
      category === EventCategory.Show
        ? query
          ? searchCatalogAttractions(query, pageParam)
          : fetchRelevantAttractions(pageParam)
        : query
          ? searchCatalogMovies(query, pageParam)
          : fetchPopularMovies(pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    retry: false,
  });
}

export function useCreateMovieEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createMovieEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: organizerEventsQueryKey }),
  });
}

export function useCreateShowEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createShowEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: organizerEventsQueryKey }),
  });
}

export function usePublishEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: publishEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: organizerEventsQueryKey }),
  });
}

export function useUpdateEventPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ eventId, priceCents }: { eventId: string; priceCents: number }) =>
      updateEventPrice(eventId, priceCents),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: organizerEventsQueryKey }),
  });
}

export function useCancelOrganizerEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelOrganizerEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: organizerEventsQueryKey }),
  });
}
