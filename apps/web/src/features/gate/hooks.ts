import { useMutation, useQuery } from '@tanstack/react-query';

import { checkInCredential, checkInManualCode, fetchGateEvents } from './api';

export const gateEventsQueryKey = ['gate', 'events'] as const;

export function useGateEvents() {
  return useQuery({ queryKey: gateEventsQueryKey, queryFn: fetchGateEvents });
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
