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
import { ReservationItem } from '../src/modules/reservations/reservationItem.entity';
import { Reservation } from '../src/modules/reservations/reservation.entity';
import { User } from '../src/modules/users/user.entity';
import { Venue } from '../src/modules/venues/venue.entity';
import { VenueSeat } from '../src/modules/venues/venueSeat.entity';

describe('Reservations seated', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let eventsRepository: Repository<Event>;
  let eventSeatsRepository: Repository<EventSeat>;
  let reservationsRepository: Repository<Reservation>;
  let reservationItemsRepository: Repository<ReservationItem>;
  let venueSeatsRepository: Repository<VenueSeat>;
  let customerOne: User;
  let customerTwo: User;
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
    reservationsRepository = dataSource.getRepository(Reservation);
    reservationItemsRepository = dataSource.getRepository(ReservationItem);
    venueSeatsRepository = dataSource.getRepository(VenueSeat);
    customerOne = await dataSource
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

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      const reservations = await reservationsRepository.find({
        select: { id: true },
        where: { eventId: In(createdEventIds) },
      });
      const reservationIds = reservations.map(({ id }) => id);

      if (reservationIds.length > 0) {
        await reservationItemsRepository.delete({ reservationId: In(reservationIds) });
      }
      await eventSeatsRepository.delete({ eventId: In(createdEventIds) });
      await reservationsRepository.delete({ eventId: In(createdEventIds) });
      await eventsRepository.delete({ id: In(createdEventIds) });
    }
    await app.close();
  });

  /** Autentica uma conta de demonstração pelo mesmo fluxo HTTP disponível ao cliente. */
  async function authenticate(email: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email,
      password: process.env.DEMO_USERS_PASSWORD,
    });
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    return cookie.split(';', 1)[0];
  }

  /** Persiste uma ocorrência controlada pela suíte antes de materializar os EventSeats necessários. */
  async function createEvent(overrides: Partial<Event> = {}): Promise<Event> {
    const event = await eventsRepository.save({
      organizerId: organizer.id,
      venueId: venue.id,
      title: 'Reserva concorrente',
      description: null,
      imageUrl: null,
      genres: ['Drama'],
      category: EventCategory.Movie,
      admissionMode: AdmissionMode.Seated,
      status: EventStatus.Published,
      startsAt: new Date('2099-09-01T23:30:00.000Z'),
      priceCents: 2500,
      capacity: null,
      catalogSource: CatalogSource.Tmdb,
      externalId: randomUUID(),
      ...overrides,
    });

    createdEventIds.push(event.id);
    return event;
  }

  /** Materializa somente os assentos necessários ao cenário, preservando a ligação com o layout do Venue. */
  async function createEventSeats(event: Event, quantity: number): Promise<EventSeat[]> {
    const venueSeats = await venueSeatsRepository.find({
      where: { venueId: venue.id },
      order: { y: 'ASC', x: 'ASC' },
      take: quantity,
    });

    return eventSeatsRepository.save(
      venueSeats.map((venueSeat) => ({
        eventId: event.id,
        venueSeatId: venueSeat.id,
        holdReservationId: null,
        holdExpiresAt: null,
        soldAt: null,
      })),
    );
  }

  /** Conta itens vinculados a um Event sem depender de dados deixados por outros cenários da suíte. */
  function countReservationItemsForEvent(eventId: string): Promise<number> {
    return reservationItemsRepository
      .createQueryBuilder('reservationItem')
      .innerJoin('reservationItem.reservation', 'reservation')
      .where('"reservation"."eventId" = :eventId', { eventId })
      .getCount();
  }

  it('cria hold para todos os assentos e persiste o snapshot de preço do Event', async () => {
    const event = await createEvent({ priceCents: 2590 });
    const [firstSeat, secondSeat] = await createEventSeats(event, 2);
    const cookie = await authenticate(customerOne.email);

    const response = await request(app.getHttpServer())
      .post('/reservations')
      .set('Cookie', cookie)
      .send({ eventId: event.id, eventSeatIds: [firstSeat.id, secondSeat.id] })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        eventId: event.id,
        items: expect.arrayContaining([
          expect.objectContaining({ eventSeatId: firstSeat.id, unitPriceCents: 2590 }),
          expect.objectContaining({ eventSeatId: secondSeat.id, unitPriceCents: 2590 }),
        ]),
      }),
    );
    expect(response.body.items).toHaveLength(2);

    const reservation = await reservationsRepository.findOneByOrFail({ id: response.body.id });
    const persistedItems = await reservationItemsRepository.findBy({
      reservationId: reservation.id,
    });
    const persistedSeats = await eventSeatsRepository.findBy({
      id: In([firstSeat.id, secondSeat.id]),
    });

    expect(persistedItems).toHaveLength(2);
    expect(persistedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventSeatId: firstSeat.id, unitPriceCents: 2590 }),
        expect.objectContaining({ eventSeatId: secondSeat.id, unitPriceCents: 2590 }),
      ]),
    );
    expect(persistedSeats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstSeat.id,
          holdReservationId: reservation.id,
          holdExpiresAt: reservation.expiresAt,
        }),
        expect.objectContaining({
          id: secondSeat.id,
          holdReservationId: reservation.id,
          holdExpiresAt: reservation.expiresAt,
        }),
      ]),
    );
  });

  it('permite que somente um CUSTOMER adquira o mesmo EventSeat sob requests concorrentes', async () => {
    const event = await createEvent();
    const [seat] = await createEventSeats(event, 1);
    const [firstCookie, secondCookie] = await Promise.all([
      authenticate(customerOne.email),
      authenticate(customerTwo.email),
    ]);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/reservations')
        .set('Cookie', firstCookie)
        .send({ eventId: event.id, eventSeatIds: [seat.id] }),
      request(app.getHttpServer())
        .post('/reservations')
        .set('Cookie', secondCookie)
        .send({ eventId: event.id, eventSeatIds: [seat.id] }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(responses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body: expect.objectContaining({ code: 'SEAT_UNAVAILABLE' }) }),
      ]),
    );
    await expect(reservationsRepository.countBy({ eventId: event.id })).resolves.toBe(1);
    await expect(countReservationItemsForEvent(event.id)).resolves.toBe(1);
  });

  it('reverte Reservation, itens e holds quando qualquer assento solicitado está indisponível', async () => {
    const event = await createEvent();
    const [availableSeat, soldSeat] = await createEventSeats(event, 2);
    const cookie = await authenticate(customerOne.email);
    await eventSeatsRepository.update(soldSeat.id, { soldAt: new Date() });

    const response = await request(app.getHttpServer())
      .post('/reservations')
      .set('Cookie', cookie)
      .send({ eventId: event.id, eventSeatIds: [availableSeat.id, soldSeat.id] })
      .expect(409);

    expect(response.body).toEqual(expect.objectContaining({ code: 'SEAT_UNAVAILABLE' }));
    await expect(reservationsRepository.countBy({ eventId: event.id })).resolves.toBe(0);
    await expect(countReservationItemsForEvent(event.id)).resolves.toBe(0);
    await expect(
      eventSeatsRepository.findOneByOrFail({ id: availableSeat.id }),
    ).resolves.toMatchObject({
      holdReservationId: null,
      holdExpiresAt: null,
    });
  });

  it('reutiliza um EventSeat cujo hold expirou sem exigir scheduler', async () => {
    const event = await createEvent();
    const [seat] = await createEventSeats(event, 1);
    const createdAt = new Date('2020-01-01T00:00:00.000Z');
    const expiresAt = new Date('2020-01-01T00:10:00.000Z');
    const rows = (await dataSource.query(
      `
        INSERT INTO "reservations" (
          "customerId", "eventId", "createdAt", "updatedAt", "expiresAt", "confirmedAt", "cancelledAt"
        ) VALUES ($1, $2, $3, $3, $4, NULL, NULL)
        RETURNING "id"
      `,
      [customerOne.id, event.id, createdAt, expiresAt],
    )) as Array<{ id: string }>;
    await eventSeatsRepository.update(seat.id, {
      holdReservationId: rows[0].id,
      holdExpiresAt: expiresAt,
    });
    const cookie = await authenticate(customerTwo.email);

    const response = await request(app.getHttpServer())
      .post('/reservations')
      .set('Cookie', cookie)
      .send({ eventId: event.id, eventSeatIds: [seat.id] })
      .expect(201);

    await expect(eventSeatsRepository.findOneByOrFail({ id: seat.id })).resolves.toMatchObject({
      holdReservationId: response.body.id,
    });
  });

  it('rejeita uma nova tentativa do mesmo CUSTOMER enquanto existe Reservation ACTIVE no Event', async () => {
    const event = await createEvent();
    const [firstSeat, secondSeat] = await createEventSeats(event, 2);
    const cookie = await authenticate(customerOne.email);

    await request(app.getHttpServer())
      .post('/reservations')
      .set('Cookie', cookie)
      .send({ eventId: event.id, eventSeatIds: [firstSeat.id] })
      .expect(201);
    const response = await request(app.getHttpServer())
      .post('/reservations')
      .set('Cookie', cookie)
      .send({ eventId: event.id, eventSeatIds: [secondSeat.id] })
      .expect(409);

    expect(response.body).toEqual(expect.objectContaining({ code: 'ACTIVE_RESERVATION_EXISTS' }));
    await expect(
      eventSeatsRepository.findOneByOrFail({ id: secondSeat.id }),
    ).resolves.toMatchObject({
      holdReservationId: null,
      holdExpiresAt: null,
    });
  });

  it.each([
    [EventStatus.Draft, new Date('2099-09-01T23:30:00.000Z'), 'EVENT_CANNOT_BE_RESERVED'],
    [EventStatus.Published, new Date('2020-09-01T23:30:00.000Z'), 'EVENT_ALREADY_STARTED'],
  ])('rejeita Event não elegível: %s', async (status, startsAt, expectedCode) => {
    const event = await createEvent({ status, startsAt });
    const cookie = await authenticate(customerOne.email);

    const response = await request(app.getHttpServer())
      .post('/reservations')
      .set('Cookie', cookie)
      .send({ eventId: event.id, eventSeatIds: [randomUUID()] })
      .expect(409);

    expect(response.body).toEqual(expect.objectContaining({ code: expectedCode }));
  });

  it('exige CUSTOMER e valida uma seleção sem EventSeat.id repetido', async () => {
    const duplicateSeatId = randomUUID();

    await request(app.getHttpServer())
      .post('/reservations')
      .send({ eventId: randomUUID(), eventSeatIds: [duplicateSeatId, duplicateSeatId] })
      .expect(401);

    const organizerCookie = await authenticate(organizer.email);
    await request(app.getHttpServer())
      .post('/reservations')
      .set('Cookie', organizerCookie)
      .send({ eventId: randomUUID(), eventSeatIds: [randomUUID()] })
      .expect(403);

    const customerCookie = await authenticate(customerOne.email);
    await request(app.getHttpServer())
      .post('/reservations')
      .set('Cookie', customerCookie)
      .send({ eventId: randomUUID(), eventSeatIds: [duplicateSeatId, duplicateSeatId] })
      .expect(400);
  });
});
