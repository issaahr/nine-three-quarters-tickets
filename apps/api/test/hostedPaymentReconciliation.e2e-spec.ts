import { randomUUID } from 'node:crypto';

import request, { type Test as HttpRequest } from 'supertest';
import { In } from 'typeorm';

import { CatalogSource } from '../src/modules/catalog/catalogSource.enum';
import { AdmissionMode } from '../src/modules/events/admissionMode.enum';
import { EventCategory } from '../src/modules/events/eventCategory.enum';
import { EventSeat } from '../src/modules/events/eventSeat.entity';
import { EventStatus } from '../src/modules/events/eventStatus.enum';
import { HostedPaymentOutcomeStatus } from '../src/modules/payments/hostedPaymentOutcomeStatus.enum';
import { PaymentMethod } from '../src/modules/payments/paymentMethod.enum';
import { PaymentCheckoutMode } from '../src/modules/payments/paymentCheckoutMode.enum';
import { PaymentProvider } from '../src/modules/payments/paymentProvider.enum';
import { PaymentStatus } from '../src/modules/payments/paymentStatus.enum';
import { StripeCheckoutEventType } from '../src/modules/payments/stripe/stripeCheckout.enums';
import { RefundStatus } from '../src/modules/refunds/refundStatus.enum';
import { Venue } from '../src/modules/venues/venue.entity';
import { PaymentsTestContext } from './support/paymentsTestContext';

