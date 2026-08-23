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
import { EventSeatStatus } from '../src/modules/events/eventSeatStatus.enum';
import { EventStatus } from '../src/modules/events/eventStatus.enum';
import { Reservation } from '../src/modules/reservations/reservation.entity';
import { User } from '../src/modules/users/user.entity';
import { Venue } from '../src/modules/venues/venue.entity';
import { VenueSeat } from '../src/modules/venues/venueSeat.entity';

describe('mapa público de assentos', () => {
  let app: INestApplication;
  let eventsRepository: Repository<Event>;
  let eventSeatsRepository: Repository<EventSeat>;
  let reservationsRepository: Repository<Reservation>;
  let venuesRepository: Repository<Venue>;
  let venueSeatsRepository: Repository<VenueSeat>;
  let organizer: User;
  let customer: User;
  let venue: Venue;
  let venueSeats: VenueSeat[];
  const createdEventIds: string[] = [];
  const createdVenueSeatIds: string[] = [];

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = testingModule.createNestApplication();
    new Application().configure(app);
    await app.init();

    const dataSource = app.get(DataSource);
    eventsRepository = dataSource.getRepository(Event);
    eventSeatsRepository = dataSource.getRepository(EventSeat);
    reservationsRepository = dataSource.getRepository(Reservation);
    venuesRepository = dataSource.getRepository(Venue);
    venueSeatsRepository = dataSource.getRepository(VenueSeat);
    organizer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'organizer.demo@ntq.local' });
    customer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'customer.one.demo@ntq.local' });
    venue = await venuesRepository.save({
      name: `Venue do mapa ${randomUUID()}`,
      address: 'Rua dos Assentos, 93',
      city: 'Fortaleza',
      state: 'CE',
      country: 'Brasil',
      timeZone: 'America/Fortaleza',
      admissionMode: AdmissionMode.Seated,
    });
    venueSeats = await venueSeatsRepository.save([
      { venueId: venue.id, label: 'B2', row: 'B', number: 2, x: 1, y: 1 },
      { venueId: venue.id, label: 'A2', row: 'A', number: 2, x: 1, y: 0 },
      { venueId: venue.id, label: 'A1', row: 'A', number: 1, x: 0, y: 0 },
      { venueId: venue.id, label: 'B1', row: 'B', number: 1, x: 0, y: 1 },
    ]);
    createdVenueSeatIds.push(...venueSeats.map(({ id }) => id));
  });

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      await eventSeatsRepository.delete({ eventId: In(createdEventIds) });
      await reservationsRepository.delete({ eventId: In(createdEventIds) });
      await eventsRepository.delete({ id: In(createdEventIds) });
    }
    if (createdVenueSeatIds.length > 0) {
      await venueSeatsRepository.delete({ id: In(createdVenueSeatIds) });
    }
    await venuesRepository.delete(venue.id);
    await app.close();
  });

  /** Persiste uma ocorrência seated publicada para isolar os estados do inventário testado. */
  async function createEvent(status = EventStatus.Published): Promise<Event> {
    const event = await eventsRepository.save({
      organizerId: organizer.id,
      venueId: venue.id,
      title: 'Mapa materializado',
      description: null,
      imageUrl: null,
      genres: ['Drama'],
      category: EventCategory.Movie,
      admissionMode: AdmissionMode.Seated,
      status,
      startsAt: new Date('2099-09-01T23:30:00.000Z'),
      priceCents: 2500,
      capacity: null,
      catalogSource: CatalogSource.Tmdb,
      externalId: randomUUID(),
    });

    createdEventIds.push(event.id);
    return event;
  }

  it('expõe posições persistidas e deriva disponibilidade pelo relógio do PostgreSQL', async () => {
    const event = await createEvent();
    const [b2, a2, a1, b1] = venueSeats;
    const [heldReservation, expiredReservation] = await reservationsRepository.save([
      {
        customerId: customer.id,
        eventId: event.id,
        expiresAt: new Date('2099-09-01T23:40:00.000Z'),
        confirmedAt: null,
        cancelledAt: null,
      },
      {
        customerId: customer.id,
        eventId: event.id,
        expiresAt: new Date('2099-09-01T23:50:00.000Z'),
        confirmedAt: null,
        cancelledAt: null,
      },
    ]);
    const [available, held, expired, sold] = await eventSeatsRepository.save([
      {
        eventId: event.id,
        venueSeatId: a1.id,
        holdReservationId: null,
        holdExpiresAt: null,
        soldAt: null,
      },
      {
        eventId: event.id,
        venueSeatId: a2.id,
        holdReservationId: heldReservation.id,
        holdExpiresAt: new Date(Date.now() + 60_000),
        soldAt: null,
      },
      {
        eventId: event.id,
        venueSeatId: b1.id,
        holdReservationId: expiredReservation.id,
        holdExpiresAt: new Date(Date.now() - 60_000),
        soldAt: null,
      },
      {
        eventId: event.id,
        venueSeatId: b2.id,
        holdReservationId: null,
        holdExpiresAt: null,
        soldAt: new Date(),
      },
    ]);

    const response = await request(app.getHttpServer())
      .get(`/events/${event.id}/seats`)
      .expect(200);

    expect(response.body).toEqual([
      {
        id: available.id,
        label: 'A1',
        row: 'A',
        number: 1,
        x: 0,
        y: 0,
        status: EventSeatStatus.Available,
      },
      {
        id: held.id,
        label: 'A2',
        row: 'A',
        number: 2,
        x: 1,
        y: 0,
        status: EventSeatStatus.Held,
      },
      {
        id: expired.id,
        label: 'B1',
        row: 'B',
        number: 1,
        x: 0,
        y: 1,
        status: EventSeatStatus.Available,
      },
      {
        id: sold.id,
        label: 'B2',
        row: 'B',
        number: 2,
        x: 1,
        y: 1,
        status: EventSeatStatus.Sold,
      },
    ]);
    expect(response.body[1]).not.toHaveProperty('holdReservationId');
    expect(response.body[1]).not.toHaveProperty('holdExpiresAt');
  });

  it('não expõe mapa para Event em DRAFT, mesmo com inventário persistido', async () => {
    const event = await createEvent(EventStatus.Draft);
    await eventSeatsRepository.save({
      eventId: event.id,
      venueSeatId: venueSeats[0].id,
      holdReservationId: null,
      holdExpiresAt: null,
      soldAt: null,
    });

    const response = await request(app.getHttpServer())
      .get(`/events/${event.id}/seats`)
      .expect(404);

    expect(response.body).toEqual(expect.objectContaining({ code: 'EVENT_NOT_FOUND' }));
  });

  it('valida o identificador do Event antes de consultar o inventário', async () => {
    await request(app.getHttpServer()).get('/events/invalid-id/seats').expect(400);
  });
});
