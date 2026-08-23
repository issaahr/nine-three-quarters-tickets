import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
import { User } from '../src/modules/users/user.entity';
import { UserRole } from '../src/modules/users/userRole.enum';
import { Venue } from '../src/modules/venues/venue.entity';
import { VenueSeat } from '../src/modules/venues/venueSeat.entity';

describe('publicação de Event', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let eventsRepository: Repository<Event>;
  let eventSeatsRepository: Repository<EventSeat>;
  let venueSeatsRepository: Repository<VenueSeat>;
  let venuesRepository: Repository<Venue>;
  let organizer: User;
  let seededVenue: Venue;
  let generalAdmissionVenue: Venue;
  const createdEventIds: string[] = [];
  const createdVenueIds: string[] = [];

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = testingModule.createNestApplication();
    new Application().configure(app);
    await app.init();

    const dataSource = app.get(DataSource);
    jwtService = app.get(JwtService);
    eventsRepository = dataSource.getRepository(Event);
    eventSeatsRepository = dataSource.getRepository(EventSeat);
    venueSeatsRepository = dataSource.getRepository(VenueSeat);
    venuesRepository = dataSource.getRepository(Venue);
    organizer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'organizer.demo@ntq.local' });
    seededVenue = await venuesRepository.findOneByOrFail({ name: 'Cine Imperial · Sala A' });
    generalAdmissionVenue = await venuesRepository.findOneByOrFail({ name: 'Nexus Arena' });
  });

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      await eventSeatsRepository.delete({ eventId: In(createdEventIds) });
      await eventsRepository.delete({ id: In(createdEventIds) });
    }
    if (createdVenueIds.length > 0) {
      await venuesRepository.delete({ id: In(createdVenueIds) });
    }
    await app.close();
  });

  /**
   * Autentica o organizador sem fabricar a identidade proprietária usada na publicação.
   *
   * @returns Cookie de sessão emitido pelo fluxo público de login.
   */
  async function authenticateOrganizer(): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email: organizer.email,
      password: process.env.DEMO_USERS_PASSWORD,
    });
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    return cookie.split(';', 1)[0];
  }

  /**
   * Emite uma sessão de outro organizador para verificar a fronteira de propriedade.
   *
   * @returns Cookie assinado com uma identidade que não possui o Event testado.
   */
  async function authenticateOtherOrganizer(): Promise<string> {
    const token = await jwtService.signAsync({
      sub: randomUUID(),
      role: UserRole.Organizer,
    });

    return `accessToken=${token}`;
  }

  /**
   * Persiste um DRAFT controlado pela suíte e o registra para limpeza.
   *
   * @param venueId - Venue cujo layout será materializado.
   * @returns Event pronto para o fluxo de publicação.
   */
  async function createEvent(venueId: string): Promise<Event> {
    const event = await eventsRepository.save({
      organizerId: organizer.id,
      venueId,
      title: 'Evento para publicação',
      description: null,
      imageUrl: null,
      genres: ['Drama'],
      category: EventCategory.Movie,
      admissionMode: AdmissionMode.Seated,
      status: EventStatus.Draft,
      startsAt: new Date('2035-09-01T23:30:00.000Z'),
      priceCents: 2500,
      capacity: null,
      catalogSource: CatalogSource.Tmdb,
      externalId: randomUUID(),
    });

    createdEventIds.push(event.id);
    return event;
  }

  /**
   * Persiste um show GA controlado para validar a publicação sem inventário seated.
   *
   * @returns Event GA em DRAFT registrado para limpeza.
   */
  async function createGeneralAdmissionEvent(): Promise<Event> {
    const event = await eventsRepository.save({
      organizerId: organizer.id,
      venueId: generalAdmissionVenue.id,
      title: 'Show para publicação',
      description: null,
      imageUrl: null,
      genres: ['Rock'],
      category: EventCategory.Show,
      admissionMode: AdmissionMode.GeneralAdmission,
      status: EventStatus.Draft,
      startsAt: new Date('2035-10-01T00:00:00.000Z'),
      priceCents: 15000,
      capacity: 500,
      catalogSource: CatalogSource.Ticketmaster,
      externalId: randomUUID(),
    });

    createdEventIds.push(event.id);
    return event;
  }

  it('materializa o layout uma única vez sob duas publicações concorrentes do mesmo Event', async () => {
    const cookie = await authenticateOrganizer();
    const event = await createEvent(seededVenue.id);

    const responses = await Promise.all([
      request(app.getHttpServer()).post(`/events/${event.id}/publish`).set('Cookie', cookie),
      request(app.getHttpServer()).post(`/events/${event.id}/publish`).set('Cookie', cookie),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(responses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          body: expect.objectContaining({ status: EventStatus.Published }),
        }),
      ]),
    );

    const venueSeatCount = await venueSeatsRepository.countBy({ venueId: seededVenue.id });
    const materializedSeats = await eventSeatsRepository.findBy({ eventId: event.id });
    expect(materializedSeats).toHaveLength(venueSeatCount);
    expect(materializedSeats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          holdReservationId: null,
          holdExpiresAt: null,
          soldAt: null,
        }),
      ]),
    );
    await expect(eventsRepository.findOneByOrFail({ id: event.id })).resolves.toMatchObject({
      status: EventStatus.Published,
    });
  });

  it('publica show GA de forma idempotente sem materializar EventSeat', async () => {
    const cookie = await authenticateOrganizer();
    const event = await createGeneralAdmissionEvent();

    const responses = await Promise.all([
      request(app.getHttpServer()).post(`/events/${event.id}/publish`).set('Cookie', cookie),
      request(app.getHttpServer()).post(`/events/${event.id}/publish`).set('Cookie', cookie),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([200, 200]);
    expect(responses[0].body).toMatchObject({
      status: EventStatus.Published,
      admissionMode: AdmissionMode.GeneralAdmission,
      capacity: 500,
    });
    await expect(eventSeatsRepository.countBy({ eventId: event.id })).resolves.toBe(0);
    await expect(eventsRepository.findOneByOrFail({ id: event.id })).resolves.toMatchObject({
      status: EventStatus.Published,
      capacity: 500,
    });
  });

  it('oculta Event de outro organizador durante a publicação', async () => {
    const event = await createEvent(seededVenue.id);
    const cookie = await authenticateOtherOrganizer();

    await request(app.getHttpServer())
      .post(`/events/${event.id}/publish`)
      .set('Cookie', cookie)
      .expect(404);

    await expect(eventsRepository.findOneByOrFail({ id: event.id })).resolves.toMatchObject({
      status: EventStatus.Draft,
    });
  });

  it('mantém o Event em DRAFT quando o Venue não possui assentos', async () => {
    const emptyVenue = await venuesRepository.save({
      name: `Venue vazio ${randomUUID()}`,
      address: 'Rua sem assentos, 93',
      city: 'São Paulo',
      state: 'São Paulo',
      country: 'Brasil',
      timeZone: 'America/Sao_Paulo',
      admissionMode: AdmissionMode.Seated,
    });
    createdVenueIds.push(emptyVenue.id);
    const event = await createEvent(emptyVenue.id);
    const cookie = await authenticateOrganizer();

    await request(app.getHttpServer())
      .post(`/events/${event.id}/publish`)
      .set('Cookie', cookie)
      .expect(409);

    await expect(eventsRepository.findOneByOrFail({ id: event.id })).resolves.toMatchObject({
      status: EventStatus.Draft,
    });
    await expect(eventSeatsRepository.countBy({ eventId: event.id })).resolves.toBe(0);
  });
});
