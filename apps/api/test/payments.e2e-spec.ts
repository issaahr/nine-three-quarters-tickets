import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, In, Repository } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Application } from '../src/application';
import { CatalogSource } from '../src/modules/catalog/catalogSource.enum';
import { AdmissionMode } from '../src/modules/events/admissionMode.enum';
import { Event } from '../src/modules/events/event.entity';
import { EventCategory } from '../src/modules/events/eventCategory.enum';
import { EventSeat } from '../src/modules/events/eventSeat.entity';
import { EventStatus } from '../src/modules/events/eventStatus.enum';
import { Payment } from '../src/modules/payments/payment.entity';
import { PaymentMethod } from '../src/modules/payments/paymentMethod.enum';
import { paymentGatewayToken } from '../src/modules/payments/payments.constants';
import {
  CardPaymentGatewayRequest,
  CardPaymentGatewayResult,
  CardPaymentGatewayStatus,
  PaymentGateway,
} from '../src/modules/payments/paymentGateway.interfaces';
import { PaymentStatus } from '../src/modules/payments/paymentStatus.enum';
import { SeatRealtimeGateway } from '../src/modules/realtime/seatRealtime.gateway';
import { Refund } from '../src/modules/refunds/refund.entity';
import { ReservationItem } from '../src/modules/reservations/reservationItem.entity';
import { Reservation } from '../src/modules/reservations/reservation.entity';
import { Ticket } from '../src/modules/tickets/ticket.entity';
import { TicketCredentialService } from '../src/modules/tickets/ticketCredential.service';
import { User } from '../src/modules/users/user.entity';
import { Venue } from '../src/modules/venues/venue.entity';
import { VenueSeat } from '../src/modules/venues/venueSeat.entity';

class ControlledPaymentGateway implements PaymentGateway {
  public processCard = jest.fn(
    async (request: CardPaymentGatewayRequest): Promise<CardPaymentGatewayResult> => {
      void request;
      return { status: CardPaymentGatewayStatus.Approved };
    },
  );
}

