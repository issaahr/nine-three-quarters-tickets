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
import { EventStatus } from '../src/modules/events/eventStatus.enum';
import { Payment } from '../src/modules/payments/payment.entity';
import { PaymentStatus } from '../src/modules/payments/paymentStatus.enum';
import { Refund } from '../src/modules/refunds/refund.entity';
import { ReservationItem } from '../src/modules/reservations/reservationItem.entity';
import { Reservation } from '../src/modules/reservations/reservation.entity';
import { Ticket } from '../src/modules/tickets/ticket.entity';
import { User } from '../src/modules/users/user.entity';
import { Venue } from '../src/modules/venues/venue.entity';

describe('compra GENERAL_ADMISSION', () => {
  let app: INestApplication;
  let eventsRepository: Repository<Event>;
  let paymentsRepository: Repository<Payment>;
  let refundsRepository: Repository<Refund>;
  let reservationItemsRepository: Repository<ReservationItem>;
  let reservationsRepository: Repository<Reservation>;
  let ticketsRepository: Repository<Ticket>;
  let organizer: User;
  let customerOne: User;
  let customerTwo: User;
  let gate: User;
  let venue: Venue;
  let organizerCookie: string;
  let customerOneCookie: string;
  let customerTwoCookie: string;
  let gateCookie: string;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = testingModule.createNestApplication();
    new Application().configure(app);
    await app.init();

    const dataSource = app.get(DataSource);
    eventsRepository = dataSource.getRepository(Event);
    paymentsRepository = dataSource.getRepository(Payment);
    refundsRepository = dataSource.getRepository(Refund);
    reservationItemsRepository = dataSource.getRepository(ReservationItem);
    reservationsRepository = dataSource.getRepository(Reservation);
    ticketsRepository = dataSource.getRepository(Ticket);
    organizer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'organizer.demo@ntq.local' });
    customerOne = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'customer.one.demo@ntq.local' });
    customerTwo = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'customer.two.demo@ntq.local' });
    gate = await dataSource.getRepository(User).findOneByOrFail({ email: 'gate.demo@ntq.local' });
    venue = await dataSource.getRepository(Venue).findOneByOrFail({ name: 'Nexus Arena' });
    [organizerCookie, customerOneCookie, customerTwoCookie, gateCookie] = await Promise.all([
      authenticate(organizer),
      authenticate(customerOne),
      authenticate(customerTwo),
      authenticate(gate),
    ]);
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
        const payments = await paymentsRepository.find({
          select: { id: true },
          where: { reservationId: In(reservationIds) },
        });
        const paymentIds = payments.map(({ id }) => id);

        if (itemIds.length > 0) {
          await ticketsRepository.delete({ reservationItemId: In(itemIds) });
        }
        if (paymentIds.length > 0) {
          await refundsRepository.delete({ paymentId: In(paymentIds) });
        }
        await paymentsRepository.delete({ reservationId: In(reservationIds) });
        await reservationItemsRepository.delete({ reservationId: In(reservationIds) });
      }
      await reservationsRepository.delete({ eventId: In(createdEventIds) });
      await eventsRepository.delete({ id: In(createdEventIds) });
    }
    await app.close();
  });

  /** Autentica um usuário pelo endpoint público e devolve seu cookie de sessão. */
  async function authenticate(user: User): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email: user.email,
      password: process.env.DEMO_USERS_PASSWORD,
    });
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    return cookie.split(';', 1)[0];
  }

  /** Persiste um show publicado com capacidade exclusiva do cenário. */
  async function createEvent(capacity: number): Promise<Event> {
    const event = await eventsRepository.save({
      organizerId: organizer.id,
      venueId: venue.id,
      title: 'Show GA completo',
      description: null,
      imageUrl: null,
      genres: ['Rock'],
      category: EventCategory.Show,
      admissionMode: AdmissionMode.GeneralAdmission,
      status: EventStatus.Published,
      startsAt: new Date('2099-10-01T00:00:00.000Z'),
      priceCents: 15000,
      capacity,
      catalogSource: CatalogSource.Ticketmaster,
      externalId: randomUUID(),
    });

    createdEventIds.push(event.id);
    return event;
  }

  /** Cria uma Reservation GA usando o contrato HTTP do CUSTOMER. */
  async function createReservation(
    eventId: string,
    quantity: number,
    cookie: string,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/reservations/general-admission')
      .set('Cookie', cookie)
      .send({ eventId, quantity })
      .expect(201);

    return response.body.id as string;
  }

  /** Aprova deterministicamente o cartão simulado para a Reservation informada. */
  async function approvePayment(reservationId: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/reservations/${reservationId}/payments/card`)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        cardNumber: '4242 4242 4242 4242',
        cardholderName: 'Ana Beatriz Souza',
        expiry: '08/29',
        cvv: '123',
      })
      .expect(201);
  }

  it('confirma Payment e emite um Ticket independente para cada unidade GA', async () => {
    const event = await createEvent(3);
    const reservationId = await createReservation(event.id, 3, customerOneCookie);
    const paymentResponse = await approvePayment(reservationId, customerOneCookie);
    const reservation = await reservationsRepository.findOneByOrFail({ id: reservationId });
    const items = await reservationItemsRepository.findBy({ reservationId });
    const tickets = await ticketsRepository.findBy({
      reservationItemId: In(items.map(({ id }) => id)),
    });

    expect(paymentResponse.body).toMatchObject({
      status: PaymentStatus.Approved,
      amountCents: 45000,
    });
    expect(reservation.confirmedAt).not.toBeNull();
    expect(items).toHaveLength(3);
    expect(items.every(({ eventSeatId }) => eventSeatId === null)).toBe(true);
    expect(tickets).toHaveLength(3);
    expect(new Set(tickets.map(({ reservationItemId }) => reservationItemId)).size).toBe(3);

    const purchases = await request(app.getHttpServer())
      .get('/tickets')
      .query({ reservationId })
      .set('Cookie', customerOneCookie)
      .expect(200);
    expect(purchases.body.items).toHaveLength(1);
    expect(purchases.body.items[0]).toMatchObject({
      reservationId,
      event: { admissionMode: AdmissionMode.GeneralAdmission, category: EventCategory.Show },
    });
    expect(purchases.body.items[0].tickets).toHaveLength(3);
    expect(
      purchases.body.items[0].tickets.every(
        (ticket: { seatLabel: string | null }) => ticket.seatLabel === null,
      ),
    ).toBe(true);

    const checkIn = await request(app.getHttpServer())
      .post(`/gate/events/${event.id}/check-in`)
      .set('Cookie', gateCookie)
      .send({ credential: purchases.body.items[0].tickets[0].credential })
      .expect(200);
    expect(checkIn.body).toEqual({ result: 'VALID' });
  });

  it('cancela compra GA, registra Refund e devolve toda a capacidade', async () => {
    const event = await createEvent(2);
    const reservationId = await createReservation(event.id, 2, customerOneCookie);
    await approvePayment(reservationId, customerOneCookie);

    const unavailableDetail = await request(app.getHttpServer())
      .get(`/events/${event.id}`)
      .expect(200);
    expect(unavailableDetail.body.availableQuantity).toBe(0);

    const cancellation = await request(app.getHttpServer())
      .post(`/reservations/${reservationId}/cancel`)
      .set('Cookie', customerOneCookie)
      .expect(200);
    const payment = await paymentsRepository.findOneByOrFail({ reservationId });
    const items = await reservationItemsRepository.findBy({ reservationId });
    const tickets = await ticketsRepository.findBy({
      reservationItemId: In(items.map(({ id }) => id)),
    });
    const availableDetail = await request(app.getHttpServer())
      .get(`/events/${event.id}`)
      .expect(200);

    expect(cancellation.body.status).toBe('CANCELLED');
    expect(payment.status).toBe(PaymentStatus.Approved);
    await expect(refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(1);
    expect(tickets).toHaveLength(2);
    expect(tickets.every(({ cancelledAt }) => cancelledAt !== null)).toBe(true);
    expect(availableDetail.body.availableQuantity).toBe(2);
  });

  it('cancela show com compra e hold GA usando o lifecycle genérico existente', async () => {
    const event = await createEvent(2);
    const confirmedReservationId = await createReservation(event.id, 1, customerOneCookie);
    await approvePayment(confirmedReservationId, customerOneCookie);
    const activeReservationId = await createReservation(event.id, 1, customerTwoCookie);

    await request(app.getHttpServer())
      .post(`/organizer/me/events/${event.id}/cancel`)
      .set('Cookie', organizerCookie)
      .expect(200);

    const persistedEvent = await eventsRepository.findOneByOrFail({ id: event.id });
    const reservations = await reservationsRepository.findBy({
      id: In([confirmedReservationId, activeReservationId]),
    });
    const payment = await paymentsRepository.findOneByOrFail({
      reservationId: confirmedReservationId,
    });
    const confirmedItems = await reservationItemsRepository.findBy({
      reservationId: confirmedReservationId,
    });
    const tickets = await ticketsRepository.findBy({
      reservationItemId: In(confirmedItems.map(({ id }) => id)),
    });

    expect(persistedEvent.status).toBe(EventStatus.Cancelled);
    expect(reservations).toHaveLength(2);
    expect(reservations.every(({ cancelledAt }) => cancelledAt !== null)).toBe(true);
    await expect(refundsRepository.countBy({ paymentId: payment.id })).resolves.toBe(1);
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ cancelledAt: expect.any(Date) });

    const publicDetail = await request(app.getHttpServer()).get(`/events/${event.id}`).expect(200);
    expect(publicDetail.body).toMatchObject({
      status: EventStatus.Cancelled,
      availableQuantity: 2,
    });
  });
});
