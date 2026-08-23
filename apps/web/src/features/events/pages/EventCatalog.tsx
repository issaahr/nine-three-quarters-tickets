import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '../../../components/ui/button';
import { EventCard } from '../components/EventCard';
import { allCategoriesValue, EventCategoryControl } from '../components/EventCategoryControl';
import { EventFilters } from '../components/EventFilters';
import { useEventDiscovery } from '../hooks';
import { EventCategory, EventDiscoveryFilters, EventDiscoveryItem } from '../types';

/** Exibe a descoberta pública e carrega novas páginas quando o fim da grade se aproxima. */
export function EventCatalog() {
  const [filters, setFilters] = useState<EventDiscoveryFilters>({});
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const query = useEventDiscovery(filters);
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = query;

  const events = useMemo(() => {
    const byId = new Map<string, EventDiscoveryItem>();
    query.data?.pages.flatMap((page) => page.items).forEach((event) => byId.set(event.id, event));
    return [...byId.values()];
  }, [query.data]);

  const category = filters.category ?? allCategoriesValue;
  const suggestedGenres = useMemo(
    () =>
      [
        ...new Set(
          events
            .filter((event) => category === allCategoriesValue || event.category === category)
            .flatMap((event) => event.genres),
        ),
      ].sort(),
    [category, events],
  );

  function handleCategoryChange(nextCategory: EventCategory | typeof allCategoriesValue): void {
    const compatibleGenres = new Set(
      events
        .filter((event) => nextCategory === allCategoriesValue || event.category === nextCategory)
        .flatMap((event) => event.genres),
    );

    setFilters((currentFilters) => ({
      ...currentFilters,
      category: nextCategory === allCategoriesValue ? undefined : nextCategory,
      genre: compatibleGenres.has(currentFilters.genre ?? '') ? currentFilters.genre : undefined,
    }));
  }

  useEffect(() => {
    const target = loadMoreRef.current;

    if (!target || !hasNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: '320px 0px' },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-10 sm:px-6 sm:py-14 lg:px-12 2xl:px-16">
      <header className="mb-8 max-w-3xl">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[2px] text-primary">
          Próximos eventos
        </p>
        <h1 className="m-0 font-heading text-4xl font-semibold leading-tight sm:text-5xl">
          Encontre sua próxima experiência
        </h1>
        <p className="mb-0 mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
          Descubra eventos disponíveis em sua cidade e em todo o Brasil
        </p>
      </header>

      <EventFilters filters={filters} suggestedGenres={suggestedGenres} onApply={setFilters} />

      <div className="mt-5">
        <EventCategoryControl category={category} onChange={handleCategoryChange} />
      </div>

      <section className="mt-8" aria-label="Eventos encontrados" aria-busy={query.isFetching}>
        {query.isPending ? (
          <p role="status" className="py-16 text-center text-sm text-muted-foreground">
            Carregando eventos...
          </p>
        ) : query.isError && events.length === 0 ? (
          <div className="border border-[#D8CEBE] bg-white px-6 py-12 text-center">
            <h2 className="m-0 font-heading text-2xl">Não foi possível carregar os eventos</h2>
            <p className="mb-5 mt-2 text-sm text-muted-foreground">Tente novamente em instantes.</p>
            <Button type="button" onClick={() => void query.refetch()} className="rounded-[4px]">
              Tentar novamente
            </Button>
          </div>
        ) : events.length === 0 ? (
          <div className="border border-[#D8CEBE] bg-white px-6 py-12 text-center">
            <h2 className="m-0 font-heading text-2xl">
              {hasFilters ? 'Nenhum evento corresponde aos filtros' : 'Nenhum evento disponível'}
            </h2>
            <p className="mb-0 mt-2 text-sm text-muted-foreground">
              {hasFilters
                ? 'Revise os critérios da busca para encontrar outras opções.'
                : 'Novas experiências aparecerão aqui assim que forem publicadas.'}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
            <div ref={loadMoreRef} className="h-px" aria-hidden="true" />
            {query.isFetchingNextPage && (
              <p role="status" className="py-8 text-center text-sm text-muted-foreground">
                Carregando mais eventos...
              </p>
            )}
            {query.isError && (
              <div role="alert" className="py-8 text-center text-sm text-destructive">
                Não foi possível carregar mais eventos.
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
