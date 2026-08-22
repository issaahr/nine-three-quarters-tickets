import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  cancelReservation,
  createReservation,
  fetchActiveReservation,
  fetchReservation,
} from './api';
import {
  CreatedReservation,
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

/** Coordena criação e cancelamento de holds e invalida o mapa após toda alteração de inventário. */
export function useReservationMutations(eventId: string | undefined) {
  const queryClient = useQueryClient();

  const invalidateSeatMap = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['events', 'seat-map', eventId] });
  };
  const createMutation = useMutation({
    mutationFn: createReservation,
    onSuccess: (reservation: CreatedReservation) => {
      const activeReservation: ReservationDetail = {
        ...reservation,
        status: ReservationStatus.Active,
        confirmedAt: null,
        cancelledAt: null,
      };
      queryClient.setQueryData(activeReservationQueryKey(eventId), activeReservation);
    },
    onSettled: invalidateSeatMap,
  });
  const cancelMutation = useMutation({
    mutationFn: cancelReservation,
    onSuccess: (reservation: ReservationDetail) => {
      queryClient.setQueryData(activeReservationQueryKey(eventId), null);
      queryClient.setQueryData(['reservations', 'detail', reservation.id], reservation);
    },
    onSettled: invalidateSeatMap,
  });

  return {
    create: (request: CreateReservationRequest) => createMutation.mutateAsync(request),
    cancel: (reservationId: string) => cancelMutation.mutateAsync(reservationId),
    isCreating: createMutation.isPending,
    isCancelling: cancelMutation.isPending,
    createError: createMutation.error,
    cancelError: cancelMutation.error,
  };
}
