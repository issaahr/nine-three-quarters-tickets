import axios from 'axios';
import { ArrowLeft, CalendarDays, MapPin, Ticket } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Button, buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { SeatMap } from '../components/SeatMap';
import { formatEventDetailDateTime, formatEventPrice } from '../eventPresentation';
import { useEventDetail, useEventSeatMap } from '../hooks';
import { AdmissionMode, EventCategory, EventStatus } from '../types';

const categoryLabels: Record<EventCategory, string> = {
  [EventCategory.Movie]: 'Filme',
  [EventCategory.Show]: 'Show',
};

interface LocalSeatSelection {
  eventId: string | undefined;
  mapUpdatedAt: number;
  seatIds: string[];
}

/** Representa o snapshot local de uma única ocorrência e seus estados somente de leitura. */
export function EventDetailPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const query = useEventDetail(eventId);
  const seatMapQuery = useEventSeatMap(eventId, query.data?.admissionMode === AdmissionMode.Seated);
  const [localSelection, setLocalSelection] = useState<LocalSeatSelection>({
    eventId,
    mapUpdatedAt: seatMapQuery.dataUpdatedAt,
    seatIds: [],
  });
  const selectedSeatIds =
    localSelection.eventId === eventId && localSelection.mapUpdatedAt === seatMapQuery.dataUpdatedAt
      ? localSelection.seatIds
      : [];

  if (query.isPending) {
    return (
      <main className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-12">
        <p role="status" className="text-center text-sm text-muted-foreground">
          Carregando sessão...
        </p>
      </main>
    );
  }

  if (query.isError) {
    const notFound = axios.isAxiosError(query.error) && query.error.response?.status === 404;

    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[2px] text-primary">
          Catálogo de eventos
        </p>
        <h1 className="m-0 font-heading text-4xl font-semibold">
          {notFound ? 'Sessão não encontrada' : 'Não foi possível carregar a sessão'}
        </h1>
        <p className="mb-6 mt-4 text-sm leading-7 text-muted-foreground">
          {notFound
            ? 'A ocorrência pode não existir ou ainda não estar disponível publicamente.'
            : 'Tente novamente em instantes.'}
        </p>
        {notFound ? (
          <Link to="/events" className={cn(buttonVariants(), 'rounded-[4px] no-underline')}>
            Voltar aos eventos
          </Link>
        ) : (
          <Button type="button" onClick={() => void query.refetch()} className="rounded-[4px]">
            Tentar novamente
          </Button>
        )}
      </main>
    );
  }

  const event = query.data;
  const isCancelled = event.status === EventStatus.Cancelled;
  const stateLabel = isCancelled
    ? 'Sessão cancelada'
    : event.isPast
      ? 'Sessão encerrada'
      : undefined;
  const canSelectSeats = !isCancelled && !event.isPast;

  function toggleSeat(seatId: string): void {
    setLocalSelection((currentSelection) => {
      const currentSeatIds =
        currentSelection.eventId === eventId &&
        currentSelection.mapUpdatedAt === seatMapQuery.dataUpdatedAt
          ? currentSelection.seatIds
          : [];

      return {
        eventId,
        mapUpdatedAt: seatMapQuery.dataUpdatedAt,
        seatIds: currentSeatIds.includes(seatId)
          ? currentSeatIds.filter((currentSeatId) => currentSeatId !== seatId)
          : [...currentSeatIds, seatId],
      };
    });
  }

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-12">
      <Link
        to="/events"
        className="mb-6 inline-flex items-center gap-2 rounded-sm text-sm font-medium text-primary no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Voltar aos eventos
      </Link>

      <article className="grid overflow-hidden bg-[#D8CEBE] p-px [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_16px),calc(100%_-_16px)_100%,0_100%)] lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.35fr)]">
        <div className="h-full bg-white">
          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt=""
              className="aspect-[4/5] h-full max-h-[720px] w-full bg-muted object-cover lg:aspect-auto"
            />
          ) : (
            <div className="flex aspect-[4/5] h-full min-h-80 w-full items-center justify-center bg-secondary-foreground font-heading text-7xl text-primary-foreground lg:aspect-auto">
              9¾
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col bg-white p-6 sm:p-9 lg:p-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-[2px] bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[1.3px] text-primary">
              {categoryLabels[event.category]}
            </span>
            {stateLabel && (
              <span
                role="status"
                className="rounded-[2px] bg-destructive/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[1.3px] text-destructive"
              >
                {stateLabel}
              </span>
            )}
          </div>

          <h1 className="mb-0 mt-5 break-words font-heading text-4xl font-semibold leading-tight sm:text-5xl">
            {event.title}
          </h1>

          {event.genres.length > 0 && (
            <p className="mb-0 mt-3 text-[10px] font-semibold uppercase tracking-[1.2px] text-primary">
              {event.genres.join(' · ')}
            </p>
          )}

          <p className="mb-0 mt-6 whitespace-pre-line text-sm leading-7 text-muted-foreground sm:text-base">
            {event.description || 'Sem descrição disponível.'}
          </p>

          <dl className="mt-8 grid gap-5 border-y border-[#E2D9CB] py-6 sm:grid-cols-2">
            <div>
              <dt className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.3px] text-primary">
                <CalendarDays className="size-4" aria-hidden="true" />
                Data e horário local
              </dt>
              <dd className="mb-0 ml-0 mt-2 font-mono text-sm leading-6">
                {formatEventDetailDateTime(event.startsAt, event.venueTimeZone)}
              </dd>
            </div>
            <div>
              <dt className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[1.3px] text-primary">
                <MapPin className="size-4" aria-hidden="true" />
                Local
              </dt>
              <dd className="mb-0 ml-0 mt-2 text-sm leading-6">
                {event.venueName}
                <br />
                <span className="text-muted-foreground">{event.venueCity}</span>
              </dd>
            </div>
          </dl>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="m-0 text-[10px] font-semibold uppercase tracking-[1.3px] text-muted-foreground">
                Ingresso a partir de
              </p>
              <p className="mb-0 mt-1 font-mono text-2xl font-semibold">
                {formatEventPrice(event.priceCents)}
              </p>
            </div>
            {stateLabel && (
              <p className="m-0 flex max-w-sm items-start gap-2 text-sm leading-6 text-destructive">
                <Ticket className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {isCancelled
                  ? 'Esta sessão foi cancelada e não aceita novas compras.'
                  : 'Esta sessão já aconteceu e não aceita novas compras.'}
              </p>
            )}
          </div>
        </div>
      </article>

      {event.admissionMode === AdmissionMode.Seated && (
        <section className="mx-auto mt-8 max-w-3xl bg-white p-6 sm:p-9">
          {seatMapQuery.isPending && (
            <p role="status" className="m-0 text-sm text-muted-foreground">
              Carregando mapa de assentos...
            </p>
          )}

          {seatMapQuery.isError && (
            <div role="alert">
              <p className="m-0 text-sm text-destructive">
                Não foi possível carregar o mapa de assentos.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void seatMapQuery.refetch()}
                className="mt-4 rounded-[4px]"
              >
                Tentar novamente
              </Button>
            </div>
          )}

          {seatMapQuery.data && (
            <>
              <SeatMap
                seats={seatMapQuery.data}
                selectedSeatIds={selectedSeatIds}
                selectionDisabled={!canSelectSeats}
                onToggleSeat={toggleSeat}
              />
              <div className="mt-6 border-t border-[#E2D9CB] pt-5">
                <p aria-live="polite" className="m-0 text-sm font-medium">
                  {selectedSeatIds.length === 0
                    ? 'Nenhum assento selecionado.'
                    : `${selectedSeatIds.length} assento${selectedSeatIds.length === 1 ? '' : 's'} selecionado${selectedSeatIds.length === 1 ? '' : 's'}.`}
                </p>
                {canSelectSeats && (
                  <p className="mb-0 mt-2 text-sm text-muted-foreground">
                    A seleção ainda não reserva os assentos.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
