import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { ReservationDetail, ReservationStatus } from '../reservations/types';
import { createCardPayment } from './api';
import { CardPaymentFormValues } from './schemas';
import { Payment, PaymentStatus } from './types';

interface UseCardPaymentOptions {
  reservationId: string;
  eventId: string;
}

/**
 * Mantém a chave estável em retry técnico e delega a idempotência definitiva à API.
 */
export function useCardPayment({ reservationId, eventId }: UseCardPaymentOptions) {
  const queryClient = useQueryClient();
  const idempotencyKeyRef = useRef<string | null>(null);
  const submittingRef = useRef(false);
  const paymentMutation = useMutation({
    mutationFn: ({
      idempotencyKey,
      data,
    }: {
      idempotencyKey: string;
      data: CardPaymentFormValues;
    }) =>
      createCardPayment(reservationId, idempotencyKey, {
        ...data,
        cardNumber: data.cardNumber.replace(/\s+/g, ''),
      }),
    onSuccess: async (payment) => {
      if (payment.status === PaymentStatus.Approved) {
        queryClient.setQueryData<ReservationDetail | undefined>(
          ['reservations', 'detail', reservationId],
          (reservation) =>
            reservation
              ? {
                  ...reservation,
                  status: ReservationStatus.Confirmed,
                  confirmedAt: payment.approvedAt,
                }
              : reservation,
        );
        await queryClient.invalidateQueries({ queryKey: ['events', 'seat-map', eventId] });
      }
    },
  });

  const submit = async (data: CardPaymentFormValues): Promise<Payment | undefined> => {
    if (submittingRef.current) {
      return;
    }

    submittingRef.current = true;
    idempotencyKeyRef.current ??= crypto.randomUUID();

    try {
      const payment = await paymentMutation.mutateAsync({
        idempotencyKey: idempotencyKeyRef.current,
        data,
      });

      if (payment.status === PaymentStatus.Declined || payment.status === PaymentStatus.Failed) {
        idempotencyKeyRef.current = null;
      }

      return payment;
    } finally {
      submittingRef.current = false;
    }
  };

  return {
    submit,
    payment: paymentMutation.data,
    error: paymentMutation.error,
    isPaying: paymentMutation.isPending,
  };
}
