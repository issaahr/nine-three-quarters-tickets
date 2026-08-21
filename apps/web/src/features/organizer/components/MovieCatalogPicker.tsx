import { Search } from 'lucide-react';
import { FormEvent, useEffect, useRef, useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { cn } from '../../../lib/utils';
import { useMovieCatalog } from '../hooks';
import { CatalogItem } from '../types';

const fieldClassName =
  'h-11 rounded-[4px] border-[#B8AEA0] bg-white px-3 text-sm focus-visible:border-primary';
const movieCardClipPath =
  '[clip-path:polygon(0_0,100%_0,100%_calc(100%_-_8px),calc(100%_-_8px)_100%,0_100%)]';

interface MovieCatalogPickerProps {
  selectedMovie?: CatalogItem;
  onSelect: (movie?: CatalogItem) => void;
}

/**
 * Coordena descoberta, pesquisa e paginação do catálogo para a seleção de um filme.
 */
export function MovieCatalogPicker({ selectedMovie, onSelect }: MovieCatalogPickerProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [movieQuery, setMovieQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState<string>();
  const [visibleMovieCount, setVisibleMovieCount] = useState(10);
  const movieCatalog = useMovieCatalog(submittedQuery);
  const loadedMovies = movieCatalog.data?.pages.flatMap(({ items }) => items) ?? [];
  const visibleMovies = loadedMovies.slice(0, visibleMovieCount);
  const fetchNextCatalogPage = movieCatalog.fetchNextPage;
  const hasNextCatalogPage = movieCatalog.hasNextPage;
  const isFetchingNextCatalogPage = movieCatalog.isFetchingNextPage;

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

        if (visibleMovieCount < loadedMovies.length) {
          setVisibleMovieCount((current) => Math.min(current + 10, loadedMovies.length));
        } else if (hasNextCatalogPage && !isFetchingNextCatalogPage) {
          void fetchNextCatalogPage();
        }
      },
      { rootMargin: '240px' },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    loadedMovies.length,
    fetchNextCatalogPage,
    hasNextCatalogPage,
    isFetchingNextCatalogPage,
    visibleMovieCount,
  ]);

  /**
   * Inicia a pesquisa somente por ação explícita, evitando chamadas a cada tecla digitada.
   *
   * @param event - Submissão do formulário independente de pesquisa.
   */
  function handleMovieSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const normalizedQuery = movieQuery.trim();

    if (normalizedQuery.length >= 2) {
      onSelect(undefined);
      setVisibleMovieCount(10);
      setSubmittedQuery(normalizedQuery);
    }
  }

  return (
    <section aria-labelledby="movie-search-title">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="movie-search-title" className="font-heading text-2xl font-semibold">
          {submittedQuery ? 'Resultados da pesquisa' : 'Filmes em alta'}
        </h2>
        {submittedQuery && (
          <span className="text-xs text-muted-foreground">Busca por “{submittedQuery}”</span>
        )}
      </div>
      <form onSubmit={handleMovieSearch} className="mt-4 flex gap-2">
        <label htmlFor="movie-query" className="sr-only">
          Pesquisar filme
        </label>
        <Input
          id="movie-query"
          value={movieQuery}
          onChange={(event) => setMovieQuery(event.target.value)}
          placeholder="Digite ao menos 2 caracteres"
          minLength={2}
          maxLength={100}
          required
          className={fieldClassName}
        />
        <Button
          type="submit"
          disabled={movieQuery.trim().length < 2 || movieCatalog.isFetching}
          className="h-11 rounded-[4px] px-4"
        >
          <Search aria-hidden="true" />
          <span className="hidden sm:inline">
            {movieCatalog.isFetching && !movieCatalog.isFetchingNextPage ? 'Buscando...' : 'Buscar'}
          </span>
        </Button>
      </form>

      {movieCatalog.isError && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          Não foi possível carregar o catálogo. Tente novamente.
        </p>
      )}

      {!movieCatalog.isLoading && submittedQuery && loadedMovies.length === 0 && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Nenhum filme encontrado para essa busca.
        </p>
      )}

      {visibleMovies.length > 0 && (
        <div className="mt-5 grid gap-3" aria-label="Filmes disponíveis">
          {visibleMovies.map((movie) => {
            const isSelected = selectedMovie?.externalId === movie.externalId;

            return (
              <button
                key={movie.externalId}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(movie)}
                className={cn(
                  'w-full p-[2px] text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  movieCardClipPath,
                  isSelected ? 'bg-primary' : 'bg-[#DED6C7]',
                )}
              >
                <span
                  className={cn('grid grid-cols-[72px_1fr] gap-4 bg-white p-3', movieCardClipPath)}
                >
                  {movie.imageUrl ? (
                    <img src={movie.imageUrl} alt="" className="h-[108px] w-[72px] object-cover" />
                  ) : (
                    <span className="flex h-[108px] w-[72px] items-center justify-center bg-muted font-heading text-xl">
                      9¾
                    </span>
                  )}
                  <span className="min-w-0">
                    <strong className="block font-heading text-lg font-semibold">
                      {movie.title}
                    </strong>
                    <span className="mt-1 line-clamp-3 text-xs leading-5 text-muted-foreground">
                      {movie.description ?? 'Descrição não disponível.'}
                    </span>
                    {movie.genres.length > 0 && (
                      <span className="mt-2 block text-[10px] uppercase tracking-[1px] text-primary">
                        {movie.genres.join(' · ')}
                      </span>
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {(visibleMovieCount < loadedMovies.length || movieCatalog.hasNextPage) && (
        <div ref={loadMoreRef} className="h-8" aria-hidden="true" />
      )}
      {movieCatalog.isFetchingNextPage && (
        <p role="status" className="mt-3 text-center text-sm text-muted-foreground">
          Carregando mais filmes...
        </p>
      )}
    </section>
  );
}
