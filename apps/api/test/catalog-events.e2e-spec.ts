import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, In, Repository } from 'typeorm';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { Application } from '../src/application';
import { catalogProviderToken } from '../src/modules/catalog/catalog.constants';
import { CatalogItem } from '../src/modules/catalog/catalogItem';
import { CatalogProvider } from '../src/modules/catalog/catalogProvider';
import { CatalogSource } from '../src/modules/catalog/catalogSource.enum';
import { AdmissionMode } from '../src/modules/events/admissionMode.enum';
import { Event } from '../src/modules/events/event.entity';
import { EventCategory } from '../src/modules/events/eventCategory.enum';
import { EventStatus } from '../src/modules/events/eventStatus.enum';
import { Venue } from '../src/modules/venues/venue.entity';

describe('catálogo e criação de Event de filme', () => {
  let app: INestApplication;
  let eventsRepository: Repository<Event>;
  let venue: Venue;
  const createdEventIds: string[] = [];

  const movie = {
    source: CatalogSource.Tmdb,
    externalId: '693134',
    category: EventCategory.Movie,
    title: 'Duna: Parte Dois',
    description: 'Snapshot confiável retornado pelo provider.',
    imageUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
    genres: ['Ficção científica', 'Aventura'],
  } satisfies CatalogItem;

  const catalogProvider: CatalogProvider = {
    source: CatalogSource.Tmdb,
    search: jest.fn(),
    listPopular: jest.fn(),
    findByExternalId: jest.fn(),
  };

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(catalogProviderToken)
      .useValue(catalogProvider)
      .compile();

    app = testingModule.createNestApplication();
    new Application().configure(app);
    await app.init();

    const dataSource = app.get(DataSource);
    eventsRepository = dataSource.getRepository(Event);
    venue = await dataSource
      .getRepository(Venue)
      .findOneByOrFail({ name: 'Cine Imperial · Sala A' });
  });

  beforeEach(() => {
    jest
      .mocked(catalogProvider.search)
      .mockReset()
      .mockResolvedValue({ items: [movie], page: 1, hasMore: false });
    jest
      .mocked(catalogProvider.listPopular)
      .mockReset()
      .mockResolvedValue({ items: [movie], page: 1, hasMore: false });
    jest.mocked(catalogProvider.findByExternalId).mockReset().mockResolvedValue(movie);
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

  it('permite somente ao ORGANIZER pesquisar filmes normalizados', async () => {
    const organizerCookie = await authenticate('organizer.demo@ntq.local');

    await request(app.getHttpServer())
      .get('/catalog/movies')
      .query({ query: '  Duna  ' })
      .set('Cookie', organizerCookie)
      .expect(200)
      .expect({ items: [movie], page: 1, hasMore: false });

    expect(catalogProvider.search).toHaveBeenCalledWith('Duna', 1);

    await request(app.getHttpServer())
      .get('/catalog/movies/popular')
      .query({ page: 1 })
      .set('Cookie', organizerCookie)
      .expect(200)
      .expect({ items: [movie], page: 1, hasMore: false });
    expect(catalogProvider.listPopular).toHaveBeenCalledWith(1);

    const customerCookie = await authenticate('customer.one.demo@ntq.local');
    await request(app.getHttpServer())
      .get('/catalog/movies')
      .query({ query: 'Duna' })
      .set('Cookie', customerCookie)
      .expect(403);
  });

  it('valida a consulta antes de chamar o catálogo', async () => {
    const cookie = await authenticate('organizer.demo@ntq.local');
    const response = await request(app.getHttpServer())
      .get('/catalog/movies')
      .query({ query: ' ', page: 0 })
      .set('Cookie', cookie)
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([
        'Busca deve possuir ao menos 2 caracteres',
        'Página deve ser maior ou igual a 1',
      ]),
    );
    expect(catalogProvider.search).not.toHaveBeenCalled();
  });

  it('cria DRAFT com snapshot local e interpreta o horário pelo timezone do Venue', async () => {
    const cookie = await authenticate('organizer.demo@ntq.local');
    const response = await request(app.getHttpServer())
      .post('/events/movies')
      .set('Cookie', cookie)
      .send({
        externalId: movie.externalId,
        venueId: venue.id,
        startsAtLocal: '2030-09-01T20:30',
        priceCents: 2500,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      venueId: venue.id,
      title: movie.title,
      description: movie.description,
      imageUrl: movie.imageUrl,
      genres: movie.genres,
      category: EventCategory.Movie,
      admissionMode: AdmissionMode.Seated,
      status: EventStatus.Draft,
      startsAt: '2030-09-01T23:30:00.000Z',
      priceCents: 2500,
    });
    createdEventIds.push(response.body.id);

    const persistedEvent = await eventsRepository.findOneByOrFail({ id: response.body.id });
    expect(persistedEvent).toMatchObject({
      organizerId: expect.any(String),
      catalogSource: CatalogSource.Tmdb,
      externalId: movie.externalId,
      capacity: null,
      startsAt: new Date('2030-09-01T23:30:00.000Z'),
    });
  });

  it('rejeita valores autoritativos enviados pelo frontend', async () => {
    const cookie = await authenticate('organizer.demo@ntq.local');
    const response = await request(app.getHttpServer())
      .post('/events/movies')
      .set('Cookie', cookie)
      .send({
        externalId: movie.externalId,
        venueId: venue.id,
        startsAtLocal: '2030-09-01T20:30',
        priceCents: 2500,
        title: 'Título fabricado',
        status: EventStatus.Published,
        organizerId: venue.id,
      })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([
        'property title should not exist',
        'property status should not exist',
        'property organizerId should not exist',
      ]),
    );
    expect(catalogProvider.findByExternalId).not.toHaveBeenCalled();
  });

  it('não cria Event quando Venue ou filme não existem', async () => {
    const cookie = await authenticate('organizer.demo@ntq.local');

    await request(app.getHttpServer())
      .post('/events/movies')
      .set('Cookie', cookie)
      .send({
        externalId: movie.externalId,
        venueId: 'dbfcba12-f6d5-4d91-ab2b-39cdd1c31fc1',
        startsAtLocal: '2030-09-01T20:30',
        priceCents: 2500,
      })
      .expect(404);

    jest.mocked(catalogProvider.findByExternalId).mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .post('/events/movies')
      .set('Cookie', cookie)
      .send({
        externalId: '999999',
        venueId: venue.id,
        startsAtLocal: '2030-09-01T20:30',
        priceCents: 2500,
      })
      .expect(404);

    await expect(eventsRepository.countBy({ externalId: '999999' })).resolves.toBe(0);
  });

  it('restringe criação a ORGANIZER e rejeita horário passado', async () => {
    const customerCookie = await authenticate('customer.one.demo@ntq.local');
    const payload = {
      externalId: movie.externalId,
      venueId: venue.id,
      startsAtLocal: '2030-09-01T20:30',
      priceCents: 2500,
    };

    await request(app.getHttpServer())
      .post('/events/movies')
      .set('Cookie', customerCookie)
      .send(payload)
      .expect(403);

    const organizerCookie = await authenticate('organizer.demo@ntq.local');
    await request(app.getHttpServer())
      .post('/events/movies')
      .set('Cookie', organizerCookie)
      .send({ ...payload, startsAtLocal: '2020-01-01T20:30' })
      .expect(400);
  });
});
