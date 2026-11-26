import axios from 'axios';

import { api } from '@/lib/api';
import { CardPaymentRequest, Payment, SimulatedPixPayment } from './types';

export async function createCardPayment(
  reservationId: string,
  idempotencyKey: string,
  request: CardPaymentRequest,
): Promise<Payment> {
  const response = await api.post<Payment>(
    `/reservations/${reservationId}/payments/card`,
    request,
    {
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );

  return response.data;
}

export async function createSimulatedPixPayment(
  reservationId: string,
  idempotencyKey: string,
): Promise<SimulatedPixPayment> {
  const response = await api.post<SimulatedPixPayment>(
    `/reservations/${reservationId}/payments/pix`,
    undefined,
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return response.data;
}

/** Uma reserva sem tentativa PIX é um estado esperado ao abrir o checkout. */
export async function fetchSimulatedPixPayment(
  reservationId: string,
  signal: AbortSignal,
): Promise<SimulatedPixPayment | null> {
  try {
    const response = await api.get<SimulatedPixPayment>(
      `/reservations/${reservationId}/payments/pix`,
      { signal },
    );
    return response.data;
  } catch (error) {
    if (
      axios.isAxiosError<{ code?: string }>(error) &&
      error.response?.status === 404 &&
      error.response.data?.code === 'PAYMENT_NOT_FOUND'
    ) {
      return null;
    }
    throw error;
  }
}

export async function settleSimulatedPixPayment(
  reservationId: string,
  paymentId: string,
  signal: AbortSignal,
): Promise<SimulatedPixPayment> {
  const response = await api.post<SimulatedPixPayment>(
    `/reservations/${reservationId}/payments/pix/${paymentId}/settle`,
    undefined,
    { signal },
  );
  return response.data;
}
