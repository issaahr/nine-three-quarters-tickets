import axios from 'axios';
import { ArrowLeft, CalendarDays, MapPin, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';

import { InfiniteScrollStatus } from '@/components/common/InfiniteScrollStatus';
import { Button } from '@/components/ui/button';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { formatEventDateTime } from '../../events/eventPresentation';
import { useCancelTicketPurchase, useTickets } from '../hooks';
import { getTicketLocationLabel, getTicketStatusLabel } from '../ticketPresentation';
import { TicketPurchase, TicketStatus } from '../types';

const ticketStatusClassName: Record<TicketStatus, string> = {
  [TicketStatus.Valid]: 'text-status-valid',
  [TicketStatus.Used]: 'text-primary-foreground',
  [TicketStatus.Cancelled]: 'text-destructive',
};

export function MyTicketsPage() {
  const ticketsQuery = useTickets();
  const cancelMutation = useCancelTicketPurchase();
  const [purchaseToCancel, setPurchaseToCancel] = useState<TicketPurchase | null>(null);
  const [showRefundNotice, setShowRefundNotice] = useState(false);
  const [showCancellationError, setShowCancellationError] = useState(false);

  const { fetchNextPage, hasNextPage, isFetchingNextPage } = ticketsQuery;
  const isNextPageError = Boolean(
    ticketsQuery.isFetchNextPageError ||
    (ticketsQuery.isError && (ticketsQuery.data?.pages.length ?? 0) > 0),
  );

  const purchases = useMemo(() => {
    const byId = new Map<string, TicketPurchase>();
    for (const page of ticketsQuery.data?.pages ?? []) {
      const items = Array.isArray(page?.items) ? page.items : Array.isArray(page) ? page : [];
      for (const purchase of items) {
        byId.set(purchase.reservationId, purchase);
      }
    }
    return Array.from(byId.values());
  }, [ticketsQuery.data]);

  const sentinelRef = useInfiniteScroll({
    onLoadMore: fetchNextPage,
    hasMore: Boolean(hasNextPage),
    isLoading: isFetchingNextPage,
    isError: isNextPageError,
    rootMargin: '240px',
  });

  if (ticketsQuery.isPending) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 lg:px-12">
        <p role="status" className="text-center text-sm text-muted-foreground">
          Carregando seus ingressos...
        </p>
      </main>
    );
  }

  if (ticketsQuery.isError && purchases.length === 0) {
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

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-12">
      <header className="max-w-2xl">
        <Link
          to="/events"
          className="mb-6 inline-flex items-center gap-2 rounded-sm text-sm font-medium text-primary no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Voltar para a listagem de eventos
        </Link>
        <p className="m-0 text-[10px] font-semibold uppercase tracking-[1.5px] text-primary">
          Histórico
        </p>
        <h1 className="mb-0 mt-3 font-heading text-4xl font-semibold">Meus ingressos</h1>
        <p className="mb-0 mt-3 text-sm leading-6 text-muted-foreground">
          Cada ingresso é individual e possui seu próprio código de acesso.
        </p>
      </header>

      {purchases.length === 0 ? (
        <section className="mt-8 border border-dashed border-border bg-white px-6 py-12 text-center">
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
              <header className="flex items-start justify-between gap-4 border-b border-border pb-5">
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[10px] font-semibold uppercase tracking-[1.5px] text-primary">
                    {purchase.tickets.length}{' '}
                    {purchase.tickets.length === 1
                      ? 'ingresso nesta compra'
                      : 'ingressos nesta compra'}
                  </p>
                  <h2 className="mb-0 mt-2 break-words font-heading text-2xl font-semibold">
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
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!purchase.canCancel}
                  onClick={() => setPurchaseToCancel(purchase)}
                  aria-label="Cancelar compra"
                  className="shrink-0 rounded-[4px]"
                >
                  Cancelar<span className="hidden sm:inline"> compra</span>
                </Button>
              </header>

              <ul className="mb-0 mt-5 space-y-3 p-0">
                {purchase.tickets.map((ticket) => (
                  <li key={ticket.publicId}>
                    <Link
                      to={`/customer/tickets/${encodeURIComponent(ticket.credential)}`}
                      className="flex w-full items-center justify-between gap-4 bg-secondary-foreground px-4 py-4 text-background no-underline transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary [clip-path:polygon(0_0,100%_0,100%_calc(100%_-_14px),calc(100%_-14px)_100%,0_100%)]"
                    >
                      <div>
                        <p className="m-0 text-sm font-medium">
                          {getTicketLocationLabel(ticket.seatLabel)}
                        </p>
                        <p className="mb-0 mt-1 font-mono text-xs tracking-[0.12em] text-primary-foreground">
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
          {hasNextPage && <div ref={sentinelRef} className="h-8" aria-hidden="true" />}
          <InfiniteScrollStatus
            isLoading={isFetchingNextPage}
            isError={isNextPageError}
            onRetry={() => void fetchNextPage()}
            loadingText="Carregando mais compras..."
            errorText="Não foi possível carregar mais ingressos."
            retryText="Tentar novamente"
          />
        </div>
      )}
      {purchaseToCancel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-purchase-title"
        >
          <section className="w-full max-w-md bg-white p-6 shadow-xl sm:p-8">
            <h2 id="cancel-purchase-title" className="m-0 font-heading text-3xl font-semibold">
              Cancelar compra?
            </h2>
            <p className="mb-0 mt-4 text-sm leading-6 text-muted-foreground">
              Todos os ingressos desta compra serão cancelados. O reembolso integral será feito pelo
              mesmo método de pagamento utilizado.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={cancelMutation.isPending}
                onClick={() => setPurchaseToCancel(null)}
                className="rounded-[4px]"
              >
                Manter compra
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={cancelMutation.isPending}
                onClick={() =>
                  cancelMutation.mutate(purchaseToCancel.reservationId, {
                    onSuccess: () => {
                      setPurchaseToCancel(null);
                      setShowRefundNotice(true);
                    },
                    onError: () => {
                      setPurchaseToCancel(null);
                      setShowCancellationError(true);
                    },
                  })
                }
                className="rounded-[4px]"
              >
                {cancelMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
              </Button>
            </div>
          </section>
        </div>
      )}
      {showRefundNotice && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-notice-title"
        >
          <section className="w-full max-w-md bg-white p-6 text-center shadow-xl sm:p-8">
            <h2 id="refund-notice-title" className="m-0 font-heading text-3xl font-semibold">
              Cancelamento confirmado
            </h2>
            <p className="mb-0 mt-4 text-sm leading-6 text-muted-foreground">
              O valor será reembolsado pelo método de pagamento original.
            </p>
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                onClick={() => setShowRefundNotice(false)}
                className="rounded-[4px]"
              >
                Fechar
              </Button>
            </div>
          </section>
        </div>
      )}
      {showCancellationError && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-purchase-error-title"
        >
          <section className="w-full max-w-md bg-white p-6 text-center shadow-xl sm:p-8">
            <h2
              id="cancel-purchase-error-title"
              className="m-0 font-heading text-3xl font-semibold"
            >
              Não foi possível cancelar
            </h2>
            <p className="mb-0 mt-4 text-sm leading-6 text-muted-foreground">
              Não foi possível cancelar — atualize a página e tente novamente.
            </p>
            <div className="mt-6 flex justify-center">
              <Button
                type="button"
                onClick={() => setShowCancellationError(false)}
                className="rounded-[4px]"
              >
                Fechar
              </Button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
