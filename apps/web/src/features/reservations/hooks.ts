import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelReservation,
  createGeneralAdmissionReservation,
  createReservation,
  fetchActiveReservation,
  fetchReservation,
} from './api';
import {
  CreatedReservation,
  CreateGeneralAdmissionReservationRequest,
  CreateReservationRequest,
  ReservationDetail,
  ReservationStatus,
} from './types';

const activeReservationQueryKey = (eventId: string | undefined) =>
  ['reservations', 'active', eventId] as const;

export function useActiveReservation(eventId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: activeReservationQueryKey(eventId),
    queryFn: () => fetchActiveReservation(eventId!),
    enabled: Boolean(eventId) && enabled,
    retry: false,
  });
}

export function useReservation(reservationId: string | undefined) {
  return useQuery({
    queryKey: ['reservations', 'detail', reservationId],
    queryFn: () => fetchReservation(reservationId!),
    enabled: Boolean(reservationId),
    retry: false,
  });
}

/** Coordena criação e cancelamento de holds e atualiza as projeções locais de inventário. */
export function useReservationMutations(eventId: string | undefined) {
  const queryClient = useQueryClient();

  const invalidateInventory = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['events', 'seat-map', eventId] }),
      queryClient.invalidateQueries({ queryKey: ['events', 'detail', eventId] }),
    ]);
  };
  const cacheActiveReservation = (reservation: CreatedReservation): void => {
    const activeReservation: ReservationDetail = {
      ...reservation,
      status: ReservationStatus.Active,
      confirmedAt: null,
      cancelledAt: null,
    };
    queryClient.setQueryData(activeReservationQueryKey(eventId), activeReservation);
  };
  const createSeatedMutation = useMutation({
    mutationFn: createReservation,
    onSuccess: cacheActiveReservation,
    onSettled: invalidateInventory,
  });
  const createGeneralAdmissionMutation = useMutation({
    mutationFn: createGeneralAdmissionReservation,
    onSuccess: cacheActiveReservation,
    onSettled: invalidateInventory,
  });
  const cancelMutation = useMutation({
    mutationFn: cancelReservation,
    onSuccess: (reservation: ReservationDetail) => {
      queryClient.setQueryData(activeReservationQueryKey(eventId), null);
      queryClient.setQueryData(['reservations', 'detail', reservation.id], reservation);
    },
    onSettled: invalidateInventory,
  });

  return {
    createSeated: (request: CreateReservationRequest) => createSeatedMutation.mutateAsync(request),
    createGeneralAdmission: (request: CreateGeneralAdmissionReservationRequest) =>
      createGeneralAdmissionMutation.mutateAsync(request),
    cancel: (reservationId: string) => cancelMutation.mutateAsync(reservationId),
    isCreating: createSeatedMutation.isPending || createGeneralAdmissionMutation.isPending,
    isCancelling: cancelMutation.isPending,
    createError: createSeatedMutation.error ?? createGeneralAdmissionMutation.error,
    cancelError: cancelMutation.error,
  };
}