describe('Payments', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let eventsRepository: Repository<Event>;
  let eventSeatsRepository: Repository<EventSeat>;
  let paymentsRepository: Repository<Payment>;
  let reservationItemsRepository: Repository<ReservationItem>;
  let reservationsRepository: Repository<Reservation>;
  let refundsRepository: Repository<Refund>;
  let ticketsRepository: Repository<Ticket>;
  let ticketCredentialService: TicketCredentialService;
  let venueSeatsRepository: Repository<VenueSeat>;
  let customer: User;
  let customerTwo: User;
  let organizer: User;
  let venue: Venue;
  let paymentGateway: ControlledPaymentGateway;
  let seatRealtimeGateway: SeatRealtimeGateway;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    paymentGateway = new ControlledPaymentGateway();
    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(paymentGatewayToken)
      .useValue(paymentGateway)
      .compile();

    app = testingModule.createNestApplication();
    new Application().configure(app);
    await app.init();

    dataSource = app.get(DataSource);
    eventsRepository = dataSource.getRepository(Event);
    eventSeatsRepository = dataSource.getRepository(EventSeat);
    paymentsRepository = dataSource.getRepository(Payment);
    reservationItemsRepository = dataSource.getRepository(ReservationItem);
    reservationsRepository = dataSource.getRepository(Reservation);
    refundsRepository = dataSource.getRepository(Refund);
    ticketsRepository = dataSource.getRepository(Ticket);
    ticketCredentialService = app.get(TicketCredentialService);
    seatRealtimeGateway = app.get(SeatRealtimeGateway);
    jest.spyOn(seatRealtimeGateway, 'emitSold').mockImplementation();
    venueSeatsRepository = dataSource.getRepository(VenueSeat);
    customer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'customer.one.demo@ntq.local' });
    customerTwo = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'customer.two.demo@ntq.local' });
    organizer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'organizer.demo@ntq.local' });
    venue = await dataSource
      .getRepository(Venue)
      .findOneByOrFail({ name: 'Cine Imperial · Sala A' });
  });

  beforeEach(() => {
    paymentGateway.processCard.mockReset();
    paymentGateway.processCard.mockResolvedValue({ status: CardPaymentGatewayStatus.Approved });
  });

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      const reservations = await reservationsRepository.find({
        select: { id: true },
        where: { eventId: In(createdEventIds) },
      });
      const reservationIds = reservations.map(({ id }) => id);

      if (reservationIds.length > 0) {
        const items = await reservationItemsRepository.find({
          select: { id: true },
          where: { reservationId: In(reservationIds) },
        });
        const itemIds = items.map(({ id }) => id);

        if (itemIds.length > 0) {
          await ticketsRepository.delete({ reservationItemId: In(itemIds) });
        }
        const payments = await paymentsRepository.find({
          select: { id: true },
          where: { reservationId: In(reservationIds) },
        });
        const paymentIds = payments.map(({ id }) => id);
        if (paymentIds.length > 0) {
          await refundsRepository.delete({ paymentId: In(paymentIds) });
        }
        await paymentsRepository.delete({ reservationId: In(reservationIds) });
        await reservationItemsRepository.delete({ reservationId: In(reservationIds) });
      }
      await eventSeatsRepository.delete({ eventId: In(createdEventIds) });
      await reservationsRepository.delete({ eventId: In(createdEventIds) });
      await eventsRepository.delete({ id: In(createdEventIds) });
    }
    await app.close();
  });

  async function authenticate(user: User = customer): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email: user.email,
      password: process.env.DEMO_USERS_PASSWORD,
    });
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    return cookie.split(';', 1)[0];
  }

  async function createActiveReservation(
    expiresAt = new Date('2099-09-01T23:30:00.000Z'),
    itemCount = 1,
    parameters: { event?: Event; customer?: User; seatOffset?: number } = {},
  ): Promise<Reservation> {
    const event =
      parameters.event ??
      (await eventsRepository.save({
        organizerId: organizer.id,
        venueId: venue.id,
        title: 'Pagamento idempotente',
        description: null,
        imageUrl: null,
        genres: ['Drama'],
        category: EventCategory.Movie,
        admissionMode: AdmissionMode.Seated,
        status: EventStatus.Published,
        startsAt: new Date('2099-10-01T23:30:00.000Z'),
        priceCents: 2590,
        capacity: null,
        catalogSource: CatalogSource.Tmdb,
        externalId: randomUUID(),
      }));
    if (!parameters.event) {
      createdEventIds.push(event.id);
    }
    const venueSeats = await venueSeatsRepository.find({
      where: { venueId: venue.id },
      order: { row: 'ASC', number: 'ASC' },
      skip: parameters.seatOffset ?? 0,
      take: itemCount,
    });

    if (venueSeats.length !== itemCount) {
      throw new Error('Venue de demonstração não possui assentos suficientes para o teste');
    }

    const reservation =
      expiresAt.getTime() > Date.now()
        ? await reservationsRepository.save({
            customerId: parameters.customer?.id ?? customer.id,
            eventId: event.id,
            expiresAt,
            confirmedAt: null,
            cancelledAt: null,
          })
        : await createExpiredReservation(
            parameters.customer?.id ?? customer.id,
            event.id,
            expiresAt,
          );
    const eventSeats = await eventSeatsRepository.save(
      venueSeats.map((venueSeat) =>
        eventSeatsRepository.create({
          eventId: event.id,
          venueSeatId: venueSeat.id,
          holdReservationId: reservation.id,
          holdExpiresAt: expiresAt,
          soldAt: null,
        }),
      ),
    );
    await reservationItemsRepository.save(
      eventSeats.map((eventSeat) =>
        reservationItemsRepository.create({
          reservationId: reservation.id,
          eventSeatId: eventSeat.id,
          unitPriceCents: 2590,
        }),
      ),
    );

    return reservation;
  }

  async function createExpiredReservation(
    customerId: string,
    eventId: string,
    expiresAt: Date,
  ): Promise<Reservation> {
    const createdAt = new Date(expiresAt.getTime() - 60 * 1000);
    const rows = (await dataSource.query(
      `
        INSERT INTO "reservations" (
          "customerId", "eventId", "createdAt", "updatedAt", "expiresAt", "confirmedAt", "cancelledAt"
        ) VALUES ($1, $2, $3, $3, $4, NULL, NULL)
        RETURNING "id"
      `,
      [customerId, eventId, createdAt, expiresAt],
    )) as Array<{ id: string }>;

    return reservationsRepository.findOneByOrFail({ id: rows[0].id });
  }

  function createPaymentRequest(reservationId: string, idempotencyKey: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/reservations/${reservationId}/payments/card`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        cardNumber: '4242 4242 4242 4242',
        cardholderName: 'Ana Beatriz Souza',
        expiry: '08/29',
        cvv: '123',
      });
  }

  async function createConfirmedReservation(cookie: string): Promise<Reservation> {
    const reservation = await createActiveReservation();
    await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(201);
    return reservationsRepository.findOneByOrFail({ id: reservation.id });
  }

  it('persiste PENDING antes do gateway e não o chama outra vez para a mesma key', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    const idempotencyKey = randomUUID();
    let resolveGateway!: (result: CardPaymentGatewayResult) => void;
    let notifyGatewayStarted!: () => void;
    const gatewayStarted = new Promise<void>((resolve) => {
      notifyGatewayStarted = resolve;
    });
    const gatewayResult = new Promise<CardPaymentGatewayResult>((resolve) => {
      resolveGateway = resolve;
    });
    paymentGateway.processCard.mockImplementationOnce(async () => {
      notifyGatewayStarted();
      return gatewayResult;
    });

    const firstResponsePromise = createPaymentRequest(reservation.id, idempotencyKey, cookie)
      .expect(201)
      .then((response) => response);
    await gatewayStarted;
    const pendingPayment = await paymentsRepository.findOneByOrFail({
      reservationId: reservation.id,
    });
    const retryResponse = await createPaymentRequest(reservation.id, idempotencyKey, cookie).expect(
      201,
    );
    resolveGateway({ status: CardPaymentGatewayStatus.Approved });
    const firstResponse = await firstResponsePromise;
    const completedRetryResponse = await createPaymentRequest(
      reservation.id,
      idempotencyKey,
      cookie,
    ).expect(201);

    expect(pendingPayment).toMatchObject({
      reservationId: reservation.id,
      status: PaymentStatus.Pending,
      amountCents: 2590,
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
    expect(paymentGateway.processCard).toHaveBeenCalledTimes(1);
    expect(seatRealtimeGateway.emitSold).toHaveBeenCalledTimes(1);
  });

  it('rejeita key diferente enquanto existir Payment PENDING', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    let resolveGateway!: (result: CardPaymentGatewayResult) => void;
    let notifyGatewayStarted!: () => void;
    const gatewayStarted = new Promise<void>((resolve) => {
      notifyGatewayStarted = resolve;
    });
    const gatewayResult = new Promise<CardPaymentGatewayResult>((resolve) => {
      resolveGateway = resolve;
    });
    paymentGateway.processCard.mockImplementationOnce(async () => {
      notifyGatewayStarted();
      return gatewayResult;
    });

    const firstPaymentPromise = createPaymentRequest(reservation.id, randomUUID(), cookie)
      .expect(201)
      .then((response) => response);
    await gatewayStarted;
    const response = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(409);
    resolveGateway({ status: CardPaymentGatewayStatus.Approved });
    await firstPaymentPromise;

    expect(response.body.code).toBe('PAYMENT_IN_PROGRESS');
    expect(paymentGateway.processCard).toHaveBeenCalledTimes(1);
  });

  it('finaliza PENDING órfão como FAILED antes de permitir nova tentativa', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    const orphanedPayment = await paymentsRepository.save({
      reservationId: reservation.id,
      method: PaymentMethod.Card,
      status: PaymentStatus.Pending,
      idempotencyKey: randomUUID(),
      amountCents: 2590,
      approvedAt: null,
      failedAt: null,
    });
    await paymentsRepository.update(orphanedPayment.id, {
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    const newPaymentResponse = await createPaymentRequest(
      reservation.id,
      randomUUID(),
      cookie,
    ).expect(201);
    const recoveredPayment = await paymentsRepository.findOneByOrFail({ id: orphanedPayment.id });

    expect(recoveredPayment).toMatchObject({ status: PaymentStatus.Failed });
    expect(recoveredPayment.failedAt).not.toBeNull();
    expect(newPaymentResponse.body.status).toBe(PaymentStatus.Approved);
  });

  it('rejeita Reservation expirada sem criar Payment', async () => {
    const reservation = await createActiveReservation(new Date('2020-01-01T00:10:00.000Z'));
    const cookie = await authenticate();

    const response = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(409);

    expect(response.body.code).toBe('RESERVATION_EXPIRED');
    await expect(paymentsRepository.countBy({ reservationId: reservation.id })).resolves.toBe(0);
  });

  it('recusa o cartão sem confirmar a Reservation ou emitir Ticket', async () => {
    paymentGateway.processCard.mockResolvedValueOnce({ status: CardPaymentGatewayStatus.Declined });
    const reservation = await createActiveReservation();
    const cookie = await authenticate();

    const response = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(201);
    const persistedReservation = await reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });

    expect(response.body.status).toBe(PaymentStatus.Declined);
    expect(persistedReservation.confirmedAt).toBeNull();
    await expect(ticketsRepository.countBy({ reservationItemId: items[0].id })).resolves.toBe(0);
    expect(seatRealtimeGateway.emitSold).not.toHaveBeenCalled();
  });

  it('confirma a Reservation, vende o assento e cria Ticket com o price snapshot', async () => {
    const reservation = await createActiveReservation();
    const event = await eventsRepository.findOneByOrFail({ id: reservation.eventId });
    const cookie = await authenticate();
    event.priceCents = 9999;
    await eventsRepository.save(event);

    const response = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(201);
    const persistedReservation = await reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const eventSeat = await eventSeatsRepository.findOneByOrFail({ eventId: reservation.eventId });
    const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });

    expect(response.body).toMatchObject({ status: PaymentStatus.Approved, amountCents: 2590 });
    expect(persistedReservation.confirmedAt).not.toBeNull();
    expect(eventSeat.soldAt).not.toBeNull();
    expect(eventSeat.holdReservationId).toBeNull();
    await expect(ticketsRepository.countBy({ reservationItemId: items[0].id })).resolves.toBe(1);
    expect(seatRealtimeGateway.emitSold).toHaveBeenCalledWith({
      eventId: reservation.eventId,
      eventSeatIds: [eventSeat.id],
    });
  });

  it('emite credenciais individuais para cada ReservationItem confirmado', async () => {
    const reservation = await createActiveReservation(undefined, 2);
    const cookie = await authenticate();

    await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(201);

    const items = await reservationItemsRepository.find({
      where: { reservationId: reservation.id },
      order: { createdAt: 'ASC' },
    });
    const tickets = await ticketsRepository.find({
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
      new Set(tickets.map((ticket) => ticketCredentialService.createCredential(ticket.publicId)))
        .size,
    ).toBe(2);
    const eventSeatIds = items
      .map((item) => item.eventSeatId)
      .filter((eventSeatId): eventSeatId is string => eventSeatId !== null);
    expect(seatRealtimeGateway.emitSold).toHaveBeenCalledWith({
      eventId: reservation.eventId,
      eventSeatIds: expect.arrayContaining(eventSeatIds),
    });
    const [soldDelta] = jest.mocked(seatRealtimeGateway.emitSold).mock.calls[0];
    expect(soldDelta.eventSeatIds).toHaveLength(2);
  });

  it('marca falha técnica e permite nova tentativa intencional', async () => {
    paymentGateway.processCard.mockRejectedValueOnce(new Error('gateway indisponível'));
    const reservation = await createActiveReservation();
    const cookie = await authenticate();

    const failedResponse = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(
      201,
    );
    const approvedResponse = await createPaymentRequest(
      reservation.id,
      randomUUID(),
      cookie,
    ).expect(201);

    expect(failedResponse.body.status).toBe(PaymentStatus.Failed);
    expect(approvedResponse.body.status).toBe(PaymentStatus.Approved);
    expect(seatRealtimeGateway.emitSold).toHaveBeenCalledTimes(1);
  });

  it('serializa cancelamentos concorrentes do CUSTOMER sem duplicar Refund', async () => {
    const customerCookie = await authenticate();
    const reservation = await createConfirmedReservation(customerCookie);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post(`/reservations/${reservation.id}/cancel`)
        .set('Cookie', customerCookie),
      request(app.getHttpServer())
        .post(`/reservations/${reservation.id}/cancel`)
        .set('Cookie', customerCookie),
    ]);
    const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });
    const tickets = await ticketsRepository.findBy({
      reservationItemId: In(items.map(({ id }) => id)),
    });
    const payment = await paymentsRepository.findOneByOrFail({ reservationId: reservation.id });

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    await expect(refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(1);
    expect(tickets).not.toHaveLength(0);
    expect(tickets.every(({ cancelledAt }) => cancelledAt !== null)).toBe(true);
  });

  it('serializa cancelamento do CUSTOMER com cancelamento do Event sem deadlock', async () => {
    const customerCookie = await authenticate();
    const customerTwoCookie = await authenticate(customerTwo);
    const organizerCookie = await authenticate(organizer);
    const reservation = await createConfirmedReservation(customerCookie);
    const event = await eventsRepository.findOneByOrFail({ id: reservation.eventId });
    const secondReservation = await createActiveReservation(undefined, 1, {
      event,
      customer: customerTwo,
      seatOffset: 1,
    });
    await createPaymentRequest(secondReservation.id, randomUUID(), customerTwoCookie).expect(201);

    const [customerResponse, organizerResponse] = await Promise.all([
      request(app.getHttpServer())
        .post(`/reservations/${reservation.id}/cancel`)
        .set('Cookie', customerCookie),
      request(app.getHttpServer())
        .post(`/organizer/me/events/${reservation.eventId}/cancel`)
        .set('Cookie', organizerCookie),
    ]);
    const persistedEvent = await eventsRepository.findOneByOrFail({ id: reservation.eventId });
    const persistedReservation = await reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const persistedSecondReservation = await reservationsRepository.findOneByOrFail({
      id: secondReservation.id,
    });
    const items = await reservationItemsRepository.findBy({
      reservationId: In([reservation.id, secondReservation.id]),
    });
    const tickets = await ticketsRepository.findBy({
      reservationItemId: In(items.map(({ id }) => id)),
    });
    const payments = await paymentsRepository.findBy({
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
      refundsRepository.countBy({ paymentId: In(payments.map(({ id }) => id)) }),
    ).resolves.toBe(2);
    expect(tickets).toHaveLength(2);
    expect(tickets.every(({ cancelledAt }) => cancelledAt !== null)).toBe(true);
  });

  it('serializa finalização de Payment com cancelamento do Event', async () => {
    const customerCookie = await authenticate();
    const organizerCookie = await authenticate(organizer);
    const reservation = await createActiveReservation();
    let resolveGateway!: (result: CardPaymentGatewayResult) => void;
    let notifyGatewayStarted!: () => void;
    const gatewayStarted = new Promise<void>((resolve) => {
      notifyGatewayStarted = resolve;
    });
    const gatewayResult = new Promise<CardPaymentGatewayResult>((resolve) => {
      resolveGateway = resolve;
    });
    paymentGateway.processCard.mockImplementationOnce(async () => {
      notifyGatewayStarted();
      return gatewayResult;
    });

    const paymentResponsePromise = createPaymentRequest(
      reservation.id,
      randomUUID(),
      customerCookie,
    ).then((response) => response);
    await gatewayStarted;
    const organizerResponsePromise = request(app.getHttpServer())
      .post(`/organizer/me/events/${reservation.eventId}/cancel`)
      .set('Cookie', organizerCookie)
      .then((response) => response);
    resolveGateway({ status: CardPaymentGatewayStatus.Approved });
    const [paymentResponse, organizerResponse] = await Promise.all([
      paymentResponsePromise,
      organizerResponsePromise,
    ]);
    const persistedEvent = await eventsRepository.findOneByOrFail({ id: reservation.eventId });
    const persistedReservation = await reservationsRepository.findOneByOrFail({
      id: reservation.id,
    });
    const payment = await paymentsRepository.findOneByOrFail({ reservationId: reservation.id });
    const items = await reservationItemsRepository.findBy({ reservationId: reservation.id });

    expect(organizerResponse.status).toBe(200);
    expect(paymentResponse.status).toBe(201);
    expect([PaymentStatus.Approved, PaymentStatus.Failed]).toContain(paymentResponse.body.status);
    expect(persistedEvent.status).toBe(EventStatus.Cancelled);
    expect(persistedReservation.cancelledAt).not.toBeNull();
    const tickets = await ticketsRepository.findBy({
      reservationItemId: In(items.map(({ id }) => id)),
    });
    const refundCount = await refundsRepository.countBy({ paymentId: payment.id });

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
