import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { isApiRateLimitError, rateLimitErrorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { navigateToHostedCheckout } from '../hostedCheckoutNavigation';
import { useHostedCheckout } from '../hooks';
import { PaymentMethod, PaymentStatus } from '../types';
import { CheckoutActions } from './CheckoutActions';
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
  const {
    payment,
    paymentQuery,
    isSubmitting,
    submissionError,
    uncertainMethod,
    unsupportedAmountMethod,
  } = checkout;
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

  let message: string | undefined;
  let messageRole: 'alert' | 'status' | undefined = 'status';
  if (isSubmitting) {
    message = 'Preparando seu pagamento…';
  } else if (isApiRateLimitError(paymentQuery.error)) {
    message = rateLimitErrorMessage;
    messageRole = 'alert';
  } else if (paymentQuery.isError) {
    message = 'Não foi possível consultar o pagamento. Atualize a situação para continuar.';
    messageRole = 'alert';
  } else if (paymentQuery.isPending) {
    message = 'Consultando pagamento em andamento...';
  } else if (isApproved) {
    message = 'Confirmando seus ingressos...';
  } else if (isWaitingForConfirmation) {
    message = 'Aguardando confirmação do pagamento.';
  } else if (isApiRateLimitError(submissionError)) {
    message = rateLimitErrorMessage;
    messageRole = 'alert';
  } else if (unsupportedAmountMethod && unsupportedAmountMethod === method) {
    message = 'O total da reserva está fora dos limites para este método de pagamento.';
    messageRole = 'alert';
  } else if (hasNavigationError || (submissionError && !unsupportedAmountMethod)) {
    message = 'Não foi possível abrir o checkout. Tente novamente.';
    messageRole = 'alert';
  } else if (canContinue) {
    message =
      totalPriceCents > 0
        ? 'Você tem um pagamento em andamento. Clique em “Retomar pagamento” para continuar.'
        : undefined;
  } else if (isFailed) {
    message = 'O pagamento não foi concluído. Você pode tentar novamente.';
    messageRole = 'alert';
  } else if (totalPriceCents > 0) {
    message = 'Você será redirecionado ao checkout seguro para concluir o pagamento.';
    messageRole = undefined;
  }

  return (
    <>
      <CheckoutPaymentMethods
        methods={methods}
        selectedMethod={method}
        onSelect={setSelectedMethod}
        disabled={isBlockingPayment || isPending || uncertainMethod !== undefined}
      />
      {message && (
        <p
          role={messageRole}
          className={cn(
            'mb-0 mt-4 text-sm',
            messageRole === 'alert' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {message}
        </p>
      )}
      <div className="mt-5">
        <CheckoutActions>
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
              {actionLabel}
            </Button>
          )}
        </CheckoutActions>
      </div>
      {cancellation.confirmation}
    </>
  );
}