describe('Hosted payment reconciliation', () => {
  const context = new PaymentsTestContext();

  it('converge com notificações repetidas e fora de ordem concorrendo com a conciliação SEATED', async () => {
    const reservation = await context.createActiveReservation(undefined, 2);
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await context.createPendingHostedPayment(reservation, externalReference);
    const externalPaymentReference = `pi_${randomUUID()}`;
    context.reportHostedPaymentAsPaid(payment.id, externalPaymentReference);

    await Promise.all([
      context.sendHostedNotification(payment.id, externalReference).expect(204),
      context
        .sendHostedNotification(payment.id, externalReference, {
          type: StripeCheckoutEventType.Expired,
        })
        .expect(204),
      context.reconciliation.reconcilePendingBatch(),
    ]);

    const items = await context.reservationItemsRepository.findBy({
      reservationId: reservation.id,
    });
    await expect(
      context.ticketsRepository.countBy({ reservationItemId: In(items.map(({ id }) => id)) }),
    ).resolves.toBe(2);
    await expect(
      context.paymentsRepository.findOneByOrFail({ id: payment.id }),
    ).resolves.toMatchObject({
      status: PaymentStatus.Approved,
      approvedAt: expect.any(Date),
      externalPaymentReference,
    });
    expect(context.seatRealtimeGateway.emitSold).toHaveBeenCalledTimes(1);
  });

  it('recusa assinatura, modo live e referência divergente antes de conciliar', async () => {
    const reservation = await context.createActiveReservation();
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await context.createPendingHostedPayment(reservation, externalReference);

    await context
      .sendHostedNotification(payment.id, externalReference, { validSignature: false })
      .expect(400);
    await context
      .sendHostedNotification(payment.id, externalReference, { livemode: true })
      .expect(400);
    await context.sendHostedNotification(payment.id, 'cs_test_other_session').expect(503);
    expect(context.hostedGateway.retrievePaymentOutcome).not.toHaveBeenCalled();
    await expect(
      context.paymentsRepository.findOneByOrFail({ id: payment.id }),
    ).resolves.toMatchObject({
      status: PaymentStatus.Pending,
      externalReference,
    });
  });

  it('preserva a sessão aberta de uma reserva elegível', async () => {
    const reservation = await context.createActiveReservation();
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await context.createPendingHostedPayment(reservation, externalReference);
    context.hostedGateway.retrievePaymentOutcome.mockResolvedValue({
      status: HostedPaymentOutcomeStatus.Pending,
      canExpire: true,
    });

    await context.sendHostedNotification(payment.id, externalReference).expect(204);

    expect(context.hostedGateway.expireCheckout).not.toHaveBeenCalled();
    await expect(
      context.paymentsRepository.findOneByOrFail({ id: payment.id }),
    ).resolves.toMatchObject({
      status: PaymentStatus.Pending,
      externalReference,
    });
  });

  it.each(['hold expirado', 'reserva cancelada', 'evento cancelado'])(
    'encerra a sessão aberta quando %s sem inventar cobrança ou estorno',
    async (reason) => {
      const reservation =
        reason === 'hold expirado'
          ? await context.createActiveReservation(new Date('2020-01-01T00:10:00.000Z'))
          : await context.createActiveReservation();
      if (reason === 'reserva cancelada') {
        await context.reservationsRepository.update(reservation.id, { cancelledAt: new Date() });
      } else if (reason === 'evento cancelado') {
        await context.eventsRepository.update(reservation.eventId, {
          status: EventStatus.Cancelled,
          cancelledByUserId: context.organizer.id,
        });
      }
      const externalReference = `cs_test_${randomUUID()}`;
      const payment = await context.createPendingHostedPayment(reservation, externalReference);
      context.hostedGateway.retrievePaymentOutcome.mockResolvedValue({
        status: HostedPaymentOutcomeStatus.Pending,
        canExpire: true,
      });
      context.hostedGateway.expireCheckout.mockResolvedValueOnce({
        status: HostedPaymentOutcomeStatus.Closed,
      });

      await context.sendHostedNotification(payment.id, externalReference).expect(204);

      expect(context.hostedGateway.expireCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ paymentId: payment.id }),
        externalReference,
      );
      await expect(
        context.paymentsRepository.findOneByOrFail({ id: payment.id }),
      ).resolves.toMatchObject({
        status: PaymentStatus.Failed,
        externalPaymentReference: null,
      });
      await expect(context.refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(0);
    },
  );

  it('registra a corrida de cobrança durante a expiração e mantém uma intenção de estorno', async () => {
    const reservation = await context.createActiveReservation(new Date('2020-01-01T00:10:00.000Z'));
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await context.createPendingHostedPayment(reservation, externalReference);
    const externalPaymentReference = `pi_${randomUUID()}`;
    context.hostedGateway.retrievePaymentOutcome.mockResolvedValue({
      status: HostedPaymentOutcomeStatus.Paid,
      externalPaymentReference,
    });
    context.hostedGateway.retrievePaymentOutcome.mockResolvedValueOnce({
      status: HostedPaymentOutcomeStatus.Pending,
      canExpire: true,
    });
    context.hostedGateway.expireCheckout.mockResolvedValueOnce({
      status: HostedPaymentOutcomeStatus.Paid,
      externalPaymentReference,
    });

    await context.sendHostedNotification(payment.id, externalReference).expect(204);
    await context.sendHostedNotification(payment.id, externalReference).expect(204);

    expect(context.hostedGateway.expireCheckout).toHaveBeenCalledTimes(1);
    const item = await context.reservationItemsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    await expect(context.ticketsRepository.countBy({ reservationItemId: item.id })).resolves.toBe(
      0,
    );
    await expect(context.refundsRepository.findBy({ paymentId: payment.id })).resolves.toEqual([
      expect.objectContaining({
        status: RefundStatus.Pending,
        amountCents: payment.amountCents,
        completedAt: null,
      }),
    ]);
  });

  it('concilia confirmação GA concorrente com webhooks e mantém exclusiva a capacidade vendida', async () => {
    const gaVenue = await context.dataSource
      .getRepository(Venue)
      .findOneByOrFail({ admissionMode: AdmissionMode.GeneralAdmission });
    const event = await context.eventsRepository.save({
      organizerId: context.organizer.id,
      venueId: gaVenue.id,
      title: 'Conciliação GA',
      category: EventCategory.Show,
      admissionMode: AdmissionMode.GeneralAdmission,
      status: EventStatus.Published,
      startsAt: new Date('2099-10-01T23:30:00.000Z'),
      capacity: 2,
      priceCents: 2590,
      catalogSource: CatalogSource.Ticketmaster,
      externalId: randomUUID(),
    });
    context.createdEventIds.push(event.id);
    const cookie = await context.authenticate();
    const otherCookie = await context.authenticate(context.customerTwo);
    const hold = await request(context.app.getHttpServer())
      .post('/reservations/general-admission')
      .set('Cookie', cookie)
      .send({ eventId: event.id, quantity: 2 })
      .expect(201);
    const reservation = await context.reservationsRepository.findOneByOrFail({ id: hold.body.id });
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await context.createPendingHostedPayment(
      reservation,
      externalReference,
      PaymentMethod.Pix,
    );
    context.reportHostedPaymentAsPaid(payment.id, `pi_${randomUUID()}`);

    await Promise.all([
      context.reconciliation.reconcilePendingBatch(),
      context.sendHostedNotification(payment.id, externalReference).expect(204),
      context.sendHostedNotification(payment.id, externalReference).expect(204),
      request(context.app.getHttpServer())
        .post('/reservations/general-admission')
        .set('Cookie', otherCookie)
        .send({ eventId: event.id, quantity: 1 })
        .expect(409),
    ]);

    const items = await context.reservationItemsRepository.findBy({
      reservationId: reservation.id,
    });
    await expect(
      context.ticketsRepository.countBy({ reservationItemId: In(items.map(({ id }) => id)) }),
    ).resolves.toBe(2);
    await expect(
      context.paymentsRepository.findOneByOrFail({ id: payment.id }),
    ).resolves.toMatchObject({
      status: PaymentStatus.Approved,
    });
    await request(context.app.getHttpServer())
      .post('/reservations/general-admission')
      .set('Cookie', otherCookie)
      .send({ eventId: event.id, quantity: 1 })
      .expect(409);
    expect(context.seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
  });

  it.each(['prazo expirado', 'hold perdido'])(
    'preserva cobrança tardia sem emitir Tickets após %s',
    async (reason) => {
      const reservation =
        reason === 'prazo expirado'
          ? await context.createActiveReservation(new Date('2020-01-01T00:10:00.000Z'), 2)
          : await context.createActiveReservation(undefined, 2);
      const items = await context.reservationItemsRepository.findBy({
        reservationId: reservation.id,
      });
      if (reason === 'hold perdido') {
        await context.eventSeatsRepository.update(items[0].eventSeatId!, {
          holdReservationId: null,
          holdExpiresAt: null,
        });
      }
      const payment = await context.createPendingHostedPayment(reservation, null);
      const externalReference = `cs_test_${randomUUID()}`;
      const externalPaymentReference = `pi_${randomUUID()}`;
      context.reportHostedPaymentAsPaid(payment.id, externalPaymentReference);

      await context.sendHostedNotification(payment.id, externalReference).expect(204);
      await context.sendHostedNotification(payment.id, externalReference).expect(204);

      await expect(
        context.ticketsRepository.countBy({ reservationItemId: In(items.map(({ id }) => id)) }),
      ).resolves.toBe(0);
      await expect(
        context.paymentsRepository.findOneByOrFail({ id: payment.id }),
      ).resolves.toMatchObject({
        status: PaymentStatus.Failed,
        externalReference,
        externalPaymentReference,
        failedAt: expect.any(Date),
      });
      await expect(
        context.eventSeatsRepository.findBy({ eventId: reservation.eventId }),
      ).resolves.toEqual(
        expect.arrayContaining(
          items.map(({ eventSeatId }) =>
            expect.objectContaining({ id: eventSeatId, soldAt: null }),
          ),
        ),
      );
      expect(context.seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
    },
  );

  it('reverte a venda se o hold vencer enquanto a conciliação Stripe aguarda o lock do assento', async () => {
    const reservation = await context.createActiveReservation();
    const item = await context.reservationItemsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    const externalReference = `cs_test_${randomUUID()}`;
    const payment = await context.createPendingHostedPayment(reservation, externalReference);
    const externalPaymentReference = `pi_${randomUUID()}`;
    context.reportHostedPaymentAsPaid(payment.id, externalPaymentReference);

    const response = await context.requestWaitingPastDeadline(
      context.sendHostedNotification(payment.id, externalReference),
      (manager) =>
        manager.getRepository(EventSeat).findOneOrFail({
          where: { id: item.eventSeatId! },
          lock: { mode: 'pessimistic_write' },
        }),
      // Grava o prazo em outra conexão. A conciliação só deve ficar bloqueada ao atualizar o assento.
      (_manager, deadline) =>
        context.reservationsRepository.update(reservation.id, { expiresAt: deadline }),
    );

    expect(response.status).toBe(204);
    await expect(
      context.paymentsRepository.findOneByOrFail({ id: payment.id }),
    ).resolves.toMatchObject({
      status: PaymentStatus.Failed,
      externalPaymentReference,
    });
    await expect(
      context.reservationsRepository.findOneByOrFail({ id: reservation.id }),
    ).resolves.toMatchObject({ confirmedAt: null });
    await expect(context.ticketsRepository.countBy({ reservationItemId: item.id })).resolves.toBe(
      0,
    );
    await expect(
      context.eventSeatsRepository.findOneByOrFail({ id: item.eventSeatId! }),
    ).resolves.toMatchObject({ soldAt: null, holdReservationId: reservation.id });
    expect(context.seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
  });

  it.each([
    { mode: PaymentCheckoutMode.Hosted, method: PaymentMethod.Card },
    { mode: PaymentCheckoutMode.Hosted, method: PaymentMethod.Pix },
    { mode: PaymentCheckoutMode.Simulated, method: PaymentMethod.Card },
    { mode: PaymentCheckoutMode.Simulated, method: PaymentMethod.Pix },
  ])(
    'reverte confirmação $mode de $method se o prazo vencer no lock do assento',
    async ({ mode, method }) => {
      const reservation = await context.createActiveReservation();
      const item = await context.reservationItemsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      const cookie = await context.authenticate();
      let confirmation: HttpRequest;
      if (mode === PaymentCheckoutMode.Hosted) {
        await context.reservationItemsRepository.update(item.id, { unitPriceCents: 0 });
        confirmation = context.startHostedRequest(reservation.id, cookie).send({ method });
      } else if (method === PaymentMethod.Pix) {
        const started = await context.createPixRequest(reservation.id, cookie).expect(201);
        await context.paymentsRepository.update(started.body.id, {
          simulationCompletionAt: new Date('2020-01-01T00:00:00.000Z'),
        });
        confirmation = context
          .settlePixRequest(reservation.id, started.body.id, cookie)
          .set('Origin', context.checkoutOrigin);
      } else {
        confirmation = context.createPaymentRequest(reservation.id, randomUUID(), cookie);
      }

      const response = await context.requestWaitingPastDeadline(
        confirmation,
        (manager) =>
          manager.getRepository(EventSeat).findOneOrFail({
            where: { id: item.eventSeatId! },
            lock: { mode: 'pessimistic_write' },
          }),
        (_manager, deadline) =>
          context.reservationsRepository.update(reservation.id, { expiresAt: deadline }),
      );
      expect(response.status).toBe(
        mode === PaymentCheckoutMode.Simulated && method === PaymentMethod.Pix ? 200 : 201,
      );
      const payment = await context.paymentsRepository.findOneByOrFail({
        reservationId: reservation.id,
      });
      expect(payment).toMatchObject({
        status: PaymentStatus.Failed,
        provider: PaymentProvider.Fake,
        approvedAt: null,
        externalPaymentReference: null,
      });
      await expect(
        context.reservationsRepository.findOneByOrFail({ id: reservation.id }),
      ).resolves.toMatchObject({ confirmedAt: null });
      await expect(
        context.eventSeatsRepository.findOneByOrFail({ id: item.eventSeatId! }),
      ).resolves.toMatchObject({
        soldAt: null,
        holdReservationId: reservation.id,
      });
      await expect(context.ticketsRepository.countBy({ reservationItemId: item.id })).resolves.toBe(
        0,
      );
      await expect(context.refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(0);
      expect(context.seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
      expect(context.hostedGateway.createCheckout).not.toHaveBeenCalled();
    },
  );
});
