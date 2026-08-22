import { api } from '../../lib/api';
import { CreatedReservation, CreateReservationRequest, ReservationDetail } from './types';

export async function createReservation(
  request: CreateReservationRequest,
): Promise<CreatedReservation> {
  const response = await api.post<CreatedReservation>('/reservations', request);
  return response.data;
}

export async function fetchActiveReservation(eventId: string): Promise<ReservationDetail | null> {
  const response = await api.get<ReservationDetail>('/reservations/active', {
    params: { eventId },
  });

  return response.status === 204 ? null : response.data;
}

export async function fetchReservation(reservationId: string): Promise<ReservationDetail> {
  const response = await api.get<ReservationDetail>(`/reservations/${reservationId}`);
  return response.data;
}

export async function cancelReservation(reservationId: string): Promise<ReservationDetail> {
  const response = await api.post<ReservationDetail>(`/reservations/${reservationId}/cancel`);
  return response.data;
}
