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

describe('descoberta pública de Events', () => {
  let app: INestApplication;
  let eventsRepository: Repository<Event>;
  let venuesRepository: Repository<Venue>;
  let organizer: User;
  let venue: Venue;
  let accentedVenue: Venue;
  const createdEventIds: string[] = [];
  const suiteMarker = randomUUID();
  const paginationMarker = randomUUID();

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = testingModule.createNestApplication();
    new Application().configure(app);
    await app.init();

    const dataSource = app.get(DataSource);
    eventsRepository = dataSource.getRepository(Event);
    venuesRepository = dataSource.getRepository(Venue);
    organizer = await dataSource
      .getRepository(User)
      .findOneByOrFail({ email: 'organizer.demo@ntq.local' });
    venue = await venuesRepository.save({
      name: `Cinema Descoberta ${randomUUID()}`,
      address: 'Rua Pública, 93',
      city: 'Cidade Descoberta',
      state: 'CE',
      country: 'Brasil',
      timeZone: 'Pacific/Kiritimati',
      admissionMode: AdmissionMode.Seated,
    });
    accentedVenue = await venuesRepository.save({
      name: `Cinema São Paulo ${randomUUID()}`,
      address: 'Rua Acentuada, 93',
      city: 'São Paulo',
      state: 'SP',
      country: 'Brasil',
      timeZone: 'America/Sao_Paulo',
      admissionMode: AdmissionMode.Seated,
    });
  });

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      await eventsRepository.delete(createdEventIds);
    }
    await venuesRepository.delete(venue.id);
    await venuesRepository.delete(accentedVenue.id);
    await app.close();
  });

  /**
   * Persiste uma ocorrência controlada pela suíte e registra sua limpeza.
   *
   * @param overrides - Campos específicos do cenário.
   * @returns Event persistido com defaults válidos da V1.
   */
  async function createEvent(overrides: Partial<Event>): Promise<Event> {
    const event = await eventsRepository.save({
      organizerId: organizer.id,
      venueId: venue.id,
      title: `Descoberta Áurea ${suiteMarker}`,
      description: `Conteúdo persistido localmente para descoberta ${suiteMarker}.`,
      imageUrl: 'https://image.example/discovery.jpg',
      genres: ['Drama', 'Aventura'],
      category: EventCategory.Movie,
      admissionMode: AdmissionMode.Seated,
      status: EventStatus.Published,
      startsAt: new Date('2099-06-01T10:30:00.000Z'),
      priceCents: 2590,
      capacity: null,
      catalogSource: CatalogSource.Tmdb,
      externalId: randomUUID(),
      ...overrides,
    });

    createdEventIds.push(event.id);
    return event;
  }

  it('expõe somente Events publicados e futuros sem exigir autenticação', async () => {
    const published = await createEvent({});
    await createEvent({ status: EventStatus.Draft });
    await createEvent({ status: EventStatus.Cancelled });
    await createEvent({ startsAt: new Date('2020-06-01T10:30:00.000Z') });

    const response = await request(app.getHttpServer())
      .get('/events')
      .query({ query: suiteMarker })
      .expect(200);

    expect(response.body).toEqual({
      items: [
        expect.objectContaining({
          id: published.id,
          title: published.title,
          venueName: venue.name,
          venueCity: venue.city,
          venueTimeZone: venue.timeZone,
          startsAt: published.startsAt.toISOString(),
          priceCents: published.priceCents,
        }),
      ],
      page: 1,
      hasMore: false,
    });
    expect(response.body.items[0]).not.toHaveProperty('organizerId');
    expect(response.body.items[0]).not.toHaveProperty('externalId');
    expect(response.body.items[0]).not.toHaveProperty('status');
  });

  it('combina categoria, gênero, cidade e período no calendário local do Venue', async () => {
    const event = await createEvent({ title: 'Filtro Canônico' });

    const response = await request(app.getHttpServer())
      .get('/events')
      .query({
        query: 'filtro',
        category: EventCategory.Movie,
        genre: 'drama',
        city: 'cidade descoberta',
        dateFrom: '2099-06-02',
        dateTo: '2099-06-02',
      })
      .expect(200);

    expect(response.body.items.map(({ id }: { id: string }) => id)).toContain(event.id);
  });

  it('inclui Event encerrado quando o calendário é selecionado explicitamente', async () => {
    const pastEvent = await createEvent({
      title: 'Histórico por data',
      startsAt: new Date('2020-06-01T10:30:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .get('/events')
      .query({ dateFrom: '2020-06-02', dateTo: '2020-06-02' })
      .expect(200);

    expect(response.body.items.map(({ id }: { id: string }) => id)).toContain(pastEvent.id);
  });

  it('encontra cidade independente de acentos', async () => {
    const event = await createEvent({
      title: 'Cidade Acentuada',
      venueId: accentedVenue.id,
    });

    const response = await request(app.getHttpServer())
      .get('/events')
      .query({ city: 'sao paulo' })
      .expect(200);

    expect(response.body.items.map(({ id }: { id: string }) => id)).toContain(event.id);
  });

  it('fornece páginas estáveis com hasMore para carregamento infinito', async () => {
    const paginatedEvents = await Promise.all(
      Array.from({ length: 13 }, (_, index) =>
        createEvent({
          title: `Lote Infinito ${String(index + 1).padStart(2, '0')}`,
          description: `Marcador exclusivo de paginação infinita ${paginationMarker}.`,
          startsAt: new Date(Date.UTC(2099, 6, index + 1, 20, 0)),
        }),
      ),
    );

    const firstPage = await request(app.getHttpServer())
      .get('/events')
      .query({ query: paginationMarker, page: 1 })
      .expect(200);
    const secondPage = await request(app.getHttpServer())
      .get('/events')
      .query({ query: paginationMarker, page: 2 })
      .expect(200);

    expect(firstPage.body.items).toHaveLength(12);
    expect(firstPage.body.hasMore).toBe(true);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.hasMore).toBe(false);
    expect([
      ...firstPage.body.items.map(({ id }: { id: string }) => id),
      ...secondPage.body.items.map(({ id }: { id: string }) => id),
    ]).toEqual(paginatedEvents.map(({ id }) => id));
  });

  it.each([
    [EventStatus.Published, new Date('2099-08-01T10:30:00.000Z'), false],
    [EventStatus.Published, new Date('2020-08-01T10:30:00.000Z'), true],
    [EventStatus.Cancelled, new Date('2099-08-01T10:30:00.000Z'), false],
  ])('lê uma ocorrência %s preservando seu estado temporal', async (status, startsAt, isPast) => {
    const event = await createEvent({ status, startsAt, title: `Detalhe ${status} ${isPast}` });

    const response = await request(app.getHttpServer()).get(`/events/${event.id}`).expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        id: event.id,
        status,
        isPast,
        venueTimeZone: venue.timeZone,
        priceCents: event.priceCents,
      }),
    );
    expect(response.body).not.toHaveProperty('externalId');
    expect(response.body).not.toHaveProperty('organizerId');
  });

  it('mantém DRAFT indisponível na leitura pública', async () => {
    const draft = await createEvent({ status: EventStatus.Draft });

    const response = await request(app.getHttpServer()).get(`/events/${draft.id}`).expect(404);

    expect(response.body).toEqual(expect.objectContaining({ code: 'EVENT_NOT_FOUND' }));
  });

  it.each([
    [{ category: 'INVALID' }, 'Categoria inválida'],
    [{ dateFrom: '2099-02-31' }, 'Data inicial deve representar uma data válida'],
    [{ dateFrom: '01/06/2099' }, 'Data inicial deve usar o formato YYYY-MM-DD'],
    [{ page: 0 }, 'Página deve ser maior ou igual a 1'],
  ])('rejeita filtros sem contrato: %o', async (query, expectedMessage) => {
    const response = await request(app.getHttpServer()).get('/events').query(query).expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining(expectedMessage)]),
    );
  });

  it('rejeita período invertido com erro de domínio explícito', async () => {
    const response = await request(app.getHttpServer())
      .get('/events')
      .query({ dateFrom: '2099-06-03', dateTo: '2099-06-02' })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({ code: 'INVALID_EVENT_DISCOVERY_PERIOD' }),
    );
  });
});
