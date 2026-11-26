import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { navigateToHostedCheckout } from '../hostedCheckoutNavigation';
import { useHostedCheckout } from '../hooks';
import { PaymentMethod, PaymentStatus } from '../types';
import { CheckoutPaymentMethods } from './CheckoutPaymentMethods';
import { useCheckoutCancellation } from './useCheckoutCancellation';

interface HostedCheckoutPaymentPanelProps {
  reservationId: string;
  eventId: string;
  totalPriceCents: number;
  isGeneralAdmission: boolean;
  methods: PaymentMethod[];
}

export function HostedCheckoutPaymentPanel({
  reservationId,
  eventId,
  totalPriceCents,
  isGeneralAdmission,
  methods,
}: HostedCheckoutPaymentPanelProps) {
  const checkout = useHostedCheckout({ reservationId, eventId });
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>();
  const [hasNavigationError, setHasNavigationError] = useState(false);
  const { payment, paymentQuery, isSubmitting, submissionError, uncertainMethod } = checkout;
  const isPending = payment?.status === PaymentStatus.Pending;
  const isApproved = payment?.status === PaymentStatus.Approved;
  const isFailed =
    payment?.status === PaymentStatus.Failed || payment?.status === PaymentStatus.Declined;
  const canContinue = isPending && (payment.canResume || Boolean(payment.checkoutUrl));
  const isWaitingForConfirmation = isPending && !canContinue;
  const method =
    isPending || isApproved
      ? payment.method
      : (uncertainMethod ??
        (selectedMethod && methods.includes(selectedMethod) ? selectedMethod : methods[0]));
  const cancellation = useCheckoutCancellation({
    reservationId,
    eventId,
    isGeneralAdmission,
    disabled: isSubmitting || isApproved,
  });
  const isBlockingPayment =
    !paymentQuery.isSuccess || isSubmitting || cancellation.isBlockingPayment || isApproved;

  const continueCheckout = async (): Promise<void> => {
    if (isBlockingPayment || !method) return;
    setHasNavigationError(false);
    let destination: string | null | undefined;
    try {
      destination = (await checkout.submit(method, isPending ? payment.id : undefined))
        ?.checkoutUrl;
    } catch {
      // A mutation preserva o erro e consulta se a tentativa pode ser retomada.
      return;
    }
    if (!destination) return;
    try {
      navigateToHostedCheckout(destination);
    } catch {
      setHasNavigationError(true);
    }
  };

  const actionLabel =
    totalPriceCents === 0
      ? 'Confirmar reserva gratuita'
      : isPending
        ? 'Retomar pagamento'
        : 'Ir para o pagamento';

  return (
    <>
      <CheckoutPaymentMethods
        methods={methods}
        selectedMethod={method}
        onSelect={setSelectedMethod}
        disabled={isBlockingPayment || isPending || uncertainMethod !== undefined}
      />
      {totalPriceCents > 0 && (
        <p className="mb-0 mt-4 text-sm text-muted-foreground">
          Você será direcionado ao checkout seguro para pagar.
        </p>
      )}
      {paymentQuery.isPending && (
        <p role="status" className="mb-0 mt-4 text-sm text-muted-foreground">
          Consultando pagamento em andamento...
        </p>
      )}
      {paymentQuery.isError && (
        <p role="alert" className="mb-0 mt-4 text-sm text-destructive">
          Não foi possível consultar o pagamento. Atualize a situação para continuar.
        </p>
      )}
      {(isWaitingForConfirmation || isApproved) && (
        <p role="status" className="mb-0 mt-4 text-sm text-muted-foreground">
          {isApproved ? 'Confirmando seus ingressos...' : 'Aguardando confirmação do pagamento.'}
        </p>
      )}
      {canContinue && (
        <p role="status" className="mb-0 mt-4 text-sm text-muted-foreground">
          Você tem um pagamento em andamento.
        </p>
      )}
      {isFailed && (
        <p role="alert" className="mb-0 mt-4 text-sm text-destructive">
          O pagamento não foi concluído. Você pode tentar novamente.
        </p>
      )}
      {(hasNavigationError || (submissionError && !isWaitingForConfirmation)) && (
        <p role="alert" className="mb-0 mt-4 text-sm text-destructive">
          Não foi possível abrir o checkout. Tente novamente.
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        {cancellation.action}
        {paymentQuery.isError || isWaitingForConfirmation || isApproved ? (
          <Button
            type="button"
            variant="outline"
            disabled={paymentQuery.isFetching || isSubmitting}
            onClick={() => void paymentQuery.refetch()}
            className="h-auto rounded-[4px] py-3"
          >
            Atualizar situação do pagamento
          </Button>
        ) : (
          <Button
            type="button"
            disabled={isBlockingPayment || !method}
            onClick={() => void continueCheckout()}
            className="h-auto rounded-[4px] py-3"
          >
            {isSubmitting ? 'Preparando pagamento...' : actionLabel}
          </Button>
        )}
      </div>
      {cancellation.confirmation}
    </>
  );
}
