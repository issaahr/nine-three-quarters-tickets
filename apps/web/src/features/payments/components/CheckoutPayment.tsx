import { CreditCard, QrCode } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useReservationMutations } from '../../reservations/hooks';
import { useCardPayment, useSimulatedPixPayment } from '../hooks';
import { PaymentMethod, PaymentStatus } from '../types';
import { CardPaymentForm } from './CardPaymentForm';
import { SimulatedPixPanel } from './SimulatedPixPanel';

interface CheckoutPaymentProps {
  reservationId: string;
  eventId: string;
  totalPriceCents: number;
  isReservationActive: boolean;
  isGeneralAdmission: boolean;
}

export function CheckoutPayment({
  reservationId,
  eventId,
  totalPriceCents,
  isReservationActive,
  isGeneralAdmission,
}: CheckoutPaymentProps) {
  const card = useCardPayment({ reservationId, eventId });
  const pix = useSimulatedPixPayment({ reservationId, eventId, isReservationActive });
  const { cancel, cancelError, isCancelling } = useReservationMutations(eventId);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>();
  const [isCancellationOpen, setIsCancellationOpen] = useState(false);
  const isPixApproved = pix.payment?.status === PaymentStatus.Approved;
  const hasLivePix = pix.payment?.status === PaymentStatus.Pending || isPixApproved;
  const isCardInProgress = card.isPaying || card.payment?.status === PaymentStatus.Pending;
  const method = hasLivePix
    ? PaymentMethod.Pix
    : (selectedMethod ?? (pix.payment ? PaymentMethod.Pix : PaymentMethod.Card));
  const canCancel = !isCardInProgress && !pix.isCreating && !isCancelling && !isPixApproved;
  const canChangeMethod = !hasLivePix && canCancel && !isCancellationOpen;
  const isPaymentDisabled = isCancelling || isCancellationOpen;

  if (!isReservationActive) {
    return null;
  }

  const confirmCancellation = async (): Promise<void> => {
    try {
      await cancel(reservationId);
      setIsCancellationOpen(false);
    } catch {
      // O erro da mutation permanece disponível para uma nova tentativa de cancelamento.
    }
  };

  const cancelAction = (
    <Button
      type="button"
      variant="outline"
      disabled={!canCancel}
      onClick={() => setIsCancellationOpen(true)}
      className="h-auto rounded-[4px] border-border py-3 text-sm font-semibold"
    >
      Cancelar reserva
    </Button>
  );

  return (
    <section className="mt-8 border-t border-border pt-7" aria-labelledby="payment-heading">
      <h2 id="payment-heading" className="m-0 font-heading text-2xl font-semibold">
        Pagamento
      </h2>
      <div
        role="group"
        aria-label="Método de pagamento"
        className="mt-5 grid gap-3 min-[420px]:grid-cols-2"
      >
        <Button
          type="button"
          variant={method === PaymentMethod.Card ? 'default' : 'outline'}
          aria-pressed={method === PaymentMethod.Card}
          disabled={!canChangeMethod}
          onClick={() => setSelectedMethod(PaymentMethod.Card)}
          className="h-auto rounded-[4px] py-3"
        >
          <CreditCard aria-hidden="true" />
          Cartão de crédito
        </Button>
        <Button
          type="button"
          variant={method === PaymentMethod.Pix ? 'default' : 'outline'}
          aria-pressed={method === PaymentMethod.Pix}
          disabled={!canChangeMethod}
          onClick={() => setSelectedMethod(PaymentMethod.Pix)}
          className="h-auto rounded-[4px] py-3"
        >
          <QrCode aria-hidden="true" />
          PIX simulado
        </Button>
      </div>

      {pix.isChecking && (
        <p role="status" className="mb-0 mt-4 text-sm text-muted-foreground">
          Consultando pagamento em andamento...
        </p>
      )}

      {method === PaymentMethod.Card ? (
        <CardPaymentForm
          totalPriceCents={totalPriceCents}
          paymentFlow={card}
          cancelAction={cancelAction}
          disabled={isPaymentDisabled || pix.isChecking}
        />
      ) : (
        <SimulatedPixPanel
          paymentFlow={pix}
          cancelAction={cancelAction}
          disabled={isPaymentDisabled}
        />
      )}

      {isCancellationOpen && (
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
              onClick={() => setIsCancellationOpen(false)}
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
      <p className="mb-0 mt-4 text-center text-xs leading-5 text-muted-foreground">
        A compra pode ser cancelada integralmente em até sete dias da aprovação do pagamento, desde
        que o evento ainda não tenha começado e nenhum ingresso tenha sido utilizado.
      </p>
    </section>
  );
}
