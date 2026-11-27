import { randomUUID } from 'node:crypto';

import { Test } from '@nestjs/testing';
import request from 'supertest';
import { In } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Application } from '../src/application';
import { Event } from '../src/modules/events/event.entity';
import { EventSeat } from '../src/modules/events/eventSeat.entity';
import { PaymentInProgressError } from '../src/modules/payments/errors/paymentInProgress.error';
import { ReservationAlreadyPaidError } from '../src/modules/payments/errors/reservationAlreadyPaid.error';
import { Payment } from '../src/modules/payments/payment.entity';
import { PaymentCurrency } from '../src/modules/payments/paymentCurrency.enum';
import { PaymentMethod } from '../src/modules/payments/paymentMethod.enum';
import { PaymentProvider } from '../src/modules/payments/paymentProvider.enum';
import {
  CardPaymentGatewayResult,
  CardPaymentGatewayStatus,
} from '../src/modules/payments/paymentGateway.interfaces';
import { PaymentStatus } from '../src/modules/payments/paymentStatus.enum';
import { Reservation } from '../src/modules/reservations/reservation.entity';
import { PaymentsTestContext } from './support/paymentsTestContext';

describe('Simulated payments', () => {
  const context = new PaymentsTestContext();

  it('persiste PENDING antes do gateway e não o chama outra vez para a mesma key', async () => {
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();
    const idempotencyKey = randomUUID();
    let resolveGateway!: (result: CardPaymentGatewayResult) => void;
    let notifyGatewayStarted!: () => void;
    const gatewayStarted = new Promise<void>((resolve) => {
      notifyGatewayStarted = resolve;
    });
    const gatewayResult = new Promise<CardPaymentGatewayResult>((resolve) => {
      resolveGateway = resolve;
    });
    context.paymentGateway.processCard.mockImplementationOnce(async () => {
      notifyGatewayStarted();
      return gatewayResult;
    });

    const firstResponsePromise = context
      .createPaymentRequest(reservation.id, idempotencyKey, cookie)
      .expect(201)
      .then((response) => response);
    await gatewayStarted;
    const pendingPayment = await context.paymentsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    const retryResponse = await context
      .createPaymentRequest(reservation.id, idempotencyKey, cookie)
      .expect(201);
    resolveGateway({ status: CardPaymentGatewayStatus.Approved });
    const firstResponse = await firstResponsePromise;
    const completedRetryResponse = await context
      .createPaymentRequest(reservation.id, idempotencyKey, cookie)
      .expect(201);

    expect(pendingPayment).toMatchObject({
      reservationId: reservation.id,
      status: PaymentStatus.Pending,
      provider: PaymentProvider.Fake,
      amountCents: 2590,
      currency: PaymentCurrency.Brl,
      externalReference: null,
      approvedAt: null,
      failedAt: null,
    });
    expect(retryResponse.body).toMatchObject({
      id: firstResponse.body.id,
      status: PaymentStatus.Pending,
    });
    expect(firstResponse.body.status).toBe(PaymentStatus.Approved);
    expect(completedRetryResponse.body).toMatchObject({
      id: firstResponse.body.id,
      status: PaymentStatus.Approved,
    });
    expect(context.paymentGateway.processCard).toHaveBeenCalledTimes(1);
    expect(context.seatRealtimeGateway.emitSold).toHaveBeenCalledTimes(1);
  });

  it('rejeita key diferente enquanto existir Payment PENDING', async () => {
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();
    let resolveGateway!: (result: CardPaymentGatewayResult) => void;
    let notifyGatewayStarted!: () => void;
    const gatewayStarted = new Promise<void>((resolve) => {
      notifyGatewayStarted = resolve;
    });
    const gatewayResult = new Promise<CardPaymentGatewayResult>((resolve) => {
      resolveGateway = resolve;
    });
    context.paymentGateway.processCard.mockImplementationOnce(async () => {
      notifyGatewayStarted();
      return gatewayResult;
    });

    const firstPaymentPromise = context
      .createPaymentRequest(reservation.id, randomUUID(), cookie)
      .expect(201)
      .then((response) => response);
    await gatewayStarted;
    const response = await context
      .createPaymentRequest(reservation.id, randomUUID(), cookie)
      .expect(409);
    resolveGateway({ status: CardPaymentGatewayStatus.Approved });
    await firstPaymentPromise;

    expect(response.body.code).toBe('PAYMENT_IN_PROGRESS');
    expect(context.paymentGateway.processCard).toHaveBeenCalledTimes(1);
  });

  it('finaliza PENDING órfão como FAILED antes de permitir nova tentativa', async () => {
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();
    const orphanedPayment = await context.paymentsRepository.save({
      reservationId: reservation.id,
      method: PaymentMethod.Card,
      provider: PaymentProvider.Fake,
      status: PaymentStatus.Pending,
      idempotencyKey: randomUUID(),
      amountCents: 2590,
      currency: PaymentCurrency.Brl,
      approvedAt: null,
      failedAt: null,
    });
    await context.paymentsRepository.update(orphanedPayment.id, {
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    const newPaymentResponse = await context
      .createPaymentRequest(reservation.id, randomUUID(), cookie)
      .expect(201);
    const recoveredPayment = await context.paymentsRepository.findOneByOrFail({
      id: orphanedPayment.id,
    });

    expect(recoveredPayment).toMatchObject({ status: PaymentStatus.Failed });
    expect(recoveredPayment.failedAt).not.toBeNull();
    expect(newPaymentResponse.body.status).toBe(PaymentStatus.Approved);
  });

  it('persiste uma única tentativa PIX em retries simultâneos, com prazo e QR estáveis', async () => {
    const reservation = await context.createActiveReservation(undefined, 2);
    const idempotencyKey = randomUUID();
    const [{ now: before }] = (await context.dataSource.query(
      'SELECT clock_timestamp() AS now',
    )) as Array<{
      now: Date;
    }>;

    const [first, retry] = await Promise.all([
      context.paymentsService.createSimulatedPixPayment(
        context.customer.id,
        reservation.id,
        idempotencyKey,
      ),
      context.paymentsService.createSimulatedPixPayment(
        context.customer.id,
        reservation.id,
        idempotencyKey,
      ),
    ]);

    const [{ now: after }] = (await context.dataSource.query(
      'SELECT clock_timestamp() AS now',
    )) as Array<{
      now: Date;
    }>;
    const persisted = await context.paymentsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    expect(persisted).toMatchObject({
      id: first.payment.id,
      method: PaymentMethod.Pix,
      provider: PaymentProvider.Fake,
      status: PaymentStatus.Pending,
      idempotencyKey,
      amountCents: 5180,
      currency: PaymentCurrency.Brl,
      externalReference: null,
      approvedAt: null,
      failedAt: null,
      simulationCompletionAt: expect.any(Date),
    });
    expect(persisted.simulationCompletionAt?.getTime()).toBeGreaterThanOrEqual(
      before.getTime() + 15_000,
    );
    expect(persisted.simulationCompletionAt?.getTime()).toBeLessThanOrEqual(
      after.getTime() + 15_000,
    );
    expect(first.qrCodePayload).toBe(`ntq:pix:simulado:${persisted.id}`);
    expect(retry).toEqual({ payment: persisted, qrCodePayload: first.qrCodePayload });
    expect(await context.paymentsRepository.countBy({ reservationId: reservation.id })).toBe(1);
    await expect(
      context.paymentsRepository.update(persisted.id, { simulationCompletionAt: null }),
    ).rejects.toMatchObject({
      driverError: { constraint: 'paymentsSimulationCompletionMatchesProviderAndMethod' },
    });
    expect(context.paymentGateway.processCard).not.toHaveBeenCalled();
  });

  it('preserva o PIX PENDING após a janela técnica do cartão e reutiliza a chave entre métodos', async () => {
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();
    const idempotencyKey = randomUUID();
    const { payment } = await context.paymentsService.createSimulatedPixPayment(
      context.customer.id,
      reservation.id,
      idempotencyKey,
    );
    await context.paymentsRepository.update(payment.id, {
      createdAt: new Date('2000-01-01T00:00:00Z'),
    });

    const conflict = await context
      .createPaymentRequest(reservation.id, randomUUID(), cookie)
      .expect(409);
    const retry = await context
      .createPaymentRequest(reservation.id, idempotencyKey, cookie)
      .expect(201);
    const persisted = await context.paymentsRepository.findOneByOrFail({ id: payment.id });

    expect(conflict.body.code).toBe('PAYMENT_IN_PROGRESS');
    expect(retry.body).toMatchObject({
      id: payment.id,
      method: PaymentMethod.Pix,
      status: PaymentStatus.Pending,
    });
    expect(persisted.status).toBe(PaymentStatus.Pending);
    expect(persisted.simulationCompletionAt).toEqual(payment.simulationCompletionAt);
    expect(context.paymentGateway.processCard).not.toHaveBeenCalled();
  });

  it('serializa a criação concorrente de cartão e PIX com chaves diferentes', async () => {
    const reservation = await context.createActiveReservation();
    const [card, pix] = await Promise.allSettled([
      context.paymentsService.processCardPayment(
        context.customer.id,
        reservation.id,
        randomUUID(),
        {
          cardNumber: '4242424242424242',
          cardholderName: 'Ana Beatriz Souza',
          expiry: '08/29',
          cvv: '123',
        },
      ),
      context.paymentsService.createSimulatedPixPayment(
        context.customer.id,
        reservation.id,
        randomUUID(),
      ),
    ]);

    const persisted = await context.paymentsRepository.findBy({ reservationId: reservation.id });
    expect(persisted).toHaveLength(1);
    const winner = persisted[0];
    await expect(
      context.paymentsRepository.insert({
        reservationId: reservation.id,
        method: PaymentMethod.Card,
        provider: PaymentProvider.Stripe,
        status: PaymentStatus.Pending,
        idempotencyKey: randomUUID(),
        amountCents: winner.amountCents,
        currency: PaymentCurrency.Brl,
        simulationCompletionAt: null,
      }),
    ).rejects.toMatchObject({
      driverError: { constraint: 'paymentsActiveReservationUnique' },
    });

    if (winner.method === PaymentMethod.Card) {
      expect(card).toMatchObject({
        status: 'fulfilled',
        value: { id: winner.id, status: PaymentStatus.Approved, simulationCompletionAt: null },
      });
      expect(pix.status).toBe('rejected');
      if (pix.status === 'rejected') {
        expect(
          pix.reason instanceof PaymentInProgressError ||
            pix.reason instanceof ReservationAlreadyPaidError,
        ).toBe(true);
      }
      expect(context.paymentGateway.processCard).toHaveBeenCalledTimes(1);
    } else {
      expect(pix).toMatchObject({
        status: 'fulfilled',
        value: { payment: { id: winner.id, status: PaymentStatus.Pending } },
      });
      expect(card).toMatchObject({
        status: 'rejected',
        reason: expect.any(PaymentInProgressError),
      });
      expect(context.paymentGateway.processCard).not.toHaveBeenCalled();
    }
  });

  it('rejeita Reservation expirada sem criar Payment', async () => {
    const reservation = await context.createActiveReservation(new Date('2020-01-01T00:10:00.000Z'));
    const cookie = await context.authenticate();

    const response = await context
      .createPaymentRequest(reservation.id, randomUUID(), cookie)
      .expect(409);

    expect(response.body.code).toBe('RESERVATION_EXPIRED');
    await expect(
      context.paymentsRepository.countBy({ reservationId: reservation.id }),
    ).resolves.toBe(0);
  });

  it('não confirma a Reservation quando o hold vence enquanto a finalização aguarda um lock', async () => {
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();
    const locker = context.dataSource.createQueryRunner();
    await locker.connect();
    await locker.startTransaction();

    const response = context.createPaymentRequest(reservation.id, randomUUID(), cookie);

    try {
      await locker.manager.getRepository(Event).findOneOrFail({
        where: { id: reservation.eventId },
        lock: { mode: 'pessimistic_write' },
      });
      const [{ pid }] = (await locker.query('SELECT pg_backend_pid() AS pid')) as Array<{
        pid: number;
      }>;
      const paymentResponse = response.then((result) => result);

      try {
        await context.waitForBlockedTransaction(pid);

        // Posiciona o vencimento entre o início da finalização e a aquisição do lock.
        const [{ expiresAt }] = (await locker.query(
          `SELECT date_trunc('milliseconds', clock_timestamp()) + interval '50 milliseconds' AS "expiresAt"`,
        )) as Array<{ expiresAt: Date }>;
        await locker.manager.getRepository(Reservation).update(reservation.id, { expiresAt });
        await locker.manager
          .getRepository(EventSeat)
          .update({ holdReservationId: reservation.id }, { holdExpiresAt: expiresAt });
        await locker.query('SELECT pg_sleep_until($1::timestamptz)', [expiresAt]);
        await locker.commitTransaction();
      } finally {
        if (locker.isTransactionActive) await locker.rollbackTransaction();
        await paymentResponse;
      }

      const result = await paymentResponse;
      expect(result.status).toBe(201);
      expect(result.body).toMatchObject({ status: PaymentStatus.Failed, approvedAt: null });
    } finally {
      if (locker.isTransactionActive) await locker.rollbackTransaction();
      await locker.release();
    }

    const persistedReservation = await context.reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const seat = await context.eventSeatsRepository.findOneByOrFail({
      eventId: reservation.eventId,
    });
    const item = await context.reservationItemsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });

    expect(persistedReservation.confirmedAt).toBeNull();
    expect(seat.soldAt).toBeNull();
    expect(await context.ticketsRepository.countBy({ reservationItemId: item.id })).toBe(0);
    expect(context.seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
  });

  it('recupera a tentativa PIX e o mesmo QR em outra instância após encerrar a instância criadora', async () => {
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();
    const path = `/reservations/${reservation.id}/payments/pix`;
    const idempotencyKey = randomUUID();
    await request(context.app.getHttpServer()).get(path).set('Cookie', cookie).expect(404);

    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const creator = testingModule.createNestApplication();
    new Application().configure(creator);

    const created = await (async () => {
      try {
        await creator.init();
        return await context
          .createPixRequest(reservation.id, cookie, idempotencyKey, creator)
          .expect(201);
      } finally {
        await creator.close();
      }
    })();

    const recovered = await request(context.app.getHttpServer())
      .get(path)
      .set('Cookie', cookie)
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    const repeated = await context
      .createPixRequest(reservation.id, cookie, idempotencyKey)
      .expect(201);

    expect(recovered.body).toEqual(created.body);
    expect(repeated.body).toEqual(created.body);
    expect(recovered.body).toMatchObject({
      method: PaymentMethod.Pix,
      status: PaymentStatus.Pending,
      simulationCompletionAt: expect.any(String),
      qrCodePayload: `ntq:pix:simulado:${created.body.id}`,
    });
    expect(recovered.body).not.toHaveProperty('idempotencyKey');
  });

  it('restringe criação, consulta e settlement do PIX ao dono da Reservation', async () => {
    const reservation = await context.createActiveReservation();
    const otherReservation = await context.createActiveReservation();
    const [cookie, otherCookie] = await Promise.all([
      context.authenticate(),
      context.authenticate(context.customerTwo),
    ]);
    const path = `/reservations/${reservation.id}/payments/pix`;

    await context.createPixRequest(reservation.id, otherCookie).expect(404);
    await context.createPixRequest(reservation.id, cookie, 'chave-invalida').expect(400);
    const created = await context.createPixRequest(reservation.id, cookie).expect(201);
    const paymentId = created.body.id as string;
    await context.paymentsRepository.update(paymentId, { simulationCompletionAt: new Date(0) });

    await request(context.app.getHttpServer()).get(path).set('Cookie', otherCookie).expect(404);
    await context
      .settlePixRequest(reservation.id, paymentId, otherCookie)
      .set('Origin', context.checkoutOrigin)
      .expect(404);
    await context
      .settlePixRequest(otherReservation.id, paymentId, cookie)
      .set('Origin', context.checkoutOrigin)
      .expect(404);
    await request(context.app.getHttpServer()).post(`${path}/${paymentId}/settle`).expect(401);
    const payment = await context.paymentsRepository.findOneByOrFail({ id: paymentId });
    expect(payment.status).toBe(PaymentStatus.Pending);
  });

  it('rejeita POST de settlement com origem ausente, opaca ou fora da configuração', async () => {
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();
    const created = await context.createPixRequest(reservation.id, cookie).expect(201);
    const paymentId = created.body.id as string;
    await context.paymentsRepository.update(paymentId, { simulationCompletionAt: new Date(0) });

    for (const origin of [undefined, 'null', 'https://untrusted.example']) {
      const settlement = context.settlePixRequest(reservation.id, paymentId, cookie).type('form');
      if (origin !== undefined) settlement.set('Origin', origin);

      const response = await settlement.expect(403);
      expect(response.body.code).toBe('PAYMENT_ORIGIN_NOT_ALLOWED');
    }

    const recovered = await request(context.app.getHttpServer())
      .get(`/reservations/${reservation.id}/payments/pix`)
      .set('Cookie', cookie)
      .expect(200);
    expect(recovered.body.status).toBe(PaymentStatus.Pending);
    expect(context.seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
  });

  it('relê o prazo PIX sob os locks e confirma uma única vez em settlements concorrentes', async () => {
    const reservation = await context.createActiveReservation(undefined, 2);
    const cookie = await context.authenticate();
    const created = await context.createPixRequest(reservation.id, cookie).expect(201);
    const paymentId = created.body.id as string;
    await context.paymentsRepository.update(paymentId, { simulationCompletionAt: new Date(0) });
    const locker = context.dataSource.createQueryRunner();
    await locker.connect();
    await locker.startTransaction();

    try {
      await locker.manager.getRepository(Event).findOneOrFail({
        where: { id: reservation.eventId },
        lock: { mode: 'pessimistic_write' },
      });
      const [{ pid }] = (await locker.query('SELECT pg_backend_pid() AS pid')) as Array<{
        pid: number;
      }>;
      const settlement = context
        .settlePixRequest(reservation.id, paymentId, cookie)
        .set('Origin', context.checkoutOrigin)
        .expect(200)
        .then((result) => result);

      try {
        await context.waitForBlockedTransaction(pid);
        await locker.manager.getRepository(Payment).update(paymentId, {
          simulationCompletionAt: new Date('2099-01-01T00:00:00Z'),
        });
        await locker.commitTransaction();
      } finally {
        if (locker.isTransactionActive) await locker.rollbackTransaction();
        await settlement;
      }

      expect((await settlement).body.status).toBe(PaymentStatus.Pending);
    } finally {
      if (locker.isTransactionActive) await locker.rollbackTransaction();
      await locker.release();
    }

    const items = await context.reservationItemsRepository.findBy({
      reservationId: reservation.id,
    });
    const ticketCriteria = { reservationItemId: In(items.map(({ id }) => id)) };
    expect(await context.ticketsRepository.countBy(ticketCriteria)).toBe(0);

    await context.paymentsRepository.update(paymentId, { simulationCompletionAt: new Date(0) });
    const [approved, retry] = await Promise.all([
      context
        .settlePixRequest(reservation.id, paymentId, cookie)
        .set('Origin', context.checkoutOrigin)
        .expect(200),
      context
        .settlePixRequest(reservation.id, paymentId, cookie)
        .set('Origin', context.checkoutOrigin)
        .expect(200),
    ]);

    expect(approved.body.status).toBe(PaymentStatus.Approved);
    expect(retry.body).toEqual(approved.body);
    expect(await context.ticketsRepository.countBy(ticketCriteria)).toBe(2);
    expect(context.seatRealtimeGateway.emitSold).toHaveBeenCalledTimes(1);
  });

  it.each(['expirada', 'cancelada'])(
    'encerra o PIX sem Tickets quando a Reservation está %s',
    async (state) => {
      const reservation = await context.createActiveReservation();
      const cookie = await context.authenticate();
      const created = await context.createPixRequest(reservation.id, cookie).expect(201);
      const paymentId = created.body.id as string;
      await context.paymentsRepository.update(paymentId, { simulationCompletionAt: new Date(0) });

      if (state === 'cancelada') {
        await request(context.app.getHttpServer())
          .post(`/reservations/${reservation.id}/cancel`)
          .set('Origin', context.checkoutOrigin)
          .set('Cookie', cookie)
          .expect(200);
      } else {
        await context.reservationsRepository.update(reservation.id, {
          createdAt: new Date('2000-01-01T00:00:00Z'),
          expiresAt: new Date('2000-01-01T00:10:00Z'),
        });
      }

      const settlement = await context
        .settlePixRequest(reservation.id, paymentId, cookie)
        .set('Origin', context.checkoutOrigin)
        .expect(200);
      const item = await context.reservationItemsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      const seat = await context.eventSeatsRepository.findOneByOrFail({
        eventId: reservation.eventId,
      });

      expect(settlement.body).toMatchObject({ status: PaymentStatus.Failed, approvedAt: null });
      expect(seat.soldAt).toBeNull();
      expect(await context.ticketsRepository.countBy({ reservationItemId: item.id })).toBe(0);
    },
  );

  it('recusa o cartão sem confirmar a Reservation ou emitir Ticket', async () => {
    context.paymentGateway.processCard.mockResolvedValueOnce({
      status: CardPaymentGatewayStatus.Declined,
    });
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();

    const response = await context
      .createPaymentRequest(reservation.id, randomUUID(), cookie)
      .expect(201);
    const persistedReservation = await context.reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const items = await context.reservationItemsRepository.findBy({
      reservationId: reservation.id,
    });

    expect(response.body.status).toBe(PaymentStatus.Declined);
    expect(persistedReservation.confirmedAt).toBeNull();
    await expect(
      context.ticketsRepository.countBy({ reservationItemId: items[0].id }),
    ).resolves.toBe(0);
    expect(context.seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
  });

  it('confirma a Reservation, vende o assento e cria Ticket com o price snapshot', async () => {
    const reservation = await context.createActiveReservation();
    const event = await context.eventsRepository.findOneByOrFail({ id: reservation.eventId });
    const cookie = await context.authenticate();
    event.priceCents = 9999;
    await context.eventsRepository.save(event);

    const response = await context
      .createPaymentRequest(reservation.id, randomUUID(), cookie)
      .expect(201);
    const persistedReservation = await context.reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const eventSeat = await context.eventSeatsRepository.findOneByOrFail({
      eventId: reservation.eventId,
    });
    const items = await context.reservationItemsRepository.findBy({
      reservationId: reservation.id,
    });

    expect(response.body).toMatchObject({ status: PaymentStatus.Approved, amountCents: 2590 });
    expect(persistedReservation.confirmedAt).not.toBeNull();
    expect(eventSeat.soldAt).not.toBeNull();
    expect(eventSeat.holdReservationId).toBeNull();
    await expect(
      context.ticketsRepository.countBy({ reservationItemId: items[0].id }),
    ).resolves.toBe(1);
    expect(context.seatRealtimeGateway.emitSold).toHaveBeenCalledWith({
      eventId: reservation.eventId,
      eventSeatIds: [eventSeat.id],
    });
  });

  it('emite credenciais individuais para cada ReservationItem confirmado', async () => {
    const reservation = await context.createActiveReservation(undefined, 2);
    const cookie = await context.authenticate();

    await context.createPaymentRequest(reservation.id, randomUUID(), cookie).expect(201);

    const items = await context.reservationItemsRepository.find({
      where: { reservationId: reservation.id },
      order: { createdAt: 'ASC' },
    });
    const tickets = await context.ticketsRepository.find({
      where: { reservationItemId: In(items.map((item) => item.id)) },
      order: { createdAt: 'ASC' },
    });

    expect(tickets).toHaveLength(2);
    expect(new Set(tickets.map((ticket) => ticket.reservationItemId)).size).toBe(2);
    expect(new Set(tickets.map((ticket) => ticket.publicId)).size).toBe(2);
    expect(new Set(tickets.map((ticket) => ticket.manualCode)).size).toBe(2);
    for (const ticket of tickets) {
      expect(ticket.publicId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(ticket.manualCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    }
    expect(
      new Set(
        tickets.map((ticket) => context.ticketCredentialService.createCredential(ticket.publicId)),
      ).size,
    ).toBe(2);
    const eventSeatIds = items
      .map((item) => item.eventSeatId)
      .filter((eventSeatId): eventSeatId is string => eventSeatId !== null);
    expect(context.seatRealtimeGateway.emitSold).toHaveBeenCalledWith({
      eventId: reservation.eventId,
      eventSeatIds: expect.arrayContaining(eventSeatIds),
    });
    const [soldDelta] = jest.mocked(context.seatRealtimeGateway.emitSold).mock.calls[0];
    expect(soldDelta.eventSeatIds).toHaveLength(2);
  });

  it('marca falha técnica e permite nova tentativa intencional', async () => {
    context.paymentGateway.processCard.mockRejectedValueOnce(new Error('gateway indisponível'));
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();

    const failedResponse = await context
      .createPaymentRequest(reservation.id, randomUUID(), cookie)
      .expect(201);
    const approvedResponse = await context
      .createPaymentRequest(reservation.id, randomUUID(), cookie)
      .expect(201);

    expect(failedResponse.body.status).toBe(PaymentStatus.Failed);
    expect(approvedResponse.body.status).toBe(PaymentStatus.Approved);
    expect(context.seatRealtimeGateway.emitSold).toHaveBeenCalledTimes(1);
  });
});
