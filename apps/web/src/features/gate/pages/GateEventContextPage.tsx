import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { isApiRateLimitError, rateLimitErrorMessage } from '@/lib/api';
import { formatGateEventDateTime } from '../../events/eventPresentation';
import { CheckInResultPanel } from '../components/CheckInResultPanel';
import { TicketCameraScanner } from '../components/TicketCameraScanner';
import { useCheckInCredential, useCheckInManualCode, useGateEvent } from '../hooks';
import { CheckInResult } from '../types';

export function GateEventContextPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const eventQuery = useGateEvent(eventId);
  const checkInCredentialMutation = useCheckInCredential();
  const checkInManualCodeMutation = useCheckInManualCode();
  const [manualCode, setManualCode] = useState('');
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  if (eventQuery.isPending) {
    return <main className="px-6 py-12 lg:px-8">Carregando contexto da portaria...</main>;
  }

  const event = eventQuery.data;

  if (eventQuery.isError || !event) {
    return (
      <main className="px-6 py-12 lg:px-8">
        <h1 className="font-heading text-3xl font-semibold">Evento indisponível</h1>
        <p className="mt-3 text-surface-dark-muted">
          Selecione outra ocorrência para continuar a operação.
        </p>
        <Link
          to="/gate"
          className="mt-6 inline-flex rounded-[4px] border border-brass-dark px-4 py-2 text-sm font-medium text-background"
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
      <p className="text-[10px] font-medium uppercase tracking-[1.5px] text-brass-dark sm:text-[11px] sm:tracking-[2px]">
        Evento em operação
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-4 border-b border-surface-dark-border pb-3 sm:mt-4 sm:border-0 sm:pb-0">
        <h1 className="font-heading text-xl font-semibold sm:text-3xl">{event.title}</h1>
        <Link
          to="/gate"
          className="inline-flex rounded-[4px] border border-brass-dark px-4 py-2 text-sm font-medium text-background"
        >
          Trocar Evento
        </Link>
      </div>
      <p className="mt-3 text-[10px] font-medium uppercase tracking-[1px] text-brass-dark sm:text-base sm:normal-case sm:tracking-normal sm:text-surface-dark-subtle">
        {event.venueName}
      </p>
      <p className="mt-1 font-mono text-[10px] text-border sm:text-sm">
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
              <span className="h-px flex-1 bg-surface-dark-border" />
              <span className="text-[10px] tracking-[0.16em] text-brass-border">OU</span>
              <span className="h-px flex-1 bg-surface-dark-border" />
            </div>

            <section className="rounded-[4px] border border-surface-dark-border bg-surface-dark-deep p-5">
              <h2 className="font-heading text-xl font-semibold">Entrada manual</h2>
              <p className="mt-2 text-sm text-surface-dark-muted">
                Digite o código exibido no ingresso quando a câmera não estiver disponível.
              </p>
              <form className="mt-5" onSubmit={handleManualCodeSubmit}>
                <label htmlFor="manual-code" className="text-sm font-medium text-background">
                  Código manual
                </label>
                <input
                  id="manual-code"
                  value={manualCode}
                  disabled={isSubmitting}
                  onChange={(change) => setManualCode(change.target.value)}
                  placeholder="XXXX-XXXX"
                  autoComplete="off"
                  className="mt-2 w-full rounded-[4px] border border-brass-border bg-surface-dark px-3 py-2 font-mono tracking-[0.12em] text-background placeholder:text-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-50"
                />
                <div className="mt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={!manualCode.trim() || isSubmitting}
                    className="rounded-[4px] border border-brass-dark px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-surface-dark-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-50"
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
        <p role="alert" className="mt-4 text-sm text-destructive-alert">
          {submissionError}
        </p>
      )}
    </main>
  );
}
