import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { useEffect, useRef } from 'react';

import { useAuth } from '../auth/hooks';
import { ReservationDetail, ReservationStatus } from '../reservations/types';
import {
  createCardPayment,
  createHostedCheckout,
  createSimulatedPixPayment,
  fetchCheckoutConfiguration,
  fetchHostedCheckout,
  fetchSimulatedPixPayment,
  resumeHostedCheckout,
  settleSimulatedPixPayment,
} from './api';
import { CardPaymentFormValues } from './schemas';
import {
  HostedCheckoutPayment,
  Payment,
  PaymentMethod,
  PaymentStatus,
  SimulatedPixPayment,
} from './types';

interface UseCardPaymentOptions {
  reservationId: string;
  eventId: string;
}

interface UseSimulatedPixPaymentOptions extends UseCardPaymentOptions {
  isReservationActive: boolean;
}

const pixSettlementIntervalMilliseconds = 2_000;
const hostedCheckoutPollingIntervalMilliseconds = 5_000;

export function useCheckoutConfiguration(enabled: boolean) {
  const { user } = useAuth({ restoreSession: false });
  return useQuery({
    queryKey: ['payments', 'configuration', user?.id],
    queryFn: ({ signal }) => fetchCheckoutConfiguration(signal),
    enabled: enabled && Boolean(user),
  });
}

interface HostedCheckoutSubmission {
  method: PaymentMethod;
  idempotencyKey: string;
  previousPaymentId: string | undefined;
}

async function invalidateCheckoutResult(
  queryClient: QueryClient,
  reservationId: string,
  eventId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['reservations', 'detail', reservationId] }),
    queryClient.invalidateQueries({ queryKey: ['reservations', 'active', eventId] }),
    queryClient.invalidateQueries({ queryKey: ['tickets', 'owned'] }),
    queryClient.invalidateQueries({ queryKey: ['events', 'detail', eventId] }),
    queryClient.invalidateQueries({ queryKey: ['events', 'seat-map', eventId] }),
  ]);
}

/**
 * Reidrata a tentativa da API ao abrir a página e mantém a chave da primeira criação em falhas técnicas.
 * A consulta apenas acompanha a conciliação do backend. Somente uma ação explícita cria ou retoma.
 */
export function useHostedCheckout({ reservationId, eventId }: UseCardPaymentOptions) {
  const queryClient = useQueryClient();
  const { user } = useAuth({ restoreSession: false });
  const submission = useRef<HostedCheckoutSubmission | null>(null);
  const submitting = useRef(false);
  const queryKey = ['payments', 'hosted', user?.id, reservationId] as const;
  const paymentQuery = useQuery({
    queryKey,
    enabled: Boolean(user),
    queryFn: ({ signal }) => fetchHostedCheckout(reservationId, signal),
    refetchInterval: (query) =>
      query.state.data?.status === PaymentStatus.Pending
        ? hostedCheckoutPollingIntervalMilliseconds
        : false,
    retry: false,
  });

  const operation = useMutation({
    mutationFn: (attempt: HostedCheckoutSubmission | string) =>
      typeof attempt === 'string'
        ? resumeHostedCheckout(reservationId, attempt)
        : createHostedCheckout(reservationId, attempt.method, attempt.idempotencyKey),
    onSuccess: async (payment) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData(queryKey, payment);
      submission.current = null;
      if (payment.status === PaymentStatus.Pending && !payment.checkoutUrl && !payment.canResume) {
        await queryClient.invalidateQueries({
          queryKey: ['reservations', 'detail', reservationId],
        });
      }
    },
    onError: async () => {
      // O POST pode ter persistido a tentativa antes de falhar. Releia antes de habilitar outra ação.
      await Promise.all([
        paymentQuery.refetch(),
        queryClient.invalidateQueries({ queryKey: ['reservations', 'detail', reservationId] }),
      ]);
    },
  });

  const payment = paymentQuery.data;
  const paymentId = payment?.id;
  const paymentStatus = payment?.status;
  useEffect(() => {
    if (!paymentId || paymentStatus === PaymentStatus.Pending) return;

    void invalidateCheckoutResult(queryClient, reservationId, eventId);
  }, [eventId, paymentId, paymentStatus, queryClient, reservationId]);

  const submit = async (
    method: PaymentMethod,
    resumePaymentId?: string,
  ): Promise<HostedCheckoutPayment | undefined> => {
    if (submitting.current || !paymentQuery.isSuccess) return;
    const latest = queryClient.getQueryData<HostedCheckoutPayment | null>(queryKey);
    if (latest === undefined || latest?.status === PaymentStatus.Approved) return;

    submitting.current = true;
    try {
      if (resumePaymentId) {
        // A URL exibida pode ter ficado obsoleta. O POST confirma a mesma tentativa antes de navegar.
        if (
          latest?.id !== resumePaymentId ||
          latest.status !== PaymentStatus.Pending ||
          (!latest.canResume && !latest.checkoutUrl)
        ) {
          return;
        }
        return await operation.mutateAsync(resumePaymentId);
      }
      if (latest?.status === PaymentStatus.Pending) return;
      if (submission.current?.previousPaymentId !== latest?.id) submission.current = null;
      submission.current ??= {
        method,
        idempotencyKey: crypto.randomUUID(),
        previousPaymentId: latest?.id,
      };
      return await operation.mutateAsync(submission.current);
    } finally {
      submitting.current = false;
    }
  };

  return {
    submit,
    payment,
    paymentQuery,
    isSubmitting: operation.isPending,
    submissionError: operation.error,
    uncertainMethod:
      operation.isError &&
      typeof operation.variables !== 'string' &&
      operation.variables?.previousPaymentId === paymentId
        ? operation.variables?.method
        : undefined,
  };
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

    void invalidateCheckoutResult(queryClient, reservationId, eventId);
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
