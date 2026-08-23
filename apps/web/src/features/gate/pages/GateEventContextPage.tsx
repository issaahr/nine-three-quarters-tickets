import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { isApiRateLimitError, rateLimitErrorMessage } from '../../../lib/api';
import { formatGateEventDateTime } from '../../events/eventPresentation';
import { CheckInResultPanel } from '../components/CheckInResultPanel';
import { TicketCameraScanner } from '../components/TicketCameraScanner';
import { useCheckInCredential, useCheckInManualCode, useGateEvents } from '../hooks';
import { CheckInResult } from '../types';

export function GateEventContextPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const eventsQuery = useGateEvents();
  const checkInCredentialMutation = useCheckInCredential();
  const checkInManualCodeMutation = useCheckInManualCode();
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  if (eventsQuery.isPending) {
    return <main className="px-6 py-12 lg:px-8">Carregando contexto da portaria...</main>;
  }

  if (eventsQuery.isError) {
    return (
      <main className="px-6 py-12 lg:px-8">
        <h1 className="font-heading text-3xl font-semibold">
          Não foi possível carregar a portaria
        </h1>
        <p className="mt-3 text-[#B7AFA3]">Tente novamente em instantes.</p>
      </main>
    );
  }

  const event = eventsQuery.data?.find(({ id }) => id === eventId);

  if (!event) {
    return (
      <main className="px-6 py-12 lg:px-8">
        <h1 className="font-heading text-3xl font-semibold">Evento indisponível</h1>
        <p className="mt-3 text-[#B7AFA3]">Selecione outra ocorrência para continuar a operação.</p>
        <Link
          to="/gate"
          className="mt-6 inline-flex rounded-[4px] border border-[#A9855B] px-4 py-2 text-sm font-medium text-[#F5F2EC]"
        >
          Escolher Evento
        </Link>
      </main>
    );
  }

  const activeEventId = event.id;
  const isSubmitting = checkInCredentialMutation.isPending || checkInManualCodeMutation.isPending;

  function handleManualCodeSubmit(submission: FormEvent<HTMLFormElement>): void {
    submission.preventDefault();

    if (!manualCode.trim() || isSubmitting) {
      return;
    }

    setSubmissionError(null);
    checkInManualCodeMutation.mutate(
      { eventId: activeEventId, manualCode },
      {
        onSuccess: ({ result: nextResult }) => setResult(nextResult),
        onError: (error) =>
          setSubmissionError(
            isApiRateLimitError(error)
              ? rateLimitErrorMessage
              : 'Não foi possível validar o ingresso. Tente novamente.',
          ),
      },
    );
  }

  function handleCameraCredential(credential: string): void {
    if (isSubmitting) {
      return;
    }

    setSubmissionError(null);
    checkInCredentialMutation.mutate(
      { eventId: activeEventId, credential },
      {
        onSuccess: ({ result: nextResult }) => setResult(nextResult),
        onError: (error) =>
          setSubmissionError(
            isApiRateLimitError(error)
              ? rateLimitErrorMessage
              : 'Não foi possível validar o ingresso. Tente novamente.',
          ),
      },
    );
  }

  function resetValidation(): void {
    setResult(null);
    setManualCode('');
    setSubmissionError(null);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-6 sm:py-12 lg:px-8">
      <p className="text-[10px] font-medium uppercase tracking-[1.5px] text-[#A9855B] sm:text-[11px] sm:tracking-[2px]">
        Evento em operação
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4 border-b border-[#3A1A20] pb-3 sm:mt-4 sm:border-0 sm:pb-0">
        <h1 className="font-heading text-xl font-semibold sm:text-3xl">{event.title}</h1>
        <Link
          to="/gate"
          className="inline-flex rounded-[4px] border border-[#A9855B] px-4 py-2 text-sm font-medium text-[#F5F2EC]"
        >
          Trocar Evento
        </Link>
      </div>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-[1px] text-[#A9855B] sm:text-base sm:normal-case sm:tracking-normal sm:text-[#C9BBA6]">
        {event.venueName}
      </p>
      <p className="mt-1 font-mono text-[10px] text-[#8A857C] sm:text-sm">
        {formatGateEventDateTime(event.startsAt, event.venueTimeZone)}
      </p>

      <div className="mt-6 grid gap-4 sm:mt-8 sm:gap-6 lg:grid-cols-2">
        {result ? (
          <div className="lg:col-span-2">
            <CheckInResultPanel result={result} onReset={resetValidation} />
          </div>
        ) : (
          <>
            <TicketCameraScanner disabled={isSubmitting} onCredential={handleCameraCredential} />

            <div className="flex items-center gap-3 lg:hidden" aria-hidden="true">
              <span className="h-px flex-1 bg-[#3A1A20]" />
              <span className="text-[10px] tracking-[0.16em] text-[#6B5636]">OU</span>
              <span className="h-px flex-1 bg-[#3A1A20]" />
            </div>

            <section className="rounded-[4px] border border-[#3A1A20] bg-[#0D0507] p-5">
              <h2 className="font-heading text-xl font-semibold">Entrada manual</h2>
              <p className="mt-2 text-sm text-[#B7AFA3]">
                Digite o código exibido no ingresso quando a câmera não estiver disponível.
              </p>
              <form className="mt-5" onSubmit={handleManualCodeSubmit}>
                <label htmlFor="manual-code" className="text-sm font-medium text-[#F5F2EC]">
                  Código manual
                </label>
                <input
                  id="manual-code"
                  value={manualCode}
                  disabled={isSubmitting}
                  onChange={(change) => setManualCode(change.target.value)}
                  placeholder="XXXX-XXXX"
                  autoComplete="off"
                  className="mt-2 w-full rounded-[4px] border border-[#6B5636] bg-[#1A0A0D] px-3 py-2 font-mono tracking-[0.12em] text-[#F5F2EC] placeholder:text-[#8A857C] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-50"
                />
                <div className="mt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={!manualCode.trim() || isSubmitting}
                    className="rounded-[4px] border border-[#A9855B] px-4 py-2 text-sm font-medium text-[#F5F2EC] transition-colors hover:bg-[#3A1A20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-50"
                  >
                    {isSubmitting ? 'Validando...' : 'Validar ingresso'}
                  </button>
                </div>
              </form>
            </section>
          </>
        )}
      </div>
      {submissionError && (
        <p role="alert" className="mt-4 text-sm text-[#F5B6B6]">
          {submissionError}
        </p>
      )}
    </main>
  );
}
