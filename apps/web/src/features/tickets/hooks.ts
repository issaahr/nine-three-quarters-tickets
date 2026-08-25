import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cancelTicketPurchase, fetchSharedTicket, fetchTickets } from './api';
import { TicketsFilters } from './types';

/** Mantém a listagem paginada de Tickets no cache por compra. */
export function useTickets(filters?: TicketsFilters) {
  return useInfiniteQuery({
    queryKey: ['tickets', 'owned', filters],
    queryFn: ({ pageParam }) => fetchTickets({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.page + 1 : undefined),
    retry: false,
  });
}

export function useCancelTicketPurchase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelTicketPurchase,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets', 'owned'] }),
  });
}

/** Mantém a apresentação compartilhável atualizada pela credencial, sem depender do estado local. */
export function useSharedTicket(credential: string | undefined) {
  return useQuery({
    queryKey: ['tickets', 'shared', credential],
    queryFn: () => fetchSharedTicket(credential!),
    enabled: Boolean(credential),
    retry: false,
  });
}
