import { FormEvent, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { formatEventDetailDateTime } from '../../events/eventPresentation';
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
        <h1 className="font-heading text-3xl font-semibold">Event indisponível</h1>
        <p className="mt-3 text-[#B7AFA3]">Selecione outra ocorrência para continuar a operação.</p>
        <Link
          to="/gate"
          className="mt-6 inline-flex rounded-[4px] border border-[#A9855B] px-4 py-2 text-sm font-medium text-[#F5F2EC]"
        >
          Escolher Event
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
        onError: () => setSubmissionError('Não foi possível validar o ingresso. Tente novamente.'),
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
        onError: () => setSubmissionError('Não foi possível validar o ingresso. Tente novamente.'),
      },
    );
  }

  function resetValidation(): void {
    setResult(null);
    setManualCode('');
    setSubmissionError(null);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 lg:px-8">
      <p className="text-[11px] font-medium uppercase tracking-[2px] text-[#A9855B]">
        Event em operação
      </p>
      <h1 className="mt-4 font-heading text-3xl font-semibold">{event.title}</h1>
      <p className="mt-3 text-[#C9BBA6]">{event.venueName}</p>
      <p className="mt-1 text-[#8A857C]">
        {formatEventDetailDateTime(event.startsAt, event.venueTimeZone)}
      </p>

      <Link
        to="/gate"
        className="mt-8 inline-flex rounded-[4px] border border-[#A9855B] px-4 py-2 text-sm font-medium text-[#F5F2EC]"
      >
        Trocar Event
      </Link>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {result ? (
          <div className="lg:col-span-2">
            <CheckInResultPanel result={result} onReset={resetValidation} />
          </div>
        ) : (
          <>
            <TicketCameraScanner disabled={isSubmitting} onCredential={handleCameraCredential} />

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
                <button
                  type="submit"
                  disabled={!manualCode.trim() || isSubmitting}
                  className="mt-4 rounded-[4px] border border-[#A9855B] px-4 py-2 text-sm font-medium text-[#F5F2EC] transition-colors hover:bg-[#3A1A20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-50"
                >
                  {isSubmitting ? 'Validando...' : 'Validar ingresso'}
                </button>
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
