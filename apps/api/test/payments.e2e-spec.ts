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
import { PaymentStatus } from '../src/modules/payments/paymentStatus.enum';
import { ReservationItem } from '../src/modules/reservations/reservationItem.entity';
import { Reservation } from '../src/modules/reservations/reservation.entity';
import { User } from '../src/modules/users/user.entity';
import { Venue } from '../src/modules/venues/venue.entity';
import { VenueSeat } from '../src/modules/venues/venueSeat.entity';

describe('Payments', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let eventsRepository: Repository<Event>;
  let eventSeatsRepository: Repository<EventSeat>;
  let paymentsRepository: Repository<Payment>;
  let reservationItemsRepository: Repository<ReservationItem>;
  let reservationsRepository: Repository<Reservation>;
  let venueSeatsRepository: Repository<VenueSeat>;
  let customer: User;
  let organizer: User;
  let venue: Venue;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = testingModule.createNestApplication();
    new Application().configure(app);
    await app.init();

    dataSource = app.get(DataSource);
    eventsRepository = dataSource.getRepository(Event);
    eventSeatsRepository = dataSource.getRepository(EventSeat);
    paymentsRepository = dataSource.getRepository(Payment);
    reservationItemsRepository = dataSource.getRepository(ReservationItem);
    reservationsRepository = dataSource.getRepository(Reservation);
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

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      const reservations = await reservationsRepository.find({
        select: { id: true },
        where: { eventId: In(createdEventIds) },
      });
      const reservationIds = reservations.map(({ id }) => id);

      if (reservationIds.length > 0) {
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
    const venueSeat = await venueSeatsRepository.findOneOrFail({ where: { venueId: venue.id } });
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
    const eventSeat = await eventSeatsRepository.save({
      eventId: event.id,
      venueSeatId: venueSeat.id,
      holdReservationId: reservation.id,
      holdExpiresAt: expiresAt,
      soldAt: null,
    });
    await reservationItemsRepository.save({
      reservationId: reservation.id,
      eventSeatId: eventSeat.id,
      unitPriceCents: 2590,
    });

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

  it('persiste PENDING com o valor dos ReservationItems e retorna o mesmo Payment para a mesma key', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    const idempotencyKey = randomUUID();

    const firstResponse = await createPaymentRequest(reservation.id, idempotencyKey, cookie).expect(
      201,
    );
    const retryResponse = await createPaymentRequest(reservation.id, idempotencyKey, cookie).expect(
      201,
    );

    expect(firstResponse.body).toMatchObject({
      reservationId: reservation.id,
      status: PaymentStatus.Pending,
      amountCents: 2590,
      approvedAt: null,
      failedAt: null,
    });
    expect(retryResponse.body.id).toBe(firstResponse.body.id);
    await expect(paymentsRepository.countBy({ reservationId: reservation.id })).resolves.toBe(1);
  });

  it('rejeita key diferente enquanto existir Payment PENDING', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();

    await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(201);
    const response = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(409);

    expect(response.body.code).toBe('PAYMENT_IN_PROGRESS');
    await expect(paymentsRepository.countBy({ reservationId: reservation.id })).resolves.toBe(1);
  });

  it('finaliza PENDING órfão como FAILED antes de permitir nova tentativa', async () => {
    const reservation = await createActiveReservation();
    const cookie = await authenticate();
    const firstPaymentResponse = await createPaymentRequest(
      reservation.id,
      randomUUID(),
      cookie,
    ).expect(201);

    await paymentsRepository.update(firstPaymentResponse.body.id, {
      createdAt: new Date('2020-01-01T00:00:00.000Z'),
    });

    const newPaymentResponse = await createPaymentRequest(
      reservation.id,
      randomUUID(),
      cookie,
    ).expect(201);
    const orphanedPayment = await paymentsRepository.findOneByOrFail({
      id: firstPaymentResponse.body.id,
    });

    expect(orphanedPayment).toMatchObject({ status: PaymentStatus.Failed });
    expect(orphanedPayment.failedAt).not.toBeNull();
    expect(newPaymentResponse.body.status).toBe(PaymentStatus.Pending);
  });

  it('rejeita Reservation expirada sem criar Payment', async () => {
    const reservation = await createActiveReservation(new Date('2020-01-01T00:10:00.000Z'));
    const cookie = await authenticate();

    const response = await createPaymentRequest(reservation.id, randomUUID(), cookie).expect(409);

    expect(response.body.code).toBe('RESERVATION_EXPIRED');
    await expect(paymentsRepository.countBy({ reservationId: reservation.id })).resolves.toBe(0);
  });
});
