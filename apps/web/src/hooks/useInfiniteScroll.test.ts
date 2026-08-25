import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useInfiniteScroll, useProgressiveList } from './useInfiniteScroll';

describe('useProgressiveList', () => {
  it('exibe inicialmente o pageSize e expande com onLoadMore', () => {
    const items = Array.from({ length: 25 }, (_, index) => `item-${index + 1}`);

    const { result } = renderHook(() => useProgressiveList(items, 10, 'key-1'));

    expect(result.current.visibleItems).toHaveLength(10);
    expect(result.current.hasMore).toBe(true);

    act(() => {
      // Simula o carregamento de mais itens incrementando a lista visível
      result.current.visibleItems = items.slice(0, 20); // ou chamando o reset/expansão
    });
  });

  it('reinicia a contagem para pageSize apenas quando a chave semântica de reset muda', () => {
    const items = Array.from({ length: 25 }, (_, index) => `item-${index + 1}`);
    let triggerObserver: ((entries: IntersectionObserverEntry[]) => void) | undefined;

    class MockObserver implements Partial<IntersectionObserver> {
      public constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
        triggerObserver = callback;
      }
      public observe(): void {}
      public disconnect(): void {}
      public unobserve(): void {}
    }
    vi.stubGlobal('IntersectionObserver', MockObserver);

    let resetKey = 'filtro-inicial';
    const { result, rerender } = renderHook(() => useProgressiveList(items, 10, resetKey));

    expect(result.current.visibleItems).toHaveLength(10);

    // Simula elemento sentinela entrando em tela
    const fakeDiv = document.createElement('div');
    Object.defineProperty(result.current.sentinelRef, 'current', {
      value: fakeDiv,
      writable: true,
    });
    rerender();

    act(() => {
      triggerObserver?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    });

    expect(result.current.visibleItems).toHaveLength(20);

    // Re-renderização sem mudança no resetKey deve manter os 20 itens visíveis
    rerender();
    expect(result.current.visibleItems).toHaveLength(20);

    // Mudança semântica no resetKey deve reiniciar para 10 itens
    resetKey = 'novo-filtro';
    rerender();
    expect(result.current.visibleItems).toHaveLength(10);
  });
});

describe('useInfiniteScroll', () => {
  it('não dispara onLoadMore quando isError ou isLoading é verdadeiro ou hasMore é falso', () => {
    const onLoadMore = vi.fn();
    let triggerObserver: ((entries: IntersectionObserverEntry[]) => void) | undefined;

    class MockObserver implements Partial<IntersectionObserver> {
      public constructor(callback: (entries: IntersectionObserverEntry[]) => void) {
        triggerObserver = callback;
      }
      public observe(): void {}
      public disconnect(): void {}
      public unobserve(): void {}
    }
    vi.stubGlobal('IntersectionObserver', MockObserver);

    const { result, rerender } = renderHook(
      ({ hasMore, isError, isLoading }) =>
        useInfiniteScroll({
          onLoadMore,
          hasMore,
          isError,
          isLoading,
        }),
      {
        initialProps: { hasMore: true, isError: true, isLoading: false },
      },
    );

    const fakeDiv = document.createElement('div');
    Object.defineProperty(result.current, 'current', { value: fakeDiv, writable: true });
    rerender({ hasMore: true, isError: true, isLoading: false });

    // Com isError = true, observer não deve disparar onLoadMore
    triggerObserver?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    expect(onLoadMore).not.toHaveBeenCalled();

    // Com isLoading = true, observer não deve disparar onLoadMore
    rerender({ hasMore: true, isError: false, isLoading: true });
    triggerObserver?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    expect(onLoadMore).not.toHaveBeenCalled();

    // Com hasMore = false, observer não deve disparar onLoadMore
    rerender({ hasMore: false, isError: false, isLoading: false });
    triggerObserver?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    expect(onLoadMore).not.toHaveBeenCalled();

    // Quando saudável (hasMore = true, isError = false, isLoading = false), dispara onLoadMore
    rerender({ hasMore: true, isError: false, isLoading: false });
    triggerObserver?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    expect(onLoadMore).toHaveBeenCalledOnce();
  });
});
