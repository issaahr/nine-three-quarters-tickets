import { zodResolver } from '@hookform/resolvers/zod';
import axios from 'axios';
import { CircleX, CreditCard, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { formatEventPrice } from '../../events/eventPresentation';
import { useReservationMutations } from '../../reservations/hooks';
import { useCardPayment } from '../hooks';
import { CardPaymentFormValues, cardPaymentSchema } from '../schemas';
import { PaymentStatus } from '../types';

interface CardPaymentFormProps {
  reservationId: string;
  eventId: string;
  totalPriceCents: number;
}

const cardPresets = {
  approved: {
    cardNumber: '4242 4242 4242 4242',
    cardholderName: 'Ana Beatriz Souza',
    expiry: '08/29',
    cvv: '123',
  },
  declined: {
    cardNumber: '4000 0000 0000 0002',
    cardholderName: 'Ana Beatriz Souza',
    expiry: '08/29',
    cvv: '123',
  },
} as const;

function getPaymentErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (axios.isAxiosError(error)) {
    const code = error.response?.data?.code;

    if (code === 'RESERVATION_EXPIRED') {
      return 'O prazo da reserva terminou antes da confirmação do pagamento.';
    }
    if (code === 'PAYMENT_IN_PROGRESS') {
      return 'Já existe um pagamento em processamento para esta reserva.';
    }
    if (code === 'RESERVATION_ALREADY_PAID') {
      return 'Esta reserva já foi paga.';
    }
  }

  return 'Não foi possível concluir o pagamento. Você pode tentar novamente.';
}

function getCancellationErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  return 'Não foi possível cancelar a reserva. Tente novamente.';
}

