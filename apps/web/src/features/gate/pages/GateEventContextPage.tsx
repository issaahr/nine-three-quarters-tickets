import { Link, useParams } from 'react-router-dom';

import { formatEventDetailDateTime } from '../../events/eventPresentation';
import { useGateEvents } from '../hooks';

export function GateEventContextPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const eventsQuery = useGateEvents();

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
    </main>
  );
}
