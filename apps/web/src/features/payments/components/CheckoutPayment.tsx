import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useCardPayment, useCheckoutConfiguration, useSimulatedPixPayment } from '../hooks';
import { PaymentCheckoutMode, PaymentMethod, PaymentStatus } from '../types';
import { CardPaymentForm } from './CardPaymentForm';
import { CheckoutPaymentMethods } from './CheckoutPaymentMethods';
import { HostedCheckoutPaymentPanel } from './HostedCheckoutPaymentPanel';
import { SimulatedPixPanel } from './SimulatedPixPanel';
import { useCheckoutCancellation } from './useCheckoutCancellation';

interface CheckoutPaymentProps {
  reservationId: string;
  eventId: string;
  totalPriceCents: number;
  isReservationActive: boolean;
  isGeneralAdmission: boolean;
}

interface SimulatedCheckoutPaymentProps extends CheckoutPaymentProps {
  methods: PaymentMethod[];
}

export function CheckoutPayment(props: CheckoutPaymentProps) {
  const configuration = useCheckoutConfiguration(props.isReservationActive);
  // O PIX simulado pode concluir uma tentativa pendente enquanto a reserva já está inativa.
  if (!props.isReservationActive && configuration.data?.mode !== PaymentCheckoutMode.Simulated) {
    return null;
  }

  return (
    <section
      className="mt-5 border-t border-border pt-5"
      aria-labelledby="payment-heading"
      hidden={!props.isReservationActive}
    >
      <h2 id="payment-heading" className="m-0 font-heading text-2xl font-semibold">
        Pagamento
      </h2>
      {configuration.isPending && (
        <p role="status" className="mb-0 mt-4 text-sm text-muted-foreground">
          Carregando opções de pagamento...
        </p>
      )}
      {configuration.isError && (
        <div className="mt-4">
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar as opções de pagamento.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={configuration.isFetching}
            onClick={() => void configuration.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {configuration.isSuccess && configuration.data.mode === PaymentCheckoutMode.Simulated && (
        <SimulatedCheckoutPayment {...props} methods={configuration.data.methods} />
      )}
      {configuration.isSuccess && configuration.data.mode === PaymentCheckoutMode.Hosted && (
        <HostedCheckoutPaymentPanel {...props} methods={configuration.data.methods} />
      )}
      <p className="mb-0 mt-4 text-center text-xs leading-5 text-muted-foreground">
        A compra pode ser cancelada integralmente em até sete dias da aprovação do pagamento, desde
        que o evento ainda não tenha começado e nenhum ingresso tenha sido utilizado.
      </p>
    </section>
  );
}

function SimulatedCheckoutPayment({
  reservationId,
  eventId,
  totalPriceCents,
  isReservationActive,
  isGeneralAdmission,
  methods,
}: SimulatedCheckoutPaymentProps) {
  const card = useCardPayment({ reservationId, eventId });
  const pix = useSimulatedPixPayment({ reservationId, eventId, isReservationActive });
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>();
  const isPixApproved = pix.payment?.status === PaymentStatus.Approved;
  const hasLivePix = pix.payment?.status === PaymentStatus.Pending || isPixApproved;
  const isCardInProgress = card.isPaying || card.payment?.status === PaymentStatus.Pending;
  const preferredMethod = hasLivePix
    ? PaymentMethod.Pix
    : (selectedMethod ?? (pix.payment ? PaymentMethod.Pix : PaymentMethod.Card));
  const method = methods.includes(preferredMethod) ? preferredMethod : methods[0];
  const hasPaymentInProgress = isCardInProgress || pix.isCreating || isPixApproved;
  const cancellation = useCheckoutCancellation({
    reservationId,
    eventId,
    isGeneralAdmission,
    disabled: hasPaymentInProgress,
  });
  if (!isReservationActive) return null;

  return (
    <>
      <CheckoutPaymentMethods
        methods={methods}
        selectedMethod={method}
        onSelect={setSelectedMethod}
        disabled={hasLivePix || hasPaymentInProgress || cancellation.isBlockingPayment}
        simulated
      />
      {pix.isChecking && (
        <p role="status" className="mb-0 mt-4 text-sm text-muted-foreground">
          Consultando pagamento em andamento...
        </p>
      )}
      {method === PaymentMethod.Card && (
        <CardPaymentForm
          totalPriceCents={totalPriceCents}
          paymentFlow={card}
          cancelAction={cancellation.action}
          disabled={cancellation.isBlockingPayment || pix.isChecking}
        />
      )}
      {method === PaymentMethod.Pix && (
        <SimulatedPixPanel
          paymentFlow={pix}
          cancelAction={cancellation.action}
          disabled={cancellation.isBlockingPayment}
        />
      )}
      {cancellation.confirmation}
    </>
  );
}
