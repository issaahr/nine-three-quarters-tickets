import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { In } from 'typeorm';

import { Event } from '../src/modules/events/event.entity';
import { EventSeat } from '../src/modules/events/eventSeat.entity';
import { EventStatus } from '../src/modules/events/eventStatus.enum';
import { Payment } from '../src/modules/payments/payment.entity';
import {
  CardPaymentGatewayResult,
  CardPaymentGatewayStatus,
} from '../src/modules/payments/paymentGateway.interfaces';
import { PaymentStatus } from '../src/modules/payments/paymentStatus.enum';
import { Reservation } from '../src/modules/reservations/reservation.entity';
import { Ticket } from '../src/modules/tickets/ticket.entity';
import { PaymentsTestContext } from './support/paymentsTestContext';

describe('Payment cancellation', () => {
  const context = new PaymentsTestContext();
  it.each(['reserva', 'evento'])(
    'bloqueia origens não confiáveis no cancelamento de %s e aceita a origem da Web em outro domínio',
    async (target) => {
      const customerCookie = await context.authenticate();
      const reservation = await context.createConfirmedReservation(customerCookie);
      const isEventCancellation = target === 'evento';
      const cookie = isEventCancellation
        ? await context.authenticate(context.organizer)
        : customerCookie;
      const path = isEventCancellation
        ? `/organizer/me/events/${reservation.eventId}/cancel`
        : `/reservations/${reservation.id}/cancel`;
      const apiHost = 'api.example.invalid';
      const cancelRequest = () =>
        request(context.app.getHttpServer()).post(path).set('Host', apiHost).set('Cookie', cookie);

      await request(context.app.getHttpServer())
        .post(path)
        .set('Origin', context.checkoutOrigin)
        .expect(401);
      for (const origin of [undefined, 'null', 'https://untrusted.example.invalid']) {
        const cancellation = cancelRequest().type('form');
        if (origin !== undefined) cancellation.set('Origin', origin);

        const response = await cancellation.expect(403);
        expect(response.body.code).toBe('ORIGIN_NOT_ALLOWED');
      }

      const payment = await context.paymentsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      const item = await context.reservationItemsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      const ticket = await context.ticketsRepository.findOneByOrFail({
        reservationItemId: item.id,
      });
      const seat = await context.eventSeatsRepository.findOneByOrFail({
        eventId: reservation.eventId,
      });
      await expect(
        context.eventsRepository.findOneByOrFail({ id: reservation.eventId }),
      ).resolves.toMatchObject({
        status: EventStatus.Published,
      });
      await expect(
        context.reservationsRepository.findOneByOrFail({ id: reservation.id }),
      ).resolves.toMatchObject({
        cancelledAt: null,
      });
      expect(payment.status).toBe(PaymentStatus.Approved);
      expect(ticket.cancelledAt).toBeNull();
      expect(seat.soldAt).not.toBeNull();
      await expect(context.refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(0);

      await cancelRequest()
        .set('Origin', context.checkoutOrigin)
        .expect('Access-Control-Allow-Origin', context.checkoutOrigin)
        .expect('Access-Control-Allow-Credentials', 'true')
        .expect(200);
      await expect(
        context.eventsRepository.findOneByOrFail({ id: reservation.eventId }),
      ).resolves.toMatchObject({
        status: isEventCancellation ? EventStatus.Cancelled : EventStatus.Published,
      });
      await expect(
        context.reservationsRepository.findOneByOrFail({ id: reservation.id }),
      ).resolves.toMatchObject({
        cancelledAt: expect.any(Date),
      });
      await expect(
        context.ticketsRepository.findOneByOrFail({ id: ticket.id }),
      ).resolves.toMatchObject({
        cancelledAt: expect.any(Date),
      });
      await expect(
        context.eventSeatsRepository.findOneByOrFail({ id: seat.id }),
      ).resolves.toMatchObject({
        soldAt: null,
      });
      await expect(context.refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(1);
    },
  );

  it('recusa o cancelamento de uma reserva cujo hold vence enquanto aguarda o lock', async () => {
    const reservation = await context.createActiveReservation();
    const cookie = await context.authenticate();
    const cancellation = request(context.app.getHttpServer())
      .post(`/reservations/${reservation.id}/cancel`)
      .set('Origin', context.checkoutOrigin)
      .set('Cookie', cookie);

    const response = await context.cancelAfterDeadline(
      cancellation,
      (manager) =>
        manager.getRepository(Reservation).findOneOrFail({
          where: { id: reservation.id },
          lock: { mode: 'pessimistic_write' },
        }),
      async (manager, expiresAt) => {
        await manager.getRepository(Reservation).update(reservation.id, { expiresAt });
        await manager
          .getRepository(EventSeat)
          .update({ holdReservationId: reservation.id }, { holdExpiresAt: expiresAt });
      },
    );

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('RESERVATION_NOT_ACTIVE');
    await expect(
      context.reservationsRepository.findOneByOrFail({ id: reservation.id }),
    ).resolves.toMatchObject({ cancelledAt: null });
    await expect(
      context.eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId }),
    ).resolves.toMatchObject({ holdReservationId: reservation.id, soldAt: null });
  });

  it('recusa o cancelamento de uma compra se a janela de sete dias termina no lock do Payment', async () => {
    const cookie = await context.authenticate();
    const reservation = await context.createConfirmedReservation(cookie);
    const payment = await context.paymentsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    const cancellation = request(context.app.getHttpServer())
      .post(`/reservations/${reservation.id}/cancel`)
      .set('Origin', context.checkoutOrigin)
      .set('Cookie', cookie);

    const response = await context.cancelAfterDeadline(
      cancellation,
      (manager) =>
        manager.getRepository(Payment).findOneOrFail({
          where: { id: payment.id },
          lock: { mode: 'pessimistic_write' },
        }),
      (manager, deadline) =>
        manager.getRepository(Payment).update(payment.id, {
          approvedAt: new Date(deadline.getTime() - context.sevenDaysInMilliseconds),
        }),
    );

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('CANCELLATION_NOT_ALLOWED');
    const item = await context.reservationItemsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    await expect(
      context.reservationsRepository.findOneByOrFail({ id: reservation.id }),
    ).resolves.toMatchObject({ cancelledAt: null });
    await expect(
      context.ticketsRepository.findOneByOrFail({ reservationItemId: item.id }),
    ).resolves.toMatchObject({ cancelledAt: null });
    await expect(
      context.eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId }),
    ).resolves.toMatchObject({ soldAt: expect.any(Date) });
    await expect(context.refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(0);
  });

  it('recusa o cancelamento pelo organizador quando o evento começa durante a espera do lock', async () => {
    const [customerCookie, organizerCookie] = await Promise.all([
      context.authenticate(),
      context.authenticate(context.organizer),
    ]);
    const reservation = await context.createConfirmedReservation(customerCookie);
    const cancellation = request(context.app.getHttpServer())
      .post(`/organizer/me/events/${reservation.eventId}/cancel`)
      .set('Origin', context.checkoutOrigin)
      .set('Cookie', organizerCookie);

    const response = await context.cancelAfterDeadline(
      cancellation,
      (manager) =>
        manager.getRepository(Event).findOneOrFail({
          where: { id: reservation.eventId },
          lock: { mode: 'pessimistic_write' },
        }),
      (manager, startsAt) => manager.getRepository(Event).update(reservation.eventId, { startsAt }),
    );

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('EVENT_CANNOT_BE_CANCELLED');
    const item = await context.reservationItemsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    const payment = await context.paymentsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    await expect(
      context.eventsRepository.findOneByOrFail({ id: reservation.eventId }),
    ).resolves.toMatchObject({ status: EventStatus.Published, cancelledByUserId: null });
    await expect(
      context.reservationsRepository.findOneByOrFail({ id: reservation.id }),
    ).resolves.toMatchObject({ cancelledAt: null });
    await expect(
      context.ticketsRepository.findOneByOrFail({ reservationItemId: item.id }),
    ).resolves.toMatchObject({ cancelledAt: null });
    await expect(
      context.eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId }),
    ).resolves.toMatchObject({ soldAt: expect.any(Date) });
    await expect(context.refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(0);
  });

  it.each([PaymentStatus.Pending, PaymentStatus.Approved])(
    'recusa o cancelamento de evento iniciado enquanto aguarda um Payment %s',
    async (paymentStatus) => {
      const [customerCookie, organizerCookie] = await Promise.all([
        context.authenticate(),
        context.authenticate(context.organizer),
      ]);
      const isApproved = paymentStatus === PaymentStatus.Approved;
      const reservation = isApproved
        ? await context.createConfirmedReservation(customerCookie)
        : await context.createActiveReservation();
      if (!isApproved) {
        await context.paymentsService.createSimulatedPixPayment(
          context.customer.id,
          reservation.id,
          randomUUID(),
        );
      }
      const payment = await context.paymentsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      const cancellation = request(context.app.getHttpServer())
        .post(`/organizer/me/events/${reservation.eventId}/cancel`)
        .set('Origin', context.checkoutOrigin)
        .set('Cookie', organizerCookie);
      const response = await context.requestWaitingPastDeadline(
        cancellation,
        (manager) =>
          manager.getRepository(Payment).findOneOrFail({
            where: { id: payment.id },
            lock: { mode: 'pessimistic_write' },
          }),
        (_manager, startsAt) => context.eventsRepository.update(reservation.eventId, { startsAt }),
      );
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('EVENT_CANNOT_BE_CANCELLED');

      const item = await context.reservationItemsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      await expect(
        context.eventsRepository.findOneByOrFail({ id: reservation.eventId }),
      ).resolves.toMatchObject({ status: EventStatus.Published, cancelledByUserId: null });
      await expect(
        context.reservationsRepository.findOneByOrFail({ id: reservation.id }),
      ).resolves.toMatchObject({ cancelledAt: null });
      await expect(
        context.paymentsRepository.findOneByOrFail({ id: payment.id }),
      ).resolves.toMatchObject({
        status: paymentStatus,
      });
      await expect(
        context.eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId }),
      ).resolves.toMatchObject({
        holdReservationId: isApproved ? null : reservation.id,
        soldAt: isApproved ? expect.any(Date) : null,
      });
      await expect(
        context.ticketsRepository.findBy({ reservationItemId: item.id }),
      ).resolves.toEqual(isApproved ? [expect.objectContaining({ cancelledAt: null })] : []);
      await expect(context.refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(0);
    },
    10_000,
  );

  it.each([
    { target: 'reserva', lock: 'assento', limit: 'hold' },
    { target: 'reserva', lock: 'ingresso', limit: 'início do evento' },
    { target: 'reserva', lock: 'assento', limit: 'janela de sete dias' },
    { target: 'reserva', lock: 'estorno', limit: 'janela de sete dias' },
    { target: 'evento', lock: 'ingresso', limit: 'início do evento' },
    { target: 'evento', lock: 'assento', limit: 'início do evento' },
    { target: 'evento', lock: 'estorno', limit: 'início do evento' },
  ] as const)(
    'reverte espera tardia de $lock no cancelamento de $target ao ultrapassar $limit',
    async ({ target, lock, limit }) => {
      const customerCookie = await context.authenticate();
      const isHold = limit === 'hold';
      const isEvent = target === 'evento';
      const reservation = isHold
        ? await context.createActiveReservation()
        : await context.createConfirmedReservation(customerCookie);
      const item = await context.reservationItemsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      const seat = await context.eventSeatsRepository.findOneByOrFail({
        eventId: reservation.eventId,
      });
      const payment = await context.paymentsRepository.findOneBy({ reservationId: reservation.id });
      const cancellation = request(context.app.getHttpServer())
        .post(
          isEvent
            ? `/organizer/me/events/${reservation.eventId}/cancel`
            : `/reservations/${reservation.id}/cancel`,
        )
        .set('Origin', context.checkoutOrigin)
        .set('Cookie', isEvent ? await context.authenticate(context.organizer) : customerCookie);

      const response = await context.requestWaitingPastDeadline(
        cancellation,
        (manager) => {
          switch (lock) {
            case 'ingresso':
              return manager.getRepository(Ticket).findOneOrFail({
                where: { reservationItemId: item.id },
                lock: { mode: 'pessimistic_write' },
              });
            case 'assento':
              return manager.getRepository(EventSeat).findOneOrFail({
                where: { id: seat.id },
                lock: { mode: 'pessimistic_write' },
              });
            case 'estorno':
              return manager.query('LOCK TABLE "refunds" IN SHARE MODE');
          }
        },
        async (manager, deadline) => {
          switch (limit) {
            case 'hold':
              await context.reservationsRepository.update(reservation.id, { expiresAt: deadline });
              await manager.getRepository(EventSeat).update(seat.id, { holdExpiresAt: deadline });
              break;
            case 'janela de sete dias':
              if (!payment) throw new Error('A compra do cenário precisa ter Payment');
              await context.paymentsRepository.update(payment.id, {
                approvedAt: new Date(deadline.getTime() - context.sevenDaysInMilliseconds),
              });
              break;
            case 'início do evento':
              await context.eventsRepository.update(reservation.eventId, { startsAt: deadline });
              break;
          }
        },
      );

      expect(response.status).toBe(409);
      const errorCode = isEvent
        ? 'EVENT_CANNOT_BE_CANCELLED'
        : isHold
          ? 'RESERVATION_NOT_ACTIVE'
          : 'CANCELLATION_NOT_ALLOWED';
      expect(response.body.code).toBe(errorCode);
      await expect(
        context.eventsRepository.findOneByOrFail({ id: reservation.eventId }),
      ).resolves.toMatchObject({ status: EventStatus.Published, cancelledByUserId: null });
      await expect(
        context.reservationsRepository.findOneByOrFail({ id: reservation.id }),
      ).resolves.toMatchObject({ cancelledAt: null });
      await expect(
        context.eventSeatsRepository.findOneByOrFail({ id: seat.id }),
      ).resolves.toMatchObject({
        holdReservationId: seat.holdReservationId,
        soldAt: seat.soldAt,
      });
      await expect(
        context.ticketsRepository.findBy({ reservationItemId: item.id }),
      ).resolves.toEqual(isHold ? [] : [expect.objectContaining({ cancelledAt: null })]);
      if (payment) {
        await expect(
          context.paymentsRepository.findOneByOrFail({ id: payment.id }),
        ).resolves.toMatchObject({
          status: PaymentStatus.Approved,
        });
        await expect(context.refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(0);
      }
      expect(context.seatRealtimeGateway.emitReleased).not.toHaveBeenCalled();
    },
    10_000,
  );

  it('serializa cancelamentos concorrentes do CUSTOMER sem duplicar Refund', async () => {
    const customerCookie = await context.authenticate();
    const reservation = await context.createConfirmedReservation(customerCookie);

    const responses = await Promise.all([
      request(context.app.getHttpServer())
        .post(`/reservations/${reservation.id}/cancel`)
        .set('Origin', context.checkoutOrigin)
        .set('Cookie', customerCookie),
      request(context.app.getHttpServer())
        .post(`/reservations/${reservation.id}/cancel`)
        .set('Origin', context.checkoutOrigin)
        .set('Cookie', customerCookie),
    ]);
    const items = await context.reservationItemsRepository.findBy({
      reservationId: reservation.id,
    });
    const tickets = await context.ticketsRepository.findBy({
      reservationItemId: In(items.map(({ id }) => id)),
    });
    const payment = await context.paymentsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    await expect(context.refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(1);
    expect(tickets).not.toHaveLength(0);
    expect(tickets.every(({ cancelledAt }) => cancelledAt !== null)).toBe(true);
  });

  it('serializa cancelamento do CUSTOMER com cancelamento do Event sem deadlock', async () => {
    const customerCookie = await context.authenticate();
    const customerTwoCookie = await context.authenticate(context.customerTwo);
    const organizerCookie = await context.authenticate(context.organizer);
    const reservation = await context.createConfirmedReservation(customerCookie);
    const event = await context.eventsRepository.findOneByOrFail({ id: reservation.eventId });
    const secondReservation = await context.createActiveReservation(undefined, 1, {
      event,
      customer: context.customerTwo,
      seatOffset: 1,
    });
    await context
      .createPaymentRequest(secondReservation.id, randomUUID(), customerTwoCookie)
      .expect(201);

    const [customerResponse, organizerResponse] = await Promise.all([
      request(context.app.getHttpServer())
        .post(`/reservations/${reservation.id}/cancel`)
        .set('Origin', context.checkoutOrigin)
        .set('Cookie', customerCookie),
      request(context.app.getHttpServer())
        .post(`/organizer/me/events/${reservation.eventId}/cancel`)
        .set('Origin', context.checkoutOrigin)
        .set('Cookie', organizerCookie),
    ]);
    const persistedEvent = await context.eventsRepository.findOneByOrFail({
      id: reservation.eventId,
    });
    const persistedReservation = await context.reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const persistedSecondReservation = await context.reservationsRepository.findOneByOrFail({
      id: secondReservation.id,
    });
    const items = await context.reservationItemsRepository.findBy({
      reservationId: In([reservation.id, secondReservation.id]),
    });
    const tickets = await context.ticketsRepository.findBy({
      reservationItemId: In(items.map(({ id }) => id)),
    });
    const payments = await context.paymentsRepository.findBy({
      reservationId: In([reservation.id, secondReservation.id]),
    });

    expect(organizerResponse.status).toBe(200);
    expect([200, 409]).toContain(customerResponse.status);
    expect(customerResponse.status).not.toBe(500);
    expect(persistedEvent.status).toBe(EventStatus.Cancelled);
    expect(persistedReservation.cancelledAt).not.toBeNull();
    expect(persistedSecondReservation.cancelledAt).not.toBeNull();
    expect(payments).toHaveLength(2);
    expect(payments.every(({ status }) => status === PaymentStatus.Approved)).toBe(true);
    await expect(
      context.refundsRepository.countBy({ paymentId: In(payments.map(({ id }) => id)) }),
    ).resolves.toBe(2);
    expect(tickets).toHaveLength(2);
    expect(tickets.every(({ cancelledAt }) => cancelledAt !== null)).toBe(true);
  });

  it('serializa finalização de Payment com cancelamento do Event', async () => {
    const customerCookie = await context.authenticate();
    const organizerCookie = await context.authenticate(context.organizer);
    const reservation = await context.createActiveReservation();
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

    const paymentResponsePromise = context
      .createPaymentRequest(reservation.id, randomUUID(), customerCookie)
      .then((response) => response);
    await gatewayStarted;
    const organizerResponsePromise = request(context.app.getHttpServer())
      .post(`/organizer/me/events/${reservation.eventId}/cancel`)
      .set('Origin', context.checkoutOrigin)
      .set('Cookie', organizerCookie)
      .then((response) => response);
    resolveGateway({ status: CardPaymentGatewayStatus.Approved });
    const [paymentResponse, organizerResponse] = await Promise.all([
      paymentResponsePromise,
      organizerResponsePromise,
    ]);
    const persistedEvent = await context.eventsRepository.findOneByOrFail({
      id: reservation.eventId,
    });
    const persistedReservation = await context.reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const payment = await context.paymentsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    const items = await context.reservationItemsRepository.findBy({
      reservationId: reservation.id,
    });

    expect(organizerResponse.status).toBe(200);
    expect(paymentResponse.status).toBe(201);
    expect([PaymentStatus.Approved, PaymentStatus.Failed]).toContain(paymentResponse.body.status);
    expect(persistedEvent.status).toBe(EventStatus.Cancelled);
    expect(persistedReservation.cancelledAt).not.toBeNull();
    const tickets = await context.ticketsRepository.findBy({
      reservationItemId: In(items.map(({ id }) => id)),
    });
    const refundCount = await context.refundsRepository.countBy({ paymentId: payment.id });

    if (payment.status === PaymentStatus.Approved) {
      expect(persistedReservation.confirmedAt).not.toBeNull();
      expect(tickets).not.toHaveLength(0);
      expect(tickets.every(({ cancelledAt }) => cancelledAt !== null)).toBe(true);
      expect(refundCount).toBe(1);
    } else {
      expect(payment.status).toBe(PaymentStatus.Failed);
      expect(persistedReservation.confirmedAt).toBeNull();
      expect(tickets).toHaveLength(0);
      expect(refundCount).toBe(0);
    }
  });
});
