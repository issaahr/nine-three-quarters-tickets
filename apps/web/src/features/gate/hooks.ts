import { useQuery } from '@tanstack/react-query';

import { fetchGateEvents } from './api';

export const gateEventsQueryKey = ['gate', 'events'] as const;

export function useGateEvents() {
  return useQuery({ queryKey: gateEventsQueryKey, queryFn: fetchGateEvents });
}
