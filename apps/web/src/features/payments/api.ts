import { api } from '@/lib/api';
import { CardPaymentRequest, Payment } from './types';

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
