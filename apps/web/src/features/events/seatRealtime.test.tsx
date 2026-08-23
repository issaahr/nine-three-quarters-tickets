import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { PropsWithChildren } from 'react';
import { io } from 'socket.io-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSeatRealtime } from './seatRealtime';
import { EventRoomJoined, EventSeatMapItem, EventSeatStatus, RealtimeEvent } from './types';

const socketMock = vi.hoisted(() => {
  const listeners = new Map<string, (...arguments_: unknown[]) => void>();

  return {
    listeners,
    socket: {
      connect: vi.fn(),
      disconnect: vi.fn(),
      emit: vi.fn(),
      on: vi.fn((event: string, listener: (...arguments_: unknown[]) => void) => {
        listeners.set(event, listener);
      }),
    },
  };
});

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => socketMock.socket),
}));

const eventId = 'event-1';
const seatMapQueryKey = ['events', 'seat-map', eventId] as const;
const seatMap: EventSeatMapItem[] = [
  {
    id: 'seat-1',
    label: 'A1',
    row: 'A',
    number: 1,
    x: 0,
    y: 0,
    status: EventSeatStatus.Available,
  },
  {
    id: 'seat-2',
    label: 'A2',
    row: 'A',
    number: 2,
    x: 1,
    y: 0,
    status: EventSeatStatus.Held,
  },
];

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  socketMock.listeners.clear();
  vi.clearAllMocks();
});

describe('useSeatRealtime', () => {
  it('entra novamente na room e reconcilia o mapa por HTTP a cada conexão', () => {
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();

    renderHook(() => useSeatRealtime(eventId, true), {
      wrapper: createWrapper(queryClient),
    });

    expect(io).toHaveBeenCalledWith('http://api.test', {
      autoConnect: false,
      withCredentials: true,
    });
    expect(socketMock.socket.connect).toHaveBeenCalledOnce();

    act(() => socketMock.listeners.get('connect')?.());

    expect(socketMock.socket.emit).toHaveBeenCalledWith(
      RealtimeEvent.EventJoin,
      eventId,
      expect.any(Function),
    );
    expect(invalidateQueries).not.toHaveBeenCalled();

    const acknowledge = socketMock.socket.emit.mock.calls[0]?.[2] as (
      room: EventRoomJoined,
    ) => void;
    act(() => acknowledge({ eventId }));

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: seatMapQueryKey });

    act(() => socketMock.listeners.get('connect')?.());
    const reconnectAcknowledge = socketMock.socket.emit.mock.calls[1]?.[2] as (
      room: EventRoomJoined,
    ) => void;
    act(() => reconnectAcknowledge({ eventId }));

    expect(socketMock.socket.emit).toHaveBeenCalledTimes(2);
    expect(invalidateQueries).toHaveBeenCalledTimes(2);
  });

  it('aplica somente os deltas da ocorrência aberta no cache do mapa', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(seatMapQueryKey, seatMap);

    renderHook(() => useSeatRealtime(eventId, true), {
      wrapper: createWrapper(queryClient),
    });

    act(() => {
      socketMock.listeners.get(RealtimeEvent.SeatHeld)?.({
        eventId,
        eventSeatIds: ['seat-1'],
      });
      socketMock.listeners.get(RealtimeEvent.SeatSold)?.({
        eventId: 'another-event',
        eventSeatIds: ['seat-2'],
      });
      socketMock.listeners.get(RealtimeEvent.SeatReleased)?.({
        eventId,
        eventSeatIds: ['seat-2'],
      });
    });

    expect(queryClient.getQueryData<EventSeatMapItem[]>(seatMapQueryKey)).toEqual([
      expect.objectContaining({ id: 'seat-1', status: EventSeatStatus.Held }),
      expect.objectContaining({ id: 'seat-2', status: EventSeatStatus.Available }),
    ]);
  });

  it('não conecta sem mapa habilitado e desconecta ao desmontar', () => {
    const queryClient = new QueryClient();
    const disabledHook = renderHook(() => useSeatRealtime(eventId, false), {
      wrapper: createWrapper(queryClient),
    });

    expect(io).not.toHaveBeenCalled();
    disabledHook.unmount();

    const enabledHook = renderHook(() => useSeatRealtime(eventId, true), {
      wrapper: createWrapper(queryClient),
    });
    enabledHook.unmount();

    expect(socketMock.socket.disconnect).toHaveBeenCalledOnce();
  });
});
