import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';

import { checkInCredential, checkInManualCode, fetchGateEvent, fetchGateEvents } from './api';
import { GateEventsFilters } from './types';

export function useGateEvents(filters?: GateEventsFilters) {
  return useInfiniteQuery({
    queryKey: ['gate', 'events', filters],
    queryFn: ({ pageParam }) => fetchGateEvents({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    retry: false,
  });
}

export function useGateEvent(eventId: string | undefined) {
  return useQuery({
    queryKey: ['gate', 'event', eventId],
    queryFn: () => fetchGateEvent(eventId!),
    enabled: Boolean(eventId),
    retry: false,
  });
}

export function useCheckInCredential() {
  return useMutation({
    mutationFn: ({ eventId, credential }: { eventId: string; credential: string }) =>
      checkInCredential(eventId, credential),
  });
}

export function useCheckInManualCode() {
  return useMutation({
    mutationFn: ({ eventId, manualCode }: { eventId: string; manualCode: string }) =>
      checkInManualCode(eventId, manualCode),
  });
}
