import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

import { environment } from '../../config/environment';
import {
  EventRoomJoined,
  EventSeatMapItem,
  EventSeatStatus,
  RealtimeEvent,
  SeatRealtimeDelta,
} from './types';

interface ServerToClientEvents {
  [RealtimeEvent.SeatHeld]: (delta: SeatRealtimeDelta) => void;
  [RealtimeEvent.SeatSold]: (delta: SeatRealtimeDelta) => void;
  [RealtimeEvent.SeatReleased]: (delta: SeatRealtimeDelta) => void;
}

interface ClientToServerEvents {
  [RealtimeEvent.EventJoin]: (
    eventId: string,
    acknowledge: (room: EventRoomJoined) => void,
  ) => void;
}

/**
 * Projeta deltas realtime no mapa em cache e reconcilia seu estado autoritativo após reconexões.
 * A conexão é descartável: PostgreSQL e a consulta HTTP continuam sendo a fonte de verdade.
 *
 * @param eventId - Identificador da ocorrência cuja room e mapa devem ser acompanhados.
 * @param enabled - Indica se a ocorrência possui mapa seated e deve abrir a conexão realtime.
 */
export function useSeatRealtime(eventId: string | undefined, enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!eventId || !enabled) {
      return;
    }

    const seatMapQueryKey = ['events', 'seat-map', eventId] as const;
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(environment.apiUrl, {
      autoConnect: false,
      withCredentials: true,
    });

    const applyDelta = (delta: SeatRealtimeDelta, status: EventSeatStatus): void => {
      if (delta.eventId !== eventId) {
        return;
      }

      const changedSeatIds = new Set(delta.eventSeatIds);
      queryClient.setQueryData<EventSeatMapItem[]>(seatMapQueryKey, (currentSeatMap) =>
        currentSeatMap?.map((seat) =>
          changedSeatIds.has(seat.id) && seat.status !== status ? { ...seat, status } : seat,
        ),
      );
    };

    socket.on('connect', () => {
      socket.emit(RealtimeEvent.EventJoin, eventId, () => {
        void queryClient.invalidateQueries({ queryKey: seatMapQueryKey });
      });
    });
    socket.on(RealtimeEvent.SeatHeld, (delta) => applyDelta(delta, EventSeatStatus.Held));
    socket.on(RealtimeEvent.SeatSold, (delta) => applyDelta(delta, EventSeatStatus.Sold));
    socket.on(RealtimeEvent.SeatReleased, (delta) => applyDelta(delta, EventSeatStatus.Available));
    socket.connect();

    return () => {
      socket.disconnect();
    };
  }, [enabled, eventId, queryClient]);
}
