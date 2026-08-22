import { Logger, ParseUUIDPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

import { applicationConfig } from '../../config/applicationConfig';
import { RealtimeEvent } from './realtimeEvent.enum';
import { EventRoomJoined, SeatRealtimeDelta } from './seatRealtime.interfaces';

const eventRoomPrefix = 'event:';

/**
 * Projeta mudanças persistidas do inventário para clientes conectados à ocorrência.
 * O gateway não participa de decisões transacionais nem garante entrega dos deltas.
 */
@WebSocketGateway({
  cors: {
    origin: applicationConfig.corsOrigins,
    credentials: true,
  },
})
export class SeatRealtimeGateway {
  private readonly logger = new Logger(SeatRealtimeGateway.name);

  @WebSocketServer()
  private server!: Server;

  /**
   * Move o cliente para a room da ocorrência solicitada e remove sua room de ocorrência anterior.
   *
   * @param client - Conexão Socket.IO que solicitou a troca de contexto.
   * @param eventId - Identificador validado da ocorrência que o cliente acompanhará.
   * @returns Confirmação da ocorrência associada à conexão.
   */
  @SubscribeMessage(RealtimeEvent.EventJoin)
  public async joinEventRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody(new ParseUUIDPipe({ version: '4' })) eventId: string,
  ): Promise<EventRoomJoined> {
    const targetRoom = this.getEventRoom(eventId);
    const previousEventRooms = [...client.rooms].filter(
      (room) => room.startsWith(eventRoomPrefix) && room !== targetRoom,
    );

    await Promise.all(previousEventRooms.map((room) => client.leave(room)));
    await client.join(targetRoom);

    return { eventId };
  }

  /**
   * Projeta assentos que passaram a manter um hold válido.
   *
   * @param delta - Ocorrência e EventSeats alterados pela operação persistida.
   */
  public emitHeld(delta: SeatRealtimeDelta): void {
    this.emit(RealtimeEvent.SeatHeld, delta);
  }

  /**
   * Projeta assentos vendidos após a confirmação da compra.
   *
   * @param delta - Ocorrência e EventSeats alterados pela operação persistida.
   */
  public emitSold(delta: SeatRealtimeDelta): void {
    this.emit(RealtimeEvent.SeatSold, delta);
  }

  /**
   * Projeta assentos liberados por uma operação persistida.
   *
   * @param delta - Ocorrência e EventSeats alterados pela operação persistida.
   */
  public emitReleased(delta: SeatRealtimeDelta): void {
    this.emit(RealtimeEvent.SeatReleased, delta);
  }

  private emit(event: RealtimeEvent, delta: SeatRealtimeDelta): void {
    try {
      this.server.to(this.getEventRoom(delta.eventId)).emit(event, delta);
    } catch (error) {
      this.logger.error(
        `Falha ao emitir ${event} para o evento ${delta.eventId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private getEventRoom(eventId: string): string {
    return `${eventRoomPrefix}${eventId}`;
  }
}
