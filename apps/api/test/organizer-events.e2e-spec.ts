import { randomUUID } from 'node:crypto';

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Application } from '../src/application';
import { CatalogSource } from '../src/modules/catalog/catalogSource.enum';
import { AdmissionMode } from '../src/modules/events/admissionMode.enum';
import { Event } from '../src/modules/events/event.entity';
import { EventCategory } from '../src/modules/events/eventCategory.enum';
import { EventStatus } from '../src/modules/events/eventStatus.enum';
import { User } from '../src/modules/users/user.entity';
import { Venue } from '../src/modules/venues/venue.entity';

describe('painel de Events do organizador', () => {
  let app: INestApplication;
  let eventsRepository: Repository<Event>;
  let organizer: User;
  let venue: Venue;
  let event: Event;

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
    event = await eventsRepository.save({
      organizerId: organizer.id,
      venueId: venue.id,
      title: 'Evento exibido no painel',
      description: 'Snapshot do painel do organizador.',
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
  });

  afterAll(async () => {
    await eventsRepository.delete(event.id);
    await app.close();
  });

  /**
   * Percorre o login real para obter uma sessão com o papel esperado pelo cenário.
   *
   * @param email - Conta de demonstração que deve acessar a rota.
   * @returns Cookie de sessão emitido pela API.
   */
  async function authenticate(email: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email,
      password: process.env.DEMO_USERS_PASSWORD,
    });
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    return cookie.split(';', 1)[0];
  }

  it('lista somente o contrato necessário ao organizador autenticado com paginação server-side', async () => {
    const cookie = await authenticate(organizer.email);
    const response = await request(app.getHttpServer())
      .get('/organizer/me/events')
      .set('Cookie', cookie)
      .expect(200);

    expect(response.body).toHaveProperty('items');
    expect(response.body).toHaveProperty('page', 1);
    expect(response.body).toHaveProperty('hasMore');

    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: event.id,
          venueId: venue.id,
          venueName: venue.name,
          venueCity: venue.city,
          venueTimeZone: venue.timeZone,
          title: event.title,
          status: EventStatus.Draft,
          startsAt: event.startsAt.toISOString(),
          priceCents: event.priceCents,
        }),
      ]),
    );
    const listedEvent = response.body.items.find(({ id }: { id: string }) => id === event.id);
    expect(listedEvent).not.toHaveProperty('organizerId');
    expect(listedEvent).not.toHaveProperty('externalId');
  });

  it('suporta paginação server-side e cálculo de hasMore no painel do organizador', async () => {
    for (let i = 0; i < 11; i++) {
      const pad = String(i).padStart(2, '0');
      await eventsRepository.save({
        organizerId: organizer.id,
        venueId: venue.id,
        title: `Evento Paginado Organizer ${pad}`,
        description: null,
        imageUrl: null,
        genres: ['Drama'],
        category: EventCategory.Movie,
        admissionMode: AdmissionMode.Seated,
        status: EventStatus.Draft,
        startsAt: new Date(`2036-02-01T${pad}:00:00.000Z`),
        priceCents: 2000,
        capacity: null,
        catalogSource: CatalogSource.Tmdb,
        externalId: `tmdb-org-${pad}-${randomUUID()}`,
      });
    }

    const cookie = await authenticate(organizer.email);

    const page1 = await request(app.getHttpServer())
      .get('/organizer/me/events?page=1')
      .set('Cookie', cookie)
      .expect(200);

    expect(page1.body.page).toBe(1);
    expect(page1.body.items.length).toBe(10);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await request(app.getHttpServer())
      .get('/organizer/me/events?page=2')
      .set('Cookie', cookie)
      .expect(200);

    expect(page2.body.page).toBe(2);
    expect(page2.body.items.length).toBeGreaterThanOrEqual(1);
  });

  it('restringe o painel ao papel ORGANIZER', async () => {
    const cookie = await authenticate('customer.one.demo@ntq.local');

    await request(app.getHttpServer())
      .get('/organizer/me/events')
      .set('Cookie', cookie)
      .expect(403);
  });
});
