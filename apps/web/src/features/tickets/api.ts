import { api } from '../../lib/api';
import { SharedTicket, TicketPurchase } from './types';

/** Carrega somente as compras confirmadas pertencentes ao CUSTOMER autenticado. */
export async function fetchTickets(reservationId?: string): Promise<TicketPurchase[]> {
  const response = await api.get<TicketPurchase[]>('/tickets', { params: { reservationId } });
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
