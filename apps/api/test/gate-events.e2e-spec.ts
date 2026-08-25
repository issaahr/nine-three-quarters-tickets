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
import { User } from '../src/modules/users/user.entity';
import { Venue } from '../src/modules/venues/venue.entity';

describe('Events operáveis pela portaria', () => {
  let app: INestApplication;
  let eventsRepository: Repository<Event>;
  let organizer: User;
  let venue: Venue;
  const createdEventIds: string[] = [];

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = testingModule.createNestApplication();
    new Application().configure(app);
    await app.init();

    const dataSource = app.get(DataSource);
    eventsRepository = dataSource.getRepository(Event);
    organizer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'organizer.demo@ntq.local' });
    venue = await dataSource
      .getRepository(Venue)
      .findOneByOrFail({ name: 'Cine Imperial · Sala A' });
  });

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      await eventsRepository.delete({ id: In(createdEventIds) });
    }

    await app.close();
  });

  async function authenticate(email: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email,
      password: process.env.DEMO_USERS_PASSWORD,
    });

    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    return cookie.split(';', 1)[0];
  }

  async function createEvent(title: string, status: EventStatus, startsAt: Date): Promise<Event> {
    const event = await eventsRepository.save(
      eventsRepository.create({
        organizerId: organizer.id,
        venueId: venue.id,
        title,
        description: null,
        imageUrl: null,
        genres: [],
        category: EventCategory.Movie,
        admissionMode: AdmissionMode.Seated,
        status,
        startsAt,
        priceCents: 2500,
        capacity: null,
        catalogSource: CatalogSource.Tmdb,
        externalId: randomUUID(),
      }),
    );

    createdEventIds.push(event.id);

    return event;
  }

  it('lista somente Events PUBLISHED, inclusive após o horário de início', async () => {
    const publishedPast = await createEvent(
      'Sessão ainda operável',
      EventStatus.Published,
      new Date('2020-08-01T10:30:00.000Z'),
    );

    const publishedFuture = await createEvent(
      'Sessão futura operável',
      EventStatus.Published,
      new Date('2035-08-01T10:30:00.000Z'),
    );

    const draft = await createEvent(
      'Rascunho indisponível',
      EventStatus.Draft,
      new Date('2035-08-02T10:30:00.000Z'),
    );

    const cancelled = await createEvent(
      'Cancelado indisponível',
      EventStatus.Cancelled,
      new Date('2035-08-03T10:30:00.000Z'),
    );

    const cookie = await authenticate('gate.demo@ntq.local');

    const foundEvents: Array<Record<string, unknown>> = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await request(app.getHttpServer())
        .get(`/gate/events?page=${page}`)
        .set('Cookie', cookie)
        .expect(200);

      foundEvents.push(...response.body.items);
      hasMore = response.body.hasMore;
      page += 1;
    }

    expect(foundEvents).toEqual(
      expect.arrayContaining([
        {
          id: publishedPast.id,
          title: publishedPast.title,
          venueName: venue.name,
          venueTimeZone: venue.timeZone,
          startsAt: publishedPast.startsAt.toISOString(),
        },
        {
          id: publishedFuture.id,
          title: publishedFuture.title,
          venueName: venue.name,
          venueTimeZone: venue.timeZone,
          startsAt: publishedFuture.startsAt.toISOString(),
        },
      ]),
    );

    const eventIds = foundEvents.map(({ id }: { id: string }) => id);

    expect(eventIds).not.toContain(draft.id);
    expect(eventIds).not.toContain(cancelled.id);

    expect(
      foundEvents.find(({ id }: { id: string }) => id === publishedPast.id),
    ).not.toHaveProperty('organizerId');
  });

  it('suporta paginação server-side e cálculo de hasMore na listagem da portaria', async () => {
    const batchEvents: Event[] = [];

    for (let i = 0; i < 11; i++) {
      const pad = String(i).padStart(2, '0');

      const event = await createEvent(
        `Evento Paginado ${pad}`,
        EventStatus.Published,
        new Date(`2036-01-01T${pad}:00:00.000Z`),
      );

      batchEvents.push(event);
    }

    const cookie = await authenticate('gate.demo@ntq.local');

    const page1 = await request(app.getHttpServer())
      .get('/gate/events?page=1')
      .set('Cookie', cookie)
      .expect(200);

    expect(page1.body.page).toBe(1);
    expect(page1.body.items.length).toBe(10);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await request(app.getHttpServer())
      .get('/gate/events?page=2')
      .set('Cookie', cookie)
      .expect(200);

    expect(page2.body.page).toBe(2);
    expect(page2.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('retorna os detalhes contextuais de um Event publicado por ID', async () => {
    const published = await createEvent(
      'Evento Contextual Operável',
      EventStatus.Published,
      new Date('2035-09-01T14:00:00.000Z'),
    );

    const draft = await createEvent(
      'Rascunho Não Operável',
      EventStatus.Draft,
      new Date('2035-09-02T14:00:00.000Z'),
    );

    const cookie = await authenticate('gate.demo@ntq.local');

    const response = await request(app.getHttpServer())
      .get(`/gate/events/${published.id}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body).toEqual({
      id: published.id,
      title: published.title,
      venueName: venue.name,
      venueTimeZone: venue.timeZone,
      startsAt: published.startsAt.toISOString(),
    });

    await request(app.getHttpServer())
      .get(`/gate/events/${draft.id}`)
      .set('Cookie', cookie)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/gate/events/${randomUUID()}`)
      .set('Cookie', cookie)
      .expect(404);
  });

  it('exige autenticação GATE para consultar Events operáveis', async () => {
    await request(app.getHttpServer()).get('/gate/events').expect(401);

    await request(app.getHttpServer()).get(`/gate/events/${randomUUID()}`).expect(401);

    const customerCookie = await authenticate('customer.one.demo@ntq.local');

    await request(app.getHttpServer())
      .get('/gate/events')
      .set('Cookie', customerCookie)
      .expect(403);

    await request(app.getHttpServer())
      .get(`/gate/events/${randomUUID()}`)
      .set('Cookie', customerCookie)
      .expect(403);
  });
});