/** Formulário de cartão simulado, sem persistir dados sensíveis no estado remoto. */
export function CardPaymentForm({ reservationId, eventId, totalPriceCents }: CardPaymentFormProps) {
  const { submit, payment, error, isPaying } = useCardPayment({ reservationId, eventId });
  const { cancel, cancelError, isCancelling } = useReservationMutations(eventId);
  const [isCancellationConfirmationOpen, setIsCancellationConfirmationOpen] = useState(false);
  const [isCvvVisible, setIsCvvVisible] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<CardPaymentFormValues>({
    resolver: zodResolver(cardPaymentSchema),
    mode: 'onChange',
    defaultValues: cardPresets.approved,
  });
  const paymentErrorMessage = getPaymentErrorMessage(error);
  const cancellationErrorMessage = getCancellationErrorMessage(cancelError);
  const isDeclined = payment?.status === PaymentStatus.Declined;
  const isFailed = payment?.status === PaymentStatus.Failed;
  const isPending = payment?.status === PaymentStatus.Pending;

  const onSubmit = async (data: CardPaymentFormValues): Promise<void> => {
    try {
      await submit(data);
    } catch {
      // A mensagem é derivada do estado da mutation para preservar a chave em retry técnico.
    }
  };

  const confirmCancellation = async (): Promise<void> => {
    try {
      await cancel(reservationId);
      setIsCancellationConfirmationOpen(false);
    } catch {
      // A mensagem é derivada do estado da mutation para manter o feedback da tentativa.
    }
  };

  return (
    <section className="mt-8 border-t border-[#E2D9CB] pt-7" aria-labelledby="payment-heading">
      <div className="flex items-center gap-2">
        <CreditCard className="size-5 text-primary" aria-hidden="true" />
        <h2 id="payment-heading" className="m-0 font-heading text-2xl font-semibold">
          Pagamento
        </h2>
      </div>
      <p className="mb-0 mt-2 text-sm leading-6 text-muted-foreground">
        Cartão de crédito é o único método disponível nesta demonstração.
      </p>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => reset(cardPresets.approved)}
          className="h-auto rounded-[4px] border-[#D4CCBE] py-2 text-xs"
        >
          Usar cartão aprovado
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => reset(cardPresets.declined)}
          className="h-auto rounded-[4px] border-[#D4CCBE] py-2 text-xs"
        >
          Usar cartão recusado
        </Button>
      </div>

      {(isDeclined || isFailed) && (
        <div
          role="alert"
          className="mt-5 flex gap-3 border-l-4 border-destructive bg-destructive/10 p-4 text-sm leading-6 text-destructive"
        >
          <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {isDeclined
              ? 'Pagamento recusado. Verifique os dados do cartão e tente novamente.'
              : 'Ocorreu uma falha técnica. Tente novamente com os mesmos dados.'}
          </span>
        </div>
      )}

      {isPending && (
        <div
          role="status"
          className="mt-5 flex items-center gap-3 border-l-4 border-primary bg-primary/5 p-4 text-sm text-primary"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Pagamento em processamento. Aguarde a confirmação antes de tentar novamente.
        </div>
      )}

      {paymentErrorMessage && (
        <div
          role="alert"
          className="mt-5 border-l-4 border-destructive bg-destructive/10 p-4 text-sm text-destructive"
        >
          {paymentErrorMessage}
        </div>
      )}

      {cancellationErrorMessage && (
        <div
          role="alert"
          className="mt-5 border-l-4 border-destructive bg-destructive/10 p-4 text-sm text-destructive"
        >
          {cancellationErrorMessage}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div>
          <label
            htmlFor="card-number"
            className="mb-1.5 block text-[11px] font-semibold tracking-[1.2px] text-muted-foreground uppercase"
          >
            Número do cartão
          </label>
          <Input
            id="card-number"
            inputMode="numeric"
            autoComplete="cc-number"
            placeholder="0000 0000 0000 0000"
            {...register('cardNumber')}
            aria-invalid={Boolean(errors.cardNumber)}
            className="h-11 rounded-[4px] border-[#D4CCBE] bg-white font-mono"
          />
          {errors.cardNumber?.message && (
            <p role="alert" className="mb-0 mt-1.5 text-xs text-destructive">
              {errors.cardNumber.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="cardholder-name"
            className="mb-1.5 block text-[11px] font-semibold tracking-[1.2px] text-muted-foreground uppercase"
          >
            Nome no cartão
          </label>
          <Input
            id="cardholder-name"
            autoComplete="cc-name"
            {...register('cardholderName')}
            aria-invalid={Boolean(errors.cardholderName)}
            className="h-11 rounded-[4px] border-[#D4CCBE] bg-white"
          />
          {errors.cardholderName?.message && (
            <p role="alert" className="mb-0 mt-1.5 text-xs text-destructive">
              {errors.cardholderName.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="card-expiry"
              className="mb-1.5 block text-[11px] font-semibold tracking-[1.2px] text-muted-foreground uppercase"
            >
              Validade
            </label>
            <Input
              id="card-expiry"
              inputMode="numeric"
              autoComplete="cc-exp"
              placeholder="MM/AA"
              {...register('expiry')}
              aria-invalid={Boolean(errors.expiry)}
              className="h-11 rounded-[4px] border-[#D4CCBE] bg-white font-mono"
            />
            {errors.expiry?.message && (
              <p role="alert" className="mb-0 mt-1.5 text-xs text-destructive">
                {errors.expiry.message}
              </p>
            )}
          </div>
          <div>
            <label
              htmlFor="card-cvv"
              className="mb-1.5 block text-[11px] font-semibold tracking-[1.2px] text-muted-foreground uppercase"
            >
              CVV
            </label>
            <div className="relative">
              <Input
                id="card-cvv"
                type={isCvvVisible ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="cc-csc"
                {...register('cvv')}
                aria-invalid={Boolean(errors.cvv)}
                className="h-11 rounded-[4px] border-[#D4CCBE] bg-white pr-10 font-mono"
              />
              <button
                type="button"
                onClick={() => setIsCvvVisible((currentValue) => !currentValue)}
                aria-label={isCvvVisible ? 'Ocultar CVV' : 'Mostrar CVV'}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {isCvvVisible ? (
                  <EyeOff className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
              </button>
            </div>
            {errors.cvv?.message && (
              <p role="alert" className="mb-0 mt-1.5 text-xs text-destructive">
                {errors.cvv.message}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={isPaying || isPending || isCancelling}
            onClick={() => setIsCancellationConfirmationOpen(true)}
            className="h-auto rounded-[4px] border-[#D4CCBE] py-3 text-sm font-semibold"
          >
            Cancelar reserva
          </Button>
          <Button
            type="submit"
            disabled={!isValid || isPaying || isPending || isCancelling}
            className="h-auto rounded-[4px] py-3 text-sm font-semibold"
          >
            {isPaying ? 'Processando pagamento...' : `Pagar ${formatEventPrice(totalPriceCents)}`}
          </Button>
        </div>
        {isCancellationConfirmationOpen && (
          <div className="border border-[#D4CCBE] bg-[#F8F4EC] p-4" role="alert">
            <p className="m-0 text-sm leading-6">
              Cancelar esta reserva libera os assentos imediatamente. Deseja continuar?
            </p>
            <div className="mt-3 flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCancellationConfirmationOpen(false)}
                disabled={isCancelling}
                className="rounded-[4px]"
              >
                Voltar
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={confirmCancellation}
                disabled={isCancelling}
                className="rounded-[4px]"
              >
                {isCancelling ? 'Cancelando...' : 'Confirmar cancelamento'}
              </Button>
            </div>
          </div>
        )}
        <p className="mb-0 text-center text-xs text-muted-foreground">
          Pagamento simulado — nenhum dado é cobrado ou armazenado.
        </p>
        <p className="mb-0 text-center text-xs leading-5 text-muted-foreground">
          Política de cancelamento: a compra pode ser cancelada integralmente em até sete dias da
          aprovação do pagamento, desde que o evento ainda não tenha começado e nenhum ingresso
          tenha sido utilizado.
        </p>
      </form>
    </section>
  );
}
