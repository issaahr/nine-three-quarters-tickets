import axios from 'axios';
import { Clock3, MapPin, Ticket } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { buttonVariants } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { formatEventDetailDateTime, formatEventPrice } from '../../events/eventPresentation';
import { useEventDetail, useEventSeatMap } from '../../events/hooks';
import { getReservationCountdown } from '../reservationCountdown';
import { useReservation } from '../hooks';
import { ReservationStatus } from '../types';

export function ReservationCheckoutPage() {
  const { reservationId } = useParams<{ reservationId: string }>();
  const reservationQuery = useReservation(reservationId);
  const { refetch: refetchReservation } = reservationQuery;
  const eventId = reservationQuery.data?.eventId;
  const eventQuery = useEventDetail(eventId);
  const seatMapQuery = useEventSeatMap(eventId, Boolean(eventId));
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const expirationRefetchRequested = useRef(false);
  const reservation = reservationQuery.data;
  const countdown = reservation
    ? getReservationCountdown(reservation.expiresAt, currentTimestamp)
    : null;

  useEffect(() => {
    expirationRefetchRequested.current = false;
  }, [reservation?.expiresAt]);

  useEffect(() => {
    if (reservation?.status !== ReservationStatus.Active) {
      return;
    }

    const intervalId = window.setInterval(() => setCurrentTimestamp(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [reservation?.status]);

  useEffect(() => {
    if (
      reservation?.status === ReservationStatus.Active &&
      countdown?.totalSeconds === 0 &&
      !expirationRefetchRequested.current
    ) {
      expirationRefetchRequested.current = true;
      void refetchReservation();
    }
  }, [countdown?.totalSeconds, refetchReservation, reservation?.status]);

  if (reservationQuery.isPending) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6">
        <p role="status" className="text-center text-sm text-muted-foreground">
          Carregando reserva...
        </p>
      </main>
    );
  }

  if (reservationQuery.isError) {
    const notFound =
      axios.isAxiosError(reservationQuery.error) && reservationQuery.error.response?.status === 404;

    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
        <h1 className="m-0 font-heading text-4xl font-semibold">
          {notFound ? 'Reserva não encontrada' : 'Não foi possível carregar a reserva'}
        </h1>
        <p className="mb-6 mt-4 text-sm leading-7 text-muted-foreground">
          {notFound
            ? 'A reserva pode não existir ou não pertencer à sua conta.'
            : 'Tente novamente em instantes.'}
        </p>
        <Link to="/events" className={cn(buttonVariants(), 'rounded-[4px] no-underline')}>
          Voltar aos eventos
        </Link>
      </main>
    );
  }

  if (!reservation) {
    return null;
  }

  const event = eventQuery.data;
  const isExpired = reservation.status === ReservationStatus.Expired;
  const isCancelled = reservation.status === ReservationStatus.Cancelled;
  const isActive = reservation.status === ReservationStatus.Active;
  const seatLabelsById = new Map(
    seatMapQuery.data?.map((seat) => [seat.id, seat.label] as const) ?? [],
  );
  const totalPriceCents = reservation.items.reduce((total, item) => total + item.unitPriceCents, 0);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-12">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <section className="bg-white p-6 sm:p-9">
          <p className="m-0 text-[10px] font-semibold uppercase tracking-[1.5px] text-primary">
            Checkout
          </p>
          <h1 className="mb-0 mt-3 font-heading text-4xl font-semibold">
            {isExpired
              ? 'Sua reserva expirou'
              : isCancelled
                ? 'Sua reserva foi cancelada'
                : 'Sua reserva está em andamento'}
          </h1>

          {isActive && countdown && (
            <div className="mt-6 rounded-[4px] border border-primary/20 bg-primary/5 p-5">
              <p className="m-0 flex items-center gap-2 text-sm font-medium text-primary">
                <Clock3 className="size-4" aria-hidden="true" />
                Tempo restante para esta reserva
              </p>
              <p
                role="timer"
                aria-label="Tempo restante da reserva"
                className="mb-0 mt-2 font-mono text-4xl font-semibold tabular-nums"
              >
                {countdown.formatted}
              </p>
              <p className="mb-0 mt-3 text-xs leading-5 text-muted-foreground">
                A validade definitiva é conferida pela API antes de qualquer operação posterior.
              </p>
            </div>
          )}

          {(isExpired || isCancelled) && (
            <div role="alert" className="mt-6 border-l-4 border-destructive bg-destructive/10 p-4">
              <p className="m-0 text-sm leading-6 text-destructive">
                {isExpired
                  ? 'O prazo terminou e estes assentos não estão mais reservados para você.'
                  : 'Esta reserva não mantém mais os assentos selecionados.'}
              </p>
            </div>
          )}

          {isActive && (
            <p className="mb-0 mt-8 border-t border-[#E2D9CB] pt-6 text-sm leading-6 text-muted-foreground">
              Revise os detalhes do pedido enquanto seus lugares permanecem reservados para você.
            </p>
          )}
        </section>

        <aside className="order-first h-fit bg-[#2B0A10] p-6 text-primary-foreground [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_14px),calc(100%_-14px)_100%,0_100%)] sm:p-8 lg:order-last lg:sticky lg:top-6">
          <p className="m-0 text-[10px] font-semibold uppercase tracking-[1.5px] text-[#A9855B]">
            Resumo do pedido
          </p>
          <h2 className="mb-0 mt-2 font-heading text-2xl font-semibold text-[#F5F2EC]">
            {event?.title ?? 'Evento reservado'}
          </h2>
          {event && (
            <div className="mt-4 space-y-2 text-sm text-[#C9BBA6]">
              <p className="m-0 flex items-start gap-2">
                <Ticket className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {formatEventDetailDateTime(event.startsAt, event.venueTimeZone)}
              </p>
              <p className="m-0 flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {event.venueName} · {event.venueCity}
              </p>
            </div>
          )}
          <ul className="mb-0 mt-6 space-y-3 p-0">
            {reservation.items.map((item, index) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-4 text-sm text-[#D9C7A0]"
              >
                <span>{seatLabelsById.get(item.eventSeatId) ?? `Assento ${index + 1}`}</span>
                <span className="font-mono font-medium">
                  {formatEventPrice(item.unitPriceCents)}
                </span>
              </li>
            ))}
          </ul>
          <div className="my-6 flex gap-1" aria-hidden="true">
            {Array.from({ length: 24 }, (_, index) => (
              <span key={index} className="size-1 rounded-full bg-[#4A2028]" />
            ))}
          </div>
          <div className="flex items-center justify-between gap-4">
            <p className="m-0 text-sm font-medium text-[#F5F2EC]">Total</p>
            <p className="m-0 font-mono text-2xl font-semibold text-[#D9C7A0]">
              {formatEventPrice(totalPriceCents)}
            </p>
          </div>
          <p className="mb-0 mt-5 text-sm leading-6 text-[#C9BBA6]">
            O preço foi registrado no momento em que a reserva foi criada.
          </p>
          <Link
            to={eventId ? `/events/${eventId}` : '/events'}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'mt-6 w-full rounded-[4px] border-[#6B5636] bg-transparent text-primary-foreground no-underline hover:bg-[#3A1A20] hover:text-primary-foreground',
            )}
          >
            {isExpired || isCancelled ? 'Voltar à seleção' : 'Voltar ao evento'}
          </Link>
        </aside>
      </div>
    </main>
  );
}
