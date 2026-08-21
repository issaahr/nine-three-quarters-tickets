import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { fetchEventDetail, fetchEventDiscovery } from './api';
import { EventDiscoveryFilters } from './types';

/**
 * Mantém filtros e páginas na mesma chave remota para reiniciar o catálogo a cada nova consulta.
 */
export function useEventDiscovery(filters: EventDiscoveryFilters) {
  return useInfiniteQuery({
    queryKey: ['events', 'discovery', filters],
    queryFn: ({ pageParam }) => fetchEventDiscovery(filters, pageParam),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    retry: false,
  });
}

/** Mantém cada ocorrência isolada no cache pelo identificador persistido. */
export function useEventDetail(eventId: string | undefined) {
  return useQuery({
    queryKey: ['events', 'detail', eventId],
    queryFn: () => fetchEventDetail(eventId!),
    enabled: Boolean(eventId),
    retry: false,
  });
}
