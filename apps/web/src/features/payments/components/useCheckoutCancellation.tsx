import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useReservationMutations } from '../../reservations/hooks';

interface CheckoutCancellationOptions {
  reservationId: string;
  eventId: string;
  isGeneralAdmission: boolean;
  disabled: boolean;
}

export function useCheckoutCancellation({
  reservationId,
  eventId,
  isGeneralAdmission,
  disabled,
}: CheckoutCancellationOptions) {
  const { cancel, cancelError, isCancelling } = useReservationMutations(eventId);
  const [isOpen, setIsOpen] = useState(false);
  const canCancel = !isCancelling && !disabled;

  const confirmCancellation = async (): Promise<void> => {
    try {
      await cancel(reservationId);
      setIsOpen(false);
    } catch {
      // O erro da mutation permanece disponível para uma nova tentativa de cancelamento.
    }
  };

  return {
    isBlockingPayment: isOpen || isCancelling,
    action: (
      <Button
        type="button"
        variant="outline"
        disabled={!canCancel}
        onClick={() => setIsOpen(true)}
        className="h-auto rounded-[4px] border-border py-3 text-sm font-semibold"
      >
        Cancelar reserva
      </Button>
    ),
    confirmation: (
      <>
        {isOpen && (
          <div className="mt-4 border border-border bg-muted p-4" role="alert">
            <p className="m-0 text-sm leading-6">
              {isGeneralAdmission
                ? 'Cancelar esta reserva libera os ingressos imediatamente. Deseja continuar?'
                : 'Cancelar esta reserva libera os assentos imediatamente. Deseja continuar?'}
            </p>
            <div className="mt-3 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={isCancelling}
                className="rounded-[4px]"
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void confirmCancellation()}
                disabled={!canCancel}
                className="rounded-[4px]"
              >
                {isCancelling ? 'Cancelando...' : 'Confirmar cancelamento'}
              </Button>
            </div>
          </div>
        )}
        {cancelError && (
          <p role="alert" className="mb-0 mt-4 text-sm text-destructive">
            Não foi possível cancelar a reserva. Tente novamente.
          </p>
        )}
      </>
    ),
  };
}
