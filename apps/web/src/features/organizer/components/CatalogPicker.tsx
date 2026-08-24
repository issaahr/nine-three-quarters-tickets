import { Search } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { cn } from '../../../lib/utils';
import { EventCategory } from '../../events/types';
import { useCatalog } from '../hooks';
import { CatalogItem } from '../types';

const fieldClassName =
  'h-11 rounded-[4px] border-border bg-card px-3 text-sm focus-visible:border-primary';
const catalogCardClipPath =
  '[clip-path:polygon(0_0,100%_0,100%_calc(100%_-_8px),calc(100%_-_8px)_100%,0_100%)]';

interface CatalogPickerProps {
  category: EventCategory;
  selectedItem?: CatalogItem;
  onSelect: (item?: CatalogItem) => void;
}

/**
 * Mantém descoberta e seleção restritas ao catálogo correspondente ao tipo de Event escolhido.
 */
export function CatalogPicker({ category, selectedItem, onSelect }: CatalogPickerProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState<string>();
  const [visibleItemCount, setVisibleItemCount] = useState(10);
  const [isAutomaticPaginationPaused, setIsAutomaticPaginationPaused] = useState(false);
  const isShow = category === EventCategory.Show;
  const catalog = useCatalog(category, submittedQuery);
  const loadedItems = [
    ...new Map(
      (catalog.data?.pages.flatMap(({ items }) => items) ?? []).map((item) => [
        item.externalId,
        item,
      ]),
    ).values(),
  ];
  const visibleItems = loadedItems.slice(0, visibleItemCount);
  const fetchNextCatalogPage = catalog.fetchNextPage;
  const hasNextCatalogPage = catalog.hasNextPage;
  const isFetchingNextCatalogPage = catalog.isFetchingNextPage;
  const hasNextCatalogPageError = catalog.isFetchNextPageError;
  const singularLabel = isShow ? 'atração' : 'filme';
  const pluralLabel = isShow ? 'atrações' : 'filmes';

  useEffect(() => {
    if (hasNextCatalogPageError) {
      setIsAutomaticPaginationPaused(true);
    }
  }, [hasNextCatalogPageError]);

  useEffect(() => {
    setIsAutomaticPaginationPaused(false);
  }, [category, submittedQuery]);

  useEffect(() => {
    const target = loadMoreRef.current;

    if (!target || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }

        if (visibleItemCount < loadedItems.length) {
          setVisibleItemCount((current) => Math.min(current + 10, loadedItems.length));
        } else if (
          hasNextCatalogPage &&
          !isFetchingNextCatalogPage &&
          !hasNextCatalogPageError &&
          !isAutomaticPaginationPaused
        ) {
          void fetchNextCatalogPage();
        }
      },
      { rootMargin: '240px' },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    loadedItems.length,
    fetchNextCatalogPage,
    hasNextCatalogPage,
    hasNextCatalogPageError,
    isAutomaticPaginationPaused,
    isFetchingNextCatalogPage,
    visibleItemCount,
  ]);

  /**
   * Inicia a pesquisa somente por ação explícita, evitando chamadas a cada tecla digitada.
   */
  function handleSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const normalizedQuery = catalogQuery.trim();

    if (normalizedQuery.length >= 2) {
      onSelect(undefined);
      setVisibleItemCount(10);
      setSubmittedQuery(normalizedQuery);
      return;
    }

    if (!normalizedQuery) {
      setVisibleItemCount(10);
      setSubmittedQuery(undefined);
    }
  }

  async function handleRetryNextPage(): Promise<void> {
    const result = await catalog.fetchNextPage();

    if (!result.isError) {
      setIsAutomaticPaginationPaused(false);
    }
  }

  return (
    <section aria-labelledby="catalog-search-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="catalog-search-title" className="font-heading text-2xl font-semibold">
          {submittedQuery
            ? `Resultados para “${submittedQuery}”`
            : isShow
              ? 'Shows em alta'
              : 'Filmes em alta'}
        </h2>
        {submittedQuery && (
          <button
            type="button"
            onClick={() => {
              setCatalogQuery('');
              setVisibleItemCount(10);
              setSubmittedQuery(undefined);
            }}
            className="text-xs text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            ← Voltar aos {isShow ? 'shows em alta' : 'filmes em destaque'}
          </button>
        )}
      </div>
      <form onSubmit={handleSearch} className="mt-4 flex gap-2">
        <label htmlFor="catalog-query" className="sr-only">
          Pesquisar {singularLabel}
        </label>
        <Input
          id="catalog-query"
          value={catalogQuery}
          onChange={(event) => setCatalogQuery(event.target.value)}
          placeholder={`Digite ao menos 2 caracteres para buscar ${pluralLabel}`}
          minLength={2}
          maxLength={100}
          required={isShow}
          className={fieldClassName}
        />
        <Button type="submit" disabled={catalog.isFetching} className="h-11 rounded-[4px] px-4">
          <Search aria-hidden="true" />
          <span className="hidden sm:inline">
            {catalog.isFetching && !catalog.isFetchingNextPage ? 'Buscando...' : 'Buscar'}
          </span>
        </Button>
      </form>

      {catalog.isError && !hasNextCatalogPageError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Não foi possível carregar o catálogo. Tente novamente.
        </p>
      )}

      {!catalog.isLoading && submittedQuery && loadedItems.length === 0 && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Nenhum {singularLabel} encontrado para essa busca.
        </p>
      )}

      {visibleItems.length > 0 && (
        <div className="mt-5 grid gap-3" aria-label={`${pluralLabel} disponíveis`}>
          {visibleItems.map((item) => {
            const isSelected = selectedItem?.externalId === item.externalId;

            return (
              <button
                key={item.externalId}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(item)}
                className={cn(
                  'w-full p-[2px] text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  catalogCardClipPath,
                  isSelected ? 'bg-primary' : 'bg-border',
                )}
              >
                <span
                  className={cn('grid grid-cols-[72px_1fr] gap-4 bg-card p-3', catalogCardClipPath)}
                >
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" className="h-[108px] w-[72px] object-cover" />
                  ) : (
                    <span className="flex h-[108px] w-[72px] items-center justify-center bg-muted font-heading text-xl">
                      9¾
                    </span>
                  )}
                  <span className="min-w-0">
                    <strong className="block font-heading text-lg font-semibold">
                      {item.title}
                    </strong>
                    {!isShow && (
                      <span className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                        {item.description ?? 'Descrição não disponível.'}
                      </span>
                    )}
                    {item.genres.length > 0 && (
                      <span className="mt-2 block text-[10px] uppercase tracking-[1px] text-primary">
                        {item.genres.join(' · ')}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {(visibleItemCount < loadedItems.length || catalog.hasNextPage) && (
        <div ref={loadMoreRef} className="h-8" aria-hidden="true" />
      )}
      {catalog.isFetchingNextPage && (
        <p role="status" className="mt-3 text-center text-sm text-muted-foreground">
          Carregando mais {pluralLabel}...
        </p>
      )}
      {hasNextCatalogPageError && (
        <div className="mt-3 text-center">
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar mais {pluralLabel}.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void handleRetryNextPage()}
            className="mt-2"
          >
            Tentar novamente
          </Button>
        </div>
      )}
    </section>
  );
}
