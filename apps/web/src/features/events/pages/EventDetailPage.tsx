import axios from 'axios';
import { ArrowLeft, CalendarDays, MapPin, Ticket } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { Button, buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../auth/hooks';
import { UserRole } from '../../auth/types';
import { useActiveReservation, useReservationMutations } from '../../reservations/hooks';
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const query = useEventDetail(eventId);
  const seatMapQuery = useEventSeatMap(eventId, query.data?.admissionMode === AdmissionMode.Seated);
  const isCustomer = user?.role === UserRole.Customer;
  const activeReservationQuery = useActiveReservation(eventId, isCustomer);
  const { create, cancel, isCreating, isCancelling } = useReservationMutations(eventId);
  const [localSelection, setLocalSelection] = useState<LocalSeatSelection>({
    eventId,
    mapUpdatedAt: seatMapQuery.dataUpdatedAt,
    seatIds: [],
  });
  const [isActiveReservationDialogOpen, setIsActiveReservationDialogOpen] = useState(false);
  const [isCancelConfirmationOpen, setIsCancelConfirmationOpen] = useState(false);
  const [reservationFeedback, setReservationFeedback] = useState<string | null>(null);
  const selectedSeatIds =
    localSelection.eventId === eventId && localSelection.mapUpdatedAt === seatMapQuery.dataUpdatedAt
      ? localSelection.seatIds
      : [];
  const activeReservation = activeReservationQuery.data;

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

  async function startReservation(): Promise<void> {
    if (!eventId || selectedSeatIds.length === 0) {
      return;
    }

    setReservationFeedback(null);
    const activeReservationResult = await activeReservationQuery.refetch();

    if (activeReservationResult.data) {
      setIsActiveReservationDialogOpen(true);
      return;
    }

    try {
      const reservation = await create({ eventId, eventSeatIds: selectedSeatIds });
      navigate(`/customer/reservations/${reservation.id}`);
    } catch (error) {
      const code = axios.isAxiosError<{ code?: string }>(error)
        ? error.response?.data.code
        : undefined;

      if (code === 'ACTIVE_RESERVATION_EXISTS') {
        await activeReservationQuery.refetch();
        setIsActiveReservationDialogOpen(true);
        return;
      }

      if (code === 'SEAT_UNAVAILABLE') {
        setReservationFeedback('Um ou mais assentos ficaram indisponíveis. Revise a seleção.');
        await seatMapQuery.refetch();
        return;
      }

      setReservationFeedback('Não foi possível criar a reserva. Tente novamente.');
    }
  }

  async function confirmCancellation(): Promise<void> {
    const activeReservation = activeReservationQuery.data;

    if (!activeReservation) {
      return;
    }

    setReservationFeedback(null);
    try {
      await cancel(activeReservation.id);
      setIsCancelConfirmationOpen(false);
      setIsActiveReservationDialogOpen(false);
      setLocalSelection({ eventId, mapUpdatedAt: seatMapQuery.dataUpdatedAt, seatIds: [] });
      setReservationFeedback('Reserva cancelada. Os assentos foram liberados.');
    } catch {
      setReservationFeedback('Não foi possível cancelar a reserva. Tente novamente.');
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12 lg:px-12">
      <Link
        to="/events"
        className="mb-6 inline-flex items-center gap-2 rounded-sm text-sm font-medium text-primary no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Voltar aos eventos
      </Link>

      <article className="mx-auto grid max-w-5xl overflow-hidden bg-[#D8CEBE] p-px [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_16px),calc(100%_-_16px)_100%,0_100%)] sm:grid-cols-[240px_minmax(0,1fr)]">
        <div className="bg-white">
          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt=""
              className="aspect-[2/3] w-full bg-muted object-cover"
            />
          ) : (
            <div className="flex aspect-[2/3] min-h-64 w-full items-center justify-center bg-secondary-foreground font-heading text-5xl text-primary-foreground">
              9¾
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col bg-white p-6 sm:p-8">
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

          <h1 className="mb-0 mt-4 break-words font-heading text-3xl font-semibold leading-tight sm:text-4xl">
            {event.title}
          </h1>

          {event.genres.length > 0 && (
            <p className="mb-0 mt-3 text-[10px] font-semibold uppercase tracking-[1.2px] text-primary">
              {event.genres.join(' · ')}
            </p>
          )}

          <p className="mb-0 mt-4 whitespace-pre-line text-sm leading-6 text-muted-foreground">
            {event.description || 'Sem descrição disponível.'}
          </p>

          <dl className="mt-6 grid gap-4 border-y border-[#E2D9CB] py-4 sm:grid-cols-2">
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

          <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
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
        <section className="mx-auto mt-8 max-w-4xl bg-white p-6 sm:p-8">
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
                {canSelectSeats && (
                  <p className="mb-0 text-sm text-muted-foreground">
                    A seleção ainda não reserva os assentos.
                  </p>
                )}
                {reservationFeedback && (
                  <p role="status" className="mb-0 mt-3 text-sm text-primary">
                    {reservationFeedback}
                  </p>
                )}
                {canSelectSeats && isCustomer && activeReservation && (
                  <div className="mt-4 rounded-[4px] border border-primary/20 bg-primary/5 p-4">
                    <p className="m-0 text-sm font-medium">Você já tem uma reserva em andamento.</p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsActiveReservationDialogOpen(true)}
                      className="mt-3 rounded-[4px]"
                    >
                      Ver reserva em andamento
                    </Button>
                  </div>
                )}
                {canSelectSeats && (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-4 bg-[#2B0A10] p-4 text-primary-foreground sm:p-5">
                    <div>
                      <p aria-live="polite" className="m-0 text-sm font-medium text-[#F5F2EC]">
                        {selectedSeatIds.length === 0
                          ? 'Selecione seus assentos'
                          : `${selectedSeatIds.length} assento${selectedSeatIds.length === 1 ? '' : 's'} selecionado${selectedSeatIds.length === 1 ? '' : 's'}.`}
                      </p>
                      {selectedSeatIds.length > 0 && (
                        <p className="mb-0 mt-1 font-mono text-sm text-[#D9C7A0]">
                          {formatEventPrice(selectedSeatIds.length * event.priceCents)}
                        </p>
                      )}
                    </div>
                    {isCustomer ? (
                      <Button
                        type="button"
                        disabled={selectedSeatIds.length === 0 || isCreating}
                        onClick={() => void startReservation()}
                        className="rounded-[4px] bg-[#681E2B] text-primary-foreground hover:bg-[#4E1420]"
                      >
                        {isCreating ? 'Reservando...' : 'Reservar assentos'}
                      </Button>
                    ) : (
                      <Link
                        to="/login"
                        className={cn(buttonVariants(), 'rounded-[4px] no-underline')}
                      >
                        Entre como cliente para reservar
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {isActiveReservationDialogOpen && activeReservation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="active-reservation-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <section className="w-full max-w-md bg-white p-6 shadow-xl sm:p-8">
            <h2 id="active-reservation-title" className="m-0 font-heading text-3xl font-semibold">
              Você já tem uma reserva em andamento
            </h2>
            <p className="mb-0 mt-4 text-sm leading-6 text-muted-foreground">
              Ela permanece vinculada à sua conta até o horário informado pela reserva. Não é
              possível trocar uma reserva ativa por outra automaticamente.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                onClick={() => {
                  setLocalSelection({
                    eventId,
                    mapUpdatedAt: seatMapQuery.dataUpdatedAt,
                    seatIds: [],
                  });
                  setIsActiveReservationDialogOpen(false);
                  navigate(`/customer/reservations/${activeReservation.id}`);
                }}
                className="rounded-[4px]"
              >
                Voltar à compra
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setIsCancelConfirmationOpen(true)}
                className="rounded-[4px]"
              >
                Cancelar reserva em andamento
              </Button>
            </div>
          </section>
        </div>
      )}

      {isCancelConfirmationOpen && activeReservation && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-reservation-title"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
        >
          <section className="w-full max-w-md bg-white p-6 shadow-xl sm:p-8">
            <h2 id="cancel-reservation-title" className="m-0 font-heading text-3xl font-semibold">
              Cancelar reserva?
            </h2>
            <p className="mb-0 mt-4 text-sm leading-6 text-muted-foreground">
              Seus assentos serão liberados imediatamente e poderão ser reservados por outra pessoa.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={isCancelling}
                onClick={() => setIsCancelConfirmationOpen(false)}
                className="rounded-[4px]"
              >
                Manter reserva
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={isCancelling}
                onClick={() => void confirmCancellation()}
                className="rounded-[4px]"
              >
                {isCancelling ? 'Cancelando...' : 'Confirmar cancelamento'}
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
