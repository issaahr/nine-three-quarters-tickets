import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, DeepPartial, In, Repository } from 'typeorm';

import { AppModule } from '../src/app.module';
import { CatalogSource } from '../src/modules/catalog/catalogSource.enum';
import { AdmissionMode } from '../src/modules/events/admissionMode.enum';
import { Event } from '../src/modules/events/event.entity';
import { EventCategory } from '../src/modules/events/eventCategory.enum';
import { EventStatus } from '../src/modules/events/eventStatus.enum';
import { User } from '../src/modules/users/user.entity';
import { Venue } from '../src/modules/venues/venue.entity';

describe('persistência de Events', () => {
  let app: INestApplication;
  let eventsRepository: Repository<Event>;
  let organizer: User;
  let venue: Venue;
  const eventIds: string[] = [];

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = testingModule.createNestApplication();
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
    if (eventIds.length > 0) {
      await eventsRepository.delete({ id: In(eventIds) });
    }

    await app.close();
  });

  /** Persiste um filme válido e permite sobrescrever somente os dados relevantes ao cenário. */
  async function saveEvent(overrides: DeepPartial<Event> = {}): Promise<Event> {
    const event = await eventsRepository.save(
      eventsRepository.create({
        organizerId: organizer.id,
        venueId: venue.id,
        title: 'Filme de teste',
        description: 'Snapshot local para os testes de persistência.',
        imageUrl: 'https://image.tmdb.org/test.jpg',
        category: EventCategory.Movie,
        admissionMode: AdmissionMode.Seated,
        startsAt: new Date('2026-09-01T23:30:00.000Z'),
        priceCents: 2500,
        capacity: null,
        catalogSource: CatalogSource.Tmdb,
        externalId: 'tmdb-issue2',
        genres: ['Drama', 'Ficção científica'],
        ...overrides,
      }),
    );

    eventIds.push(event.id);
    return event;
  }

  it('persiste uma ocorrência única com snapshot, relações e status DRAFT por padrão', async () => {
    const event = await saveEvent();
    const persistedEvent = await eventsRepository.findOneOrFail({
      where: { id: event.id },
      relations: { organizer: true, venue: true },
    });

    expect(persistedEvent).toMatchObject({
      title: 'Filme de teste',
      category: EventCategory.Movie,
      admissionMode: AdmissionMode.Seated,
      status: EventStatus.Draft,
      startsAt: new Date('2026-09-01T23:30:00.000Z'),
      priceCents: 2500,
      capacity: null,
      catalogSource: CatalogSource.Tmdb,
      externalId: 'tmdb-issue2',
      genres: ['Drama', 'Ficção científica'],
    });
    expect(persistedEvent.organizer.id).toBe(organizer.id);
    expect(persistedEvent.venue.id).toBe(venue.id);
  });

  it.each([
    [EventCategory.Movie, AdmissionMode.GeneralAdmission, 100],
    [EventCategory.Show, AdmissionMode.Seated, null],
  ])('rejeita a combinação %s com %s', async (category, admissionMode, capacity) => {
    await expect(saveEvent({ category, admissionMode, capacity })).rejects.toThrow();
  });

  it.each([
    ['capacidade em Event SEATED', { admissionMode: AdmissionMode.Seated, capacity: 60 }],
    [
      'capacidade ausente em GENERAL_ADMISSION',
      {
        category: EventCategory.Show,
        admissionMode: AdmissionMode.GeneralAdmission,
        capacity: null,
      },
    ],
    [
      'capacidade igual a zero em GENERAL_ADMISSION',
      {
        category: EventCategory.Show,
        admissionMode: AdmissionMode.GeneralAdmission,
        capacity: 0,
      },
    ],
  ])('rejeita %s', async (_scenario, values) => {
    await expect(saveEvent(values)).rejects.toThrow();
  });

  it('rejeita preço negativo', async () => {
    await expect(saveEvent({ priceCents: -1 })).rejects.toThrow();
  });

  it('permite ocorrências diferentes para o mesmo conteúdo externo', async () => {
    const firstEvent = await saveEvent();
    const secondEvent = await saveEvent({ startsAt: new Date('2026-09-02T23:30:00.000Z') });

    expect(firstEvent.id).not.toBe(secondEvent.id);
    await expect(
      eventsRepository.countBy({
        catalogSource: CatalogSource.Tmdb,
        externalId: 'tmdb-issue2',
      }),
    ).resolves.toBeGreaterThanOrEqual(2);
  });

  it.each([
    ['organizador', { organizerId: randomUUID() }],
    ['Venue', { venueId: randomUUID() }],
  ])('rejeita referência inexistente para %s', async (_relation, values) => {
    await expect(saveEvent(values)).rejects.toThrow();
  });
});
