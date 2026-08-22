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
  let ticketsRepository: Repository<Ticket>;
  let ticketCredentialService: TicketCredentialService;
  let venueSeatsRepository: Repository<VenueSeat>;
  let customer: User;
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
    ticketsRepository = dataSource.getRepository(Ticket);
    ticketCredentialService = app.get(TicketCredentialService);
    seatRealtimeGateway = app.get(SeatRealtimeGateway);
    jest.spyOn(seatRealtimeGateway, 'emitSold').mockImplementation();
    venueSeatsRepository = dataSource.getRepository(VenueSeat);
    customer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'customer.one.demo@ntq.local' });
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
        await paymentsRepository.delete({ reservationId: In(reservationIds) });
        await reservationItemsRepository.delete({ reservationId: In(reservationIds) });
      }
      await eventSeatsRepository.delete({ eventId: In(createdEventIds) });
      await reservationsRepository.delete({ eventId: In(createdEventIds) });
      await eventsRepository.delete({ id: In(createdEventIds) });
    }
    await app.close();
  });

  async function authenticate(): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email: customer.email,
      password: process.env.DEMO_USERS_PASSWORD,
    });
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    return cookie.split(';', 1)[0];
  }

  async function createActiveReservation(
    expiresAt = new Date('2099-09-01T23:30:00.000Z'),
    itemCount = 1,
  ): Promise<Reservation> {
    const event = await eventsRepository.save({
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
    });
    createdEventIds.push(event.id);
    const venueSeats = await venueSeatsRepository.find({
      where: { venueId: venue.id },
      order: { row: 'ASC', number: 'ASC' },
      take: itemCount,
    });

    if (venueSeats.length !== itemCount) {
      throw new Error('Venue de demonstração não possui assentos suficientes para o teste');
    }

    const reservation =
      expiresAt.getTime() > Date.now()
        ? await reservationsRepository.save({
            customerId: customer.id,
            eventId: event.id,
            expiresAt,
            confirmedAt: null,
            cancelledAt: null,
          })
        : await createExpiredReservation(customer.id, event.id, expiresAt);
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
});
