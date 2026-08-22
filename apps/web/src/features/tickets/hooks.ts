import { useQuery } from '@tanstack/react-query';

import { fetchSharedTicket, fetchTickets } from './api';

/** Mantém a listagem de Tickets no cache por compra quando há um filtro explícito. */
export function useTickets(reservationId?: string) {
  return useQuery({
    queryKey: ['tickets', 'owned', reservationId],
    queryFn: () => fetchTickets(reservationId),
    retry: false,
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
