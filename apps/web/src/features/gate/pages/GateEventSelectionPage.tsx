import { useState } from 'react';
import { Link } from 'react-router-dom';

import { formatEventDetailDateTime } from '../../events/eventPresentation';
import { isEventOnCurrentVenueDay } from '../eventDay';
import { useGateEvents } from '../hooks';

export function GateEventSelectionPage() {
  const eventsQuery = useGateEvents();
  const [showOnlyToday, setShowOnlyToday] = useState(false);

  if (eventsQuery.isPending) {
    return <main className="px-6 py-12 lg:px-8">Carregando Events para operação...</main>;
  }

  if (eventsQuery.isError) {
    return (
      <main className="px-6 py-12 lg:px-8">
        <h1 className="font-heading text-3xl font-semibold">
          Não foi possível carregar a portaria
        </h1>
        <p className="mt-3 text-surface-dark-muted">Tente novamente em instantes.</p>
      </main>
    );
  }

  const events = eventsQuery.data ?? [];
  const displayedEvents = showOnlyToday
    ? events.filter((event) => isEventOnCurrentVenueDay(event.startsAt, event.venueTimeZone))
    : events;

  if (events.length === 0) {
    return (
      <main className="px-6 py-12 lg:px-8">
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-brass-dark">
          Operação de portaria
        </p>
        <h1 className="mt-4 font-heading text-3xl font-semibold">Nenhum Event disponível</h1>
        <p className="mt-3 text-surface-dark-muted">
          Não há ocorrências publicadas para selecionar neste momento.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 lg:px-8">
      <p className="text-[11px] font-medium uppercase tracking-[2px] text-brass-dark">
        Operação de portaria
      </p>
      <h1 className="mt-4 font-heading text-3xl font-semibold">Selecione o evento em operação</h1>
      <p className="mt-3 max-w-2xl text-surface-dark-muted">
        Escolha a ocorrência antes de validar qualquer ingresso.
      </p>

      <button
        type="button"
        aria-pressed={showOnlyToday}
        onClick={() => setShowOnlyToday((currentValue) => !currentValue)}
        className="mt-6 rounded-[4px] border border-brass-dark px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-surface-dark-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      >
        {showOnlyToday ? 'Mostrar todos' : 'Ver eventos de hoje'}
      </button>

      {displayedEvents.length === 0 ? (
        <p className="mt-8 text-surface-dark-muted">Não há Events para hoje.</p>
      ) : (
        <ul className="mt-8 grid gap-3" aria-label="Events disponíveis para operação">
          {displayedEvents.map((event) => (
            <li key={event.id}>
              <Link
                to={`/gate/events/${encodeURIComponent(event.id)}`}
                className="block rounded-[4px] border border-surface-dark-border bg-surface-dark-deep p-5 transition-colors hover:border-brass-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                <span className="block font-heading text-xl font-semibold text-background">
                  {event.title}
                </span>
                <span className="mt-2 block text-sm text-surface-dark-subtle">
                  {event.venueName}
                </span>
                <span className="mt-1 block text-sm text-border">
                  {formatEventDetailDateTime(event.startsAt, event.venueTimeZone)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
