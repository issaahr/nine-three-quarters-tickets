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
import { ReservationItem } from '../src/modules/reservations/reservationItem.entity';
import { Reservation } from '../src/modules/reservations/reservation.entity';
import { User } from '../src/modules/users/user.entity';
import { Venue } from '../src/modules/venues/venue.entity';

describe('Reservations GENERAL_ADMISSION', () => {
  let app: INestApplication;
  let eventsRepository: Repository<Event>;
  let reservationsRepository: Repository<Reservation>;
  let reservationItemsRepository: Repository<ReservationItem>;
  let customerOne: User;
  let customerTwo: User;
  let organizer: User;
  let generalAdmissionVenue: Venue;
  let seatedVenue: Venue;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = testingModule.createNestApplication();
    new Application().configure(app);
    await app.init();

    const dataSource = app.get(DataSource);
    eventsRepository = dataSource.getRepository(Event);
    reservationsRepository = dataSource.getRepository(Reservation);
    reservationItemsRepository = dataSource.getRepository(ReservationItem);
    customerOne = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'customer.one.demo@ntq.local' });
    customerTwo = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'customer.two.demo@ntq.local' });
    organizer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'organizer.demo@ntq.local' });
    generalAdmissionVenue = await dataSource
      .getRepository(Venue)
      .findOneByOrFail({ name: 'Nexus Arena' });
    seatedVenue = await dataSource
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
      await reservationsRepository.delete({ eventId: In(createdEventIds) });
      await eventsRepository.delete({ id: In(createdEventIds) });
    }
    await app.close();
  });

  /** Autentica uma conta pelo fluxo HTTP real e devolve somente o cookie de sessão. */
  async function authenticate(email: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email,
      password: process.env.DEMO_USERS_PASSWORD,
    });
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    return cookie.split(';', 1)[0];
  }

  /** Persiste um show publicado com capacidade agregada controlada pelo cenário. */
  async function createGeneralAdmissionEvent(capacity: number): Promise<Event> {
    const event = await eventsRepository.save({
      organizerId: organizer.id,
      venueId: generalAdmissionVenue.id,
      title: 'Show GA concorrente',
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

  /** Persiste um filme seated publicado para provar a separação dos contratos de aquisição. */
  async function createSeatedEvent(): Promise<Event> {
    const event = await eventsRepository.save({
      organizerId: organizer.id,
      venueId: seatedVenue.id,
      title: 'Filme seated',
      description: null,
      imageUrl: null,
      genres: ['Drama'],
      category: EventCategory.Movie,
      admissionMode: AdmissionMode.Seated,
      status: EventStatus.Published,
      startsAt: new Date('2099-10-01T00:00:00.000Z'),
      priceCents: 2500,
      capacity: null,
      catalogSource: CatalogSource.Tmdb,
      externalId: randomUUID(),
    });

    createdEventIds.push(event.id);
    return event;
  }

  /**
   * Persiste uma Reservation GA com a quantidade e o lifecycle exigidos pelo cenário.
   *
   * @param event - Show cujo estoque será ocupado ou historicamente ignorado.
   * @param quantity - Número de ReservationItems sem EventSeat.
   * @param lifecycle - Timestamps que determinam se os itens ocupam capacidade.
   * @returns Reservation persistida com seus itens.
   */
  async function seedGeneralAdmissionReservation(
    event: Event,
    quantity: number,
    lifecycle: Pick<Reservation, 'expiresAt' | 'confirmedAt' | 'cancelledAt'>,
  ): Promise<Reservation> {
    const createdAt =
      lifecycle.expiresAt.getTime() > Date.now()
        ? new Date()
        : new Date(lifecycle.expiresAt.getTime() - 10 * 60 * 1000);
    const rows = (await reservationsRepository.query(
      `
        INSERT INTO "reservations" (
          "customerId", "eventId", "createdAt", "updatedAt", "expiresAt", "confirmedAt", "cancelledAt"
        ) VALUES ($1, $2, $3, $3, $4, $5, $6)
        RETURNING "id"
      `,
      [
        customerOne.id,
        event.id,
        createdAt,
        lifecycle.expiresAt,
        lifecycle.confirmedAt,
        lifecycle.cancelledAt,
      ],
    )) as Array<{ id: string }>;
    const reservation = await reservationsRepository.findOneByOrFail({ id: rows[0].id });
    await reservationItemsRepository.save(
      Array.from({ length: quantity }, () => ({
        reservationId: reservation.id,
        eventSeatId: null,
        unitPriceCents: event.priceCents,
      })),
    );
    return reservation;
  }

  /** Conta somente os itens pertencentes ao Event informado. */
  function countItemsForEvent(eventId: string): Promise<number> {
    return reservationItemsRepository
      .createQueryBuilder('reservationItem')
      .innerJoin('reservationItem.reservation', 'reservation')
      .where('"reservation"."eventId" = :eventId', { eventId })
      .getCount();
  }

  it('cria N itens GA sem EventSeat e fotografa o preço unitário', async () => {
    const event = await createGeneralAdmissionEvent(10);
    const cookie = await authenticate(customerOne.email);

    const response = await request(app.getHttpServer())
      .post('/reservations/general-admission')
      .set('Cookie', cookie)
      .send({ eventId: event.id, quantity: 3 })
      .expect(201);

    expect(response.body.eventId).toBe(event.id);
    expect(response.body.items).toHaveLength(3);
    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventSeatId: null, unitPriceCents: 15000 }),
      ]),
    );
    await expect(countItemsForEvent(event.id)).resolves.toBe(3);
  });

  it('expõe disponibilidade descontando holds ativos e compras confirmadas', async () => {
    const event = await createGeneralAdmissionEvent(10);
    await seedGeneralAdmissionReservation(event, 2, {
      expiresAt: new Date('2099-01-01T00:10:00.000Z'),
      confirmedAt: null,
      cancelledAt: null,
    });
    await seedGeneralAdmissionReservation(event, 1, {
      expiresAt: new Date('2020-01-01T00:10:00.000Z'),
      confirmedAt: new Date('2020-01-01T00:05:00.000Z'),
      cancelledAt: null,
    });
    await seedGeneralAdmissionReservation(event, 2, {
      expiresAt: new Date('2020-01-01T00:10:00.000Z'),
      confirmedAt: null,
      cancelledAt: null,
    });
    await seedGeneralAdmissionReservation(event, 1, {
      expiresAt: new Date('2099-01-01T00:10:00.000Z'),
      confirmedAt: null,
      cancelledAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await request(app.getHttpServer()).get(`/events/${event.id}`).expect(200);

    expect(response.body).toEqual(expect.objectContaining({ capacity: 10, availableQuantity: 7 }));
  });

  it('serializa duas requests que disputam a última unidade sem ultrapassar capacity', async () => {
    const event = await createGeneralAdmissionEvent(3);
    await seedGeneralAdmissionReservation(event, 2, {
      expiresAt: new Date('2020-01-01T00:10:00.000Z'),
      confirmedAt: new Date('2020-01-01T00:05:00.000Z'),
      cancelledAt: null,
    });
    const [firstCookie, secondCookie] = await Promise.all([
      authenticate(customerOne.email),
      authenticate(customerTwo.email),
    ]);

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/reservations/general-admission')
        .set('Cookie', firstCookie)
        .send({ eventId: event.id, quantity: 1 }),
      request(app.getHttpServer())
        .post('/reservations/general-admission')
        .set('Cookie', secondCookie)
        .send({ eventId: event.id, quantity: 1 }),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(responses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({ code: 'GENERAL_ADMISSION_CAPACITY_UNAVAILABLE' }),
        }),
      ]),
    );
    await expect(countItemsForEvent(event.id)).resolves.toBe(3);
    await expect(reservationsRepository.countBy({ eventId: event.id })).resolves.toBe(2);
  });

  it('ignora hold expirado e libera capacidade ao cancelar uma Reservation ativa', async () => {
    const event = await createGeneralAdmissionEvent(2);
    await seedGeneralAdmissionReservation(event, 2, {
      expiresAt: new Date('2020-01-01T00:10:00.000Z'),
      confirmedAt: null,
      cancelledAt: null,
    });
    const cookie = await authenticate(customerTwo.email);
    const creation = await request(app.getHttpServer())
      .post('/reservations/general-admission')
      .set('Cookie', cookie)
      .send({ eventId: event.id, quantity: 2 })
      .expect(201);

    const unavailableDetail = await request(app.getHttpServer())
      .get(`/events/${event.id}`)
      .expect(200);
    expect(unavailableDetail.body.availableQuantity).toBe(0);

    await request(app.getHttpServer())
      .post(`/reservations/${creation.body.id}/cancel`)
      .set('Cookie', cookie)
      .expect(200);

    const detail = await request(app.getHttpServer()).get(`/events/${event.id}`).expect(200);
    expect(detail.body.availableQuantity).toBe(2);
  });

  it('rejeita quantidade inválida, papel incorreto e Event SEATED', async () => {
    const generalAdmissionEvent = await createGeneralAdmissionEvent(10);
    const seatedEvent = await createSeatedEvent();
    const customerCookie = await authenticate(customerOne.email);

    await request(app.getHttpServer())
      .post('/reservations/general-admission')
      .set('Cookie', customerCookie)
      .send({ eventId: generalAdmissionEvent.id, quantity: 0 })
      .expect(400);

    const organizerCookie = await authenticate(organizer.email);
    await request(app.getHttpServer())
      .post('/reservations/general-admission')
      .set('Cookie', organizerCookie)
      .send({ eventId: generalAdmissionEvent.id, quantity: 1 })
      .expect(403);

    await request(app.getHttpServer())
      .post('/reservations/general-admission')
      .set('Cookie', customerCookie)
      .send({ eventId: seatedEvent.id, quantity: 1 })
      .expect(409)
      .expect(({ body }) =>
        expect(body).toEqual(expect.objectContaining({ code: 'EVENT_CANNOT_BE_RESERVED' })),
      );
  });
});
