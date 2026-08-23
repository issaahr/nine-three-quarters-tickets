import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEventSeatMap } from './hooks';

const apiMocks = vi.hoisted(() => ({
  fetchEventDetail: vi.fn(),
  fetchEventDiscovery: vi.fn(),
  fetchEventSeatMap: vi.fn(),
}));

vi.mock('./api', () => apiMocks);

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  apiMocks.fetchEventSeatMap.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useEventSeatMap', () => {
  it('consulta novamente o mapa para reconciliar holds expirados passivamente', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => useEventSeatMap('event-1', true), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await Promise.resolve();
    });
    expect(apiMocks.fetchEventSeatMap).toHaveBeenCalledOnce();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(apiMocks.fetchEventSeatMap).toHaveBeenCalledTimes(2);
  });

  it('não inicia reconciliação quando o mapa não está habilitado', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    renderHook(() => useEventSeatMap('event-1', false), {
      wrapper: createWrapper(queryClient),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(apiMocks.fetchEventSeatMap).not.toHaveBeenCalled();
  });
});
