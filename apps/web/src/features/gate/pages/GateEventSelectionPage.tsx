import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { InfiniteScrollStatus } from '@/components/common/InfiniteScrollStatus';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';
import { formatEventDetailDateTime } from '../../events/eventPresentation';
import { useGateEvents } from '../hooks';
import { GateEvent } from '../types';

export function GateEventSelectionPage() {
  const [showOnlyToday, setShowOnlyToday] = useState(false);
  const eventsQuery = useGateEvents({ today: showOnlyToday || undefined });
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = eventsQuery;
  const isNextPageError = Boolean(
    eventsQuery.isFetchNextPageError ||
    (eventsQuery.isError && (eventsQuery.data?.pages.length ?? 0) > 0),
  );

  const events = useMemo(() => {
    const byId = new Map<string, GateEvent>();
    for (const page of eventsQuery.data?.pages ?? []) {
      const items = Array.isArray(page?.items) ? page.items : Array.isArray(page) ? page : [];
      for (const event of items) {
        byId.set(event.id, event);
      }
    }
    return Array.from(byId.values());
  }, [eventsQuery.data]);

  const sentinelRef = useInfiniteScroll({
    onLoadMore: fetchNextPage,
    hasMore: Boolean(hasNextPage),
    isLoading: isFetchingNextPage,
    isError: isNextPageError,
    rootMargin: '240px',
  });

  if (eventsQuery.isPending) {
    return <main className="px-6 py-12 lg:px-8">Carregando Events para operação...</main>;
  }

  if (eventsQuery.isError && events.length === 0) {
    return (
      <main className="px-6 py-12 lg:px-8">
        <h1 className="font-heading text-3xl font-semibold">
          Não foi possível carregar a portaria
        </h1>
        <p className="mt-3 text-surface-dark-muted">Tente novamente em instantes.</p>
      </main>
    );
  }

  if (events.length === 0 && !showOnlyToday) {
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

      {events.length === 0 ? (
        <p className="mt-8 text-surface-dark-muted">Não há Events para hoje.</p>
      ) : (
        <>
          <ul className="mt-8 grid gap-3" aria-label="Events disponíveis para operação">
            {events.map((event) => (
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
          {hasNextPage && <div ref={sentinelRef} className="h-8" aria-hidden="true" />}
          <InfiniteScrollStatus
            isLoading={isFetchingNextPage}
            isError={isNextPageError}
            onRetry={() => void fetchNextPage()}
            loadingText="Carregando mais eventos..."
            errorText="Não foi possível carregar mais eventos."
            retryText="Tentar novamente"
          />
        </>
      )}
    </main>
  );
}
