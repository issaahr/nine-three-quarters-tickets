import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useRef } from 'react';

import { useAuth } from '../auth/hooks';
import { ReservationDetail, ReservationStatus } from '../reservations/types';
import {
  createCardPayment,
  createSimulatedPixPayment,
  fetchSimulatedPixPayment,
  settleSimulatedPixPayment,
} from './api';
import { CardPaymentFormValues } from './schemas';
import { Payment, PaymentMethod, PaymentStatus, SimulatedPixPayment } from './types';

interface UseCardPaymentOptions {
  reservationId: string;
  eventId: string;
}

interface UseSimulatedPixPaymentOptions extends UseCardPaymentOptions {
  isReservationActive: boolean;
}

const pixSettlementIntervalMilliseconds = 2_000;

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

/**
 * Retoma o PIX pelo estado da API e solicita a conclusão enquanto a tentativa estiver PENDING.
 * O intervalo só agenda consultas. A elegibilidade e o prazo são avaliados pelo backend.
 */
export function useSimulatedPixPayment({
  reservationId,
  eventId,
  isReservationActive,
}: UseSimulatedPixPaymentOptions) {
  const queryClient = useQueryClient();
  const { user } = useAuth({ restoreSession: false });
  const idempotencyKey = useRef<string | null>(null);
  const submitting = useRef(false);
  const queryKey = ['payments', 'pix', user?.id, reservationId] as const;
  const paymentQuery = useQuery<SimulatedPixPayment | null>({
    queryKey,
    enabled: (query) =>
      Boolean(user) && (isReservationActive || query.state.data?.status === PaymentStatus.Pending),
    queryFn: async ({ signal }): Promise<SimulatedPixPayment | null> => {
      const current = queryClient.getQueryData<SimulatedPixPayment | null>(queryKey);
      if (current?.status !== PaymentStatus.Pending) {
        return fetchSimulatedPixPayment(reservationId, signal);
      }

      const payment = await settleSimulatedPixPayment(reservationId, current.id, signal);
      if (payment.status !== PaymentStatus.Pending) idempotencyKey.current = null;
      return payment;
    },
    refetchInterval: (query) =>
      query.state.status !== 'error' && query.state.data?.status === PaymentStatus.Pending
        ? pixSettlementIntervalMilliseconds
        : false,
    retry: false,
  });

  const creation = useMutation({
    mutationFn: (key: string) => createSimulatedPixPayment(reservationId, key),
    onSuccess: async (payment) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      if (payment.method === PaymentMethod.Pix) {
        queryClient.setQueryData(queryKey, payment);
      } else {
        await paymentQuery.refetch();
      }
    },
    onError: async (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        await Promise.all([
          paymentQuery.refetch(),
          queryClient.invalidateQueries({ queryKey: ['reservations', 'detail', reservationId] }),
        ]);
      }
    },
  });

  const payment = paymentQuery.data;

  useEffect(() => {
    if (!payment || payment.status === PaymentStatus.Pending) return;

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ['reservations', 'detail', reservationId] }),
      queryClient.invalidateQueries({ queryKey: ['reservations', 'active', eventId] }),
      queryClient.invalidateQueries({ queryKey: ['tickets', 'owned'] }),
      queryClient.invalidateQueries({ queryKey: ['events', 'detail', eventId] }),
      queryClient.invalidateQueries({ queryKey: ['events', 'seat-map', eventId] }),
    ]);
  }, [eventId, payment, queryClient, reservationId]);

  const create = async (): Promise<void> => {
    if (submitting.current) return;

    submitting.current = true;
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      await creation.mutateAsync(idempotencyKey.current);
      idempotencyKey.current = null;
    } finally {
      submitting.current = false;
    }
  };

  return {
    create,
    payment,
    creationError: creation.error,
    queryError: paymentQuery.error,
    isChecking: paymentQuery.isLoading,
    isRefreshing: paymentQuery.isFetching,
    isCreating: creation.isPending,
    refresh: paymentQuery.refetch,
  };
}
