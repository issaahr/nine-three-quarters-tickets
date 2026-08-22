import axios from 'axios';
import { CalendarDays, MapPin, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';

import { formatEventDateTime } from '../../events/eventPresentation';
import { useTickets } from '../hooks';
import { getTicketLocationLabel, getTicketStatusLabel } from '../ticketPresentation';
import { TicketStatus } from '../types';

const ticketStatusClassName: Record<TicketStatus, string> = {
  [TicketStatus.Valid]: 'text-[#8FBF9F]',
  [TicketStatus.Used]: 'text-[#C9BBA6]',
  [TicketStatus.Cancelled]: 'text-[#D99999]',
};

export function MyTicketsPage() {
  const ticketsQuery = useTickets();

  if (ticketsQuery.isPending) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:px-12">
        <p role="status" className="text-center text-sm text-muted-foreground">
          Carregando seus ingressos...
        </p>
      </main>
    );
  }

  if (ticketsQuery.isError) {
    const forbidden =
      axios.isAxiosError(ticketsQuery.error) && ticketsQuery.error.response?.status === 403;

    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-20 text-center sm:px-6">
        <h1 className="m-0 font-heading text-4xl font-semibold">
          {forbidden
            ? 'Esta área é exclusiva para clientes'
            : 'Não foi possível carregar seus ingressos'}
        </h1>
        <p className="mb-0 mt-4 text-sm leading-7 text-muted-foreground">
          {forbidden
            ? 'Entre com uma conta de cliente para consultar as compras confirmadas.'
            : 'Tente novamente em instantes.'}
        </p>
      </main>
    );
  }

  const purchases = ticketsQuery.data ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-12">
      <header className="max-w-2xl">
        <p className="m-0 text-[10px] font-semibold uppercase tracking-[1.5px] text-primary">
          Área do cliente
        </p>
        <h1 className="mb-0 mt-3 font-heading text-4xl font-semibold">Meus ingressos</h1>
        <p className="mb-0 mt-3 text-sm leading-6 text-muted-foreground">
          Cada item representa uma entrada individual e possui sua própria credencial.
        </p>
      </header>

      {purchases.length === 0 ? (
        <section className="mt-8 border border-dashed border-[#C9BBA6] bg-white px-6 py-12 text-center">
          <Ticket className="mx-auto size-7 text-primary" aria-hidden="true" />
          <h2 className="mb-0 mt-4 font-heading text-2xl font-semibold">Nenhum ingresso emitido</h2>
          <p className="mb-0 mt-2 text-sm leading-6 text-muted-foreground">
            Quando uma compra for confirmada, os ingressos individuais aparecerão aqui.
          </p>
        </section>
      ) : (
        <div className="mt-8 space-y-8">
          {purchases.map((purchase) => (
            <section key={purchase.reservationId} className="bg-white p-5 sm:p-7">
              <header className="border-b border-[#E1DACB] pb-5">
                <p className="m-0 text-[10px] font-semibold uppercase tracking-[1.5px] text-primary">
                  {purchase.tickets.length}{' '}
                  {purchase.tickets.length === 1
                    ? 'ingresso nesta compra'
                    : 'ingressos nesta compra'}
                </p>
                <h2 className="mb-0 mt-2 font-heading text-2xl font-semibold">
                  {purchase.event.title}
                </h2>
                <div className="mt-3 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-5">
                  <p className="m-0 flex items-center gap-2">
                    <CalendarDays className="size-4 text-primary" aria-hidden="true" />
                    {formatEventDateTime(purchase.event.startsAt, purchase.event.venueTimeZone)}
                  </p>
                  <p className="m-0 flex items-center gap-2">
                    <MapPin className="size-4 text-primary" aria-hidden="true" />
                    {purchase.event.venueName} · {purchase.event.venueCity}
                  </p>
                </div>
              </header>

              <ul className="mb-0 mt-5 space-y-3 p-0">
                {purchase.tickets.map((ticket) => (
                  <li key={ticket.publicId}>
                    <Link
                      to={`/customer/tickets/${encodeURIComponent(ticket.credential)}`}
                      className="flex w-full items-center justify-between gap-4 bg-[#2B0A10] px-4 py-4 text-[#F5F2EC] no-underline transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_14px),calc(100%_-14px)_100%,0_100%)]"
                    >
                      <div>
                        <p className="m-0 text-sm font-medium">
                          {getTicketLocationLabel(ticket.seatLabel)}
                        </p>
                        <p className="mb-0 mt-1 font-mono text-xs tracking-[0.12em] text-[#D9C7A0]">
                          {ticket.manualCode}
                        </p>
                      </div>
                      <span
                        className={`font-mono text-[10px] font-medium uppercase tracking-[0.12em] ${ticketStatusClassName[ticket.status]}`}
                      >
                        {getTicketStatusLabel(ticket.status)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
