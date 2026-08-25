import { RefObject, useEffect, useRef, useState, useMemo } from 'react';

export interface UseInfiniteScrollOptions {
  /**
   * Função executada para carregar o próximo lote ou página de itens.
   */
  onLoadMore: () => unknown;
  /**
   * Indica se ainda existem páginas ou itens adicionais para carregar.
   */
  hasMore: boolean;
  /**
   * Indica se a próxima página está sendo carregada no momento.
   */
  isLoading?: boolean;
  /**
   * Indica se ocorreu erro ao carregar a próxima página.
   */
  isError?: boolean;
  /**
   * Margem do observer para antecipar o carregamento antes do fim da tela.
   * Default: '240px'.
   */
  rootMargin?: string;
  /**
   * Desabilita a observação quando false.
   */
  enabled?: boolean;
}

/**
 * Hook reutilizável para gerenciar o ciclo de vida da paginação infinita via IntersectionObserver.
 * Não dispara novas requisições em caso de erro, evitando loops contínuos de re-renderização.
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading = false,
  isError = false,
  rootMargin = '240px',
  enabled = true,
}: UseInfiniteScrollOptions): RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || !hasMore || !enabled || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && !isLoading && !isError) {
          void onLoadMore();
        }
      },
      { rootMargin },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, hasMore, isError, isLoading, onLoadMore, rootMargin]);

  return sentinelRef;
}

/**
 * Hook para paginação/revelação progressiva de listas locais ou previamente carregadas.
 * Permite informar opcionalmente uma chave semântica de reset para reiniciar a contagem apenas quando houver mudança de filtros/ordenação.
 */
export function useProgressiveList<T>(items: T[], pageSize = 10, resetKey?: unknown) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const previousResetKeyRef = useRef(resetKey);

  useEffect(() => {
    if (resetKey !== undefined && resetKey !== previousResetKeyRef.current) {
      previousResetKeyRef.current = resetKey;
      setVisibleCount(pageSize);
    }
  }, [resetKey, pageSize]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleCount < items.length;

  const sentinelRef = useInfiniteScroll({
    hasMore,
    onLoadMore: () => {
      setVisibleCount((count) => Math.min(count + pageSize, items.length));
    },
  });

  return {
    visibleItems,
    hasMore,
    sentinelRef,
    reset: () => setVisibleCount(pageSize),
  };
}
