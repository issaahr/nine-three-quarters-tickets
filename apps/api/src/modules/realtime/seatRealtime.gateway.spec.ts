import { randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';

import { RealtimeModule } from './realtime.module';
import { RealtimeEvent } from './realtimeEvent.enum';
import { SeatRealtimeGateway } from './seatRealtime.gateway';
import { EventRoomJoined, SeatRealtimeDelta } from './seatRealtime.interfaces';

describe('SeatRealtimeGateway', () => {
  let app: INestApplication;
  let gateway: SeatRealtimeGateway;
  let serverUrl: string;
  const clients: Socket[] = [];

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [RealtimeModule] }).compile();

    app = testingModule.createNestApplication();
    await app.listen(0, '127.0.0.1');
    gateway = app.get(SeatRealtimeGateway);

    const address = app.getHttpServer().address() as AddressInfo;
    serverUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(() => {
    clients.splice(0).forEach((client) => client.disconnect());
  });

  afterAll(async () => {
    await app.close();
  });

  function connectClient(): Promise<Socket> {
    const client = io(serverUrl, {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
    });
    clients.push(client);

    return new Promise((resolve, reject) => {
      client.once('connect', () => resolve(client));
      client.once('connect_error', reject);
    });
  }

  function joinEvent(client: Socket, eventId: string): Promise<EventRoomJoined> {
    return new Promise((resolve) => {
      client.emit(RealtimeEvent.EventJoin, eventId, resolve);
    });
  }

  function waitForDelta(client: Socket, event: RealtimeEvent): Promise<SeatRealtimeDelta> {
    return new Promise((resolve) => {
      client.once(event, resolve);
    });
  }

  it('entrega o delta aos clientes da mesma room e isola outra ocorrência', async () => {
    const firstEventId = randomUUID();
    const secondEventId = randomUUID();
    const [firstClient, secondClient, isolatedClient] = await Promise.all([
      connectClient(),
      connectClient(),
      connectClient(),
    ]);
    await Promise.all([
      joinEvent(firstClient, firstEventId),
      joinEvent(secondClient, firstEventId),
      joinEvent(isolatedClient, secondEventId),
    ]);
    const delta = { eventId: firstEventId, eventSeatIds: [randomUUID()] };
    const firstReceived = waitForDelta(firstClient, RealtimeEvent.SeatHeld);
    const secondReceived = waitForDelta(secondClient, RealtimeEvent.SeatHeld);
    const isolatedListener = jest.fn();
    isolatedClient.on(RealtimeEvent.SeatHeld, isolatedListener);

    gateway.emitHeld(delta);

    await expect(firstReceived).resolves.toEqual(delta);
    await expect(secondReceived).resolves.toEqual(delta);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(isolatedListener).not.toHaveBeenCalled();
  });

  it('remove a room anterior quando o cliente troca de Event', async () => {
    const firstEventId = randomUUID();
    const secondEventId = randomUUID();
    const client = await connectClient();
    await expect(joinEvent(client, firstEventId)).resolves.toEqual({ eventId: firstEventId });
    await expect(joinEvent(client, secondEventId)).resolves.toEqual({ eventId: secondEventId });
    const listener = jest.fn();
    client.on(RealtimeEvent.SeatReleased, listener);

    gateway.emitReleased({ eventId: firstEventId, eventSeatIds: [randomUUID()] });
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(listener).not.toHaveBeenCalled();

    const expectedDelta = { eventId: secondEventId, eventSeatIds: [randomUUID()] };
    gateway.emitReleased(expectedDelta);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(listener).toHaveBeenCalledWith(expectedDelta);
  });
});
