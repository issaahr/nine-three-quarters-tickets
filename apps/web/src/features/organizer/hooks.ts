import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createMovieEvent,
  fetchPopularMovies,
  fetchOrganizerEvents,
  fetchVenues,
  publishEvent,
  searchCatalogMovies,
} from './api';

export const organizerEventsQueryKey = ['organizer', 'events'] as const;
const venuesQueryKey = ['venues'] as const;

export function useOrganizerEvents() {
  return useQuery({
    queryKey: organizerEventsQueryKey,
    queryFn: fetchOrganizerEvents,
  });
}

export function useVenues() {
  return useQuery({ queryKey: venuesQueryKey, queryFn: fetchVenues, staleTime: 1000 * 60 * 10 });
}

export function useMovieCatalog(query?: string) {
  return useInfiniteQuery({
    queryKey: ['catalog', 'movies', query ?? 'popular'],
    queryFn: ({ pageParam }) =>
      query ? searchCatalogMovies(query, pageParam) : fetchPopularMovies(pageParam),
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

export function usePublishEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: publishEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: organizerEventsQueryKey }),
  });
}
