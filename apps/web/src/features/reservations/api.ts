import { api } from '../../lib/api';
import { CreatedReservation, CreateReservationRequest, ReservationDetail } from './types';

/**
 * Cria o hold autoritativo dos assentos escolhidos pelo CUSTOMER.
 *
 * @param request - Evento e assentos escolhidos como intenção de reserva.
 * @returns Snapshot da Reservation recém-criada.
 */
export async function createReservation(
  request: CreateReservationRequest,
): Promise<CreatedReservation> {
  const response = await api.post<CreatedReservation>('/reservations', request);
  return response.data;
}

/**
 * Consulta a Reservation ACTIVE do CUSTOMER para uma ocorrência, sem confiar no estado local.
 *
 * @param eventId - Identificador da ocorrência consultada.
 * @returns Reservation ativa ou null quando não existir uma.
 */
export async function fetchActiveReservation(eventId: string): Promise<ReservationDetail | null> {
  const response = await api.get<ReservationDetail>('/reservations/active', {
    params: { eventId },
  });

  return response.status === 204 ? null : response.data;
}

/**
 * Cancela explicitamente uma Reservation ACTIVE e devolve o inventário à API.
 *
 * @param reservationId - Identificador da Reservation que será cancelada.
 * @returns Snapshot da Reservation após o cancelamento.
 */
export async function cancelReservation(reservationId: string): Promise<ReservationDetail> {
  const response = await api.post<ReservationDetail>(`/reservations/${reservationId}/cancel`);
  return response.data;
}
