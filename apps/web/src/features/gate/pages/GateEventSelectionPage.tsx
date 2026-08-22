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
        <p className="mt-3 text-[#B7AFA3]">Tente novamente em instantes.</p>
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
        <p className="text-[11px] font-medium uppercase tracking-[2px] text-[#A9855B]">
          Operação de portaria
        </p>
        <h1 className="mt-4 font-heading text-3xl font-semibold">Nenhum Event disponível</h1>
        <p className="mt-3 text-[#B7AFA3]">
          Não há ocorrências publicadas para selecionar neste momento.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12 lg:px-8">
      <p className="text-[11px] font-medium uppercase tracking-[2px] text-[#A9855B]">
        Operação de portaria
      </p>
      <h1 className="mt-4 font-heading text-3xl font-semibold">Selecione o evento em operação</h1>
      <p className="mt-3 max-w-2xl text-[#B7AFA3]">
        Escolha a ocorrência antes de validar qualquer ingresso.
      </p>

      <button
        type="button"
        aria-pressed={showOnlyToday}
        onClick={() => setShowOnlyToday((currentValue) => !currentValue)}
        className="mt-6 rounded-[4px] border border-[#A9855B] px-4 py-2 text-sm font-medium text-[#F5F2EC] transition-colors hover:bg-[#3A1A20] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      >
        {showOnlyToday ? 'Mostrar todos' : 'Ver eventos de hoje'}
      </button>

      {displayedEvents.length === 0 ? (
        <p className="mt-8 text-[#B7AFA3]">Não há Events para hoje.</p>
      ) : (
        <ul className="mt-8 grid gap-3" aria-label="Events disponíveis para operação">
          {displayedEvents.map((event) => (
            <li key={event.id}>
              <Link
                to={`/gate/events/${encodeURIComponent(event.id)}`}
                className="block rounded-[4px] border border-[#3A1A20] bg-[#0D0507] p-5 transition-colors hover:border-[#A9855B] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                <span className="block font-heading text-xl font-semibold text-[#F5F2EC]">
                  {event.title}
                </span>
                <span className="mt-2 block text-sm text-[#C9BBA6]">{event.venueName}</span>
                <span className="mt-1 block text-sm text-[#8A857C]">
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
