import axios from 'axios';

import { api } from '@/lib/api';
import {
  CardPaymentRequest,
  HostedCheckoutPayment,
  Payment,
  PaymentCheckoutConfiguration,
  PaymentMethod,
  SimulatedPixPayment,
} from './types';

export async function fetchCheckoutConfiguration(
  signal: AbortSignal,
): Promise<PaymentCheckoutConfiguration> {
  const response = await api.get<PaymentCheckoutConfiguration>('/payments/configuration', {
    signal,
  });
  return response.data;
}

function hostedCheckoutPath(reservationId: string): string {
  return `/reservations/${reservationId}/payments/hosted`;
}

/** A API distingue a falta de tentativa de falhas de acesso, rede ou conciliação. */
export async function fetchHostedCheckout(
  reservationId: string,
  signal: AbortSignal,
): Promise<HostedCheckoutPayment | null> {
  try {
    const response = await api.get<HostedCheckoutPayment>(hostedCheckoutPath(reservationId), {
      signal,
    });
    return response.data;
  } catch (error) {
    if (isPaymentNotFound(error)) return null;
    throw error;
  }
}

export async function createHostedCheckout(
  reservationId: string,
  method: PaymentMethod,
  idempotencyKey: string,
): Promise<HostedCheckoutPayment> {
  const response = await api.post<HostedCheckoutPayment>(
    hostedCheckoutPath(reservationId),
    { method },
    { headers: { 'Idempotency-Key': idempotencyKey } },
  );
  return response.data;
}

export async function resumeHostedCheckout(
  reservationId: string,
  paymentId: string,
): Promise<HostedCheckoutPayment> {
  const response = await api.post<HostedCheckoutPayment>(
    `${hostedCheckoutPath(reservationId)}/${paymentId}/resume`,
  );
  return response.data;
}

/** A rejeição do total ocorre antes de criar uma tentativa e permite escolher outro método. */
export function isCheckoutAmountUnsupported(error: unknown): boolean {
  return (
    axios.isAxiosError<{ code?: string }>(error) &&
    error.response?.status === 422 &&
    error.response.data?.code === 'PAYMENT_AMOUNT_UNSUPPORTED'
  );
}

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
    if (isPaymentNotFound(error)) return null;
    throw error;
  }
}

function isPaymentNotFound(error: unknown): boolean {
  return (
    axios.isAxiosError<{ code?: string }>(error) &&
    error.response?.status === 404 &&
    error.response.data?.code === 'PAYMENT_NOT_FOUND'
  );
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
