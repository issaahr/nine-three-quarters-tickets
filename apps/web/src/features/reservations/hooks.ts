import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { cancelReservation, createReservation, fetchActiveReservation } from './api';
import {
  CreatedReservation,
  CreateReservationRequest,
  ReservationDetail,
  ReservationStatus,
} from './types';

const activeReservationQueryKey = (eventId: string | undefined) =>
  ['reservations', 'active', eventId] as const;

/** Mantém a Reservation ACTIVE no cache remoto, que é a fonte de verdade para a retomada do fluxo. */
export function useActiveReservation(eventId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: activeReservationQueryKey(eventId),
    queryFn: () => fetchActiveReservation(eventId!),
    enabled: Boolean(eventId) && enabled,
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
    onSuccess: () => {
      queryClient.setQueryData(activeReservationQueryKey(eventId), null);
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
