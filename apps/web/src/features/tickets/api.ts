import { api } from '@/lib/api';
import { SharedTicket, TicketPurchasesPage, TicketsFilters } from './types';

/** Carrega compras confirmadas pertencentes ao CUSTOMER autenticado com paginação. */
export async function fetchTickets(filters?: TicketsFilters): Promise<TicketPurchasesPage> {
  const response = await api.get<TicketPurchasesPage>('/tickets', {
    params: {
      page: filters?.page,
      reservationId: filters?.reservationId,
    },
  });
  return response.data;
}

export async function cancelTicketPurchase(reservationId: string): Promise<void> {
  await api.post(`/reservations/${reservationId}/cancel`);
}

/** Consulta o estado atual de um Ticket por sua credencial bearer compartilhável. */
export async function fetchSharedTicket(credential: string): Promise<SharedTicket> {
  const response = await api.get<SharedTicket>(`/tickets/shared/${encodeURIComponent(credential)}`);
  return response.data;
}
