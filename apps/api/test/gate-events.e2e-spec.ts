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
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

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

    const response = await request(app.getHttpServer())
      .get('/gate/events')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body).toEqual(
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
    expect(response.body.map(({ id }: { id: string }) => id)).not.toContain(draft.id);
    expect(response.body.map(({ id }: { id: string }) => id)).not.toContain(cancelled.id);
    expect(
      response.body.find(({ id }: { id: string }) => id === publishedPast.id),
    ).not.toHaveProperty('organizerId');
  });

  it('exige autenticação GATE para consultar Events operáveis', async () => {
    await request(app.getHttpServer()).get('/gate/events').expect(401);

    const customerCookie = await authenticate('customer.one.demo@ntq.local');
    await request(app.getHttpServer())
      .get('/gate/events')
      .set('Cookie', customerCookie)
      .expect(403);
  });
});
