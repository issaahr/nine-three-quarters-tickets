import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource, In, Repository } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Venue } from '../src/modules/venues/venue.entity';
import { VenueSeat } from '../src/modules/venues/venueSeat.entity';

describe('persistência de Venues', () => {
  let app: INestApplication;
  let venuesRepository: Repository<Venue>;
  let venueSeatsRepository: Repository<VenueSeat>;
  const venueIds: string[] = [];

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = testingModule.createNestApplication();
    await app.init();

    const dataSource = app.get(DataSource);
    venuesRepository = dataSource.getRepository(Venue);
    venueSeatsRepository = dataSource.getRepository(VenueSeat);
  });

  afterAll(async () => {
    if (venueIds.length > 0) {
      await venueSeatsRepository.delete({ venueId: In(venueIds) });
      await venuesRepository.delete({ id: In(venueIds) });
    }

    await app.close();
  });

  /** Cria um Venue isolado e o registra para limpeza ao final da suíte. */
  async function createVenue(name: string): Promise<Venue> {
    const venue = await venuesRepository.save({
      name,
      address: 'Rua de teste, 93',
      city: 'São Paulo',
      state: 'São Paulo',
      country: 'Brasil',
      timeZone: 'America/Sao_Paulo',
    });

    venueIds.push(venue.id);
    return venue;
  }

  it('persiste o layout físico associado ao Venue', async () => {
    const venue = await createVenue('issue2.layout');
    await venueSeatsRepository.save({
      venueId: venue.id,
      label: 'A1',
      row: 'A',
      number: 1,
      x: 0,
      y: 0,
    });

    const persistedVenue = await venuesRepository.findOneOrFail({
      where: { id: venue.id },
      relations: { seats: true },
    });

    expect(persistedVenue.seats).toHaveLength(1);
    expect(persistedVenue.seats[0]).toMatchObject({
      venueId: venue.id,
      label: 'A1',
      row: 'A',
      number: 1,
      x: 0,
      y: 0,
    });
  });

  it('rejeita labels repetidos dentro do mesmo Venue', async () => {
    const venue = await createVenue('issue2.duplicate-label');
    await venueSeatsRepository.save({
      venueId: venue.id,
      label: 'A1',
      row: 'A',
      number: 1,
      x: 0,
      y: 0,
    });

    await expect(
      venueSeatsRepository.save({
        venueId: venue.id,
        label: 'A1',
        row: 'A',
        number: 2,
        x: 1,
        y: 0,
      }),
    ).rejects.toThrow();
  });

  it('rejeita duas posições iguais dentro do mesmo Venue', async () => {
    const venue = await createVenue('issue2.duplicate-position');
    await venueSeatsRepository.save({
      venueId: venue.id,
      label: 'A1',
      row: 'A',
      number: 1,
      x: 0,
      y: 0,
    });

    await expect(
      venueSeatsRepository.save({
        venueId: venue.id,
        label: 'A2',
        row: 'A',
        number: 2,
        x: 0,
        y: 0,
      }),
    ).rejects.toThrow();
  });

  it('permite reutilizar labels e coordenadas em Venues diferentes', async () => {
    const firstVenue = await createVenue('issue2.first-independent-layout');
    const secondVenue = await createVenue('issue2.second-independent-layout');
    const sharedSeat = {
      label: 'A1',
      row: 'A',
      number: 1,
      x: 0,
      y: 0,
    };

    await expect(
      venueSeatsRepository.save([
        { ...sharedSeat, venueId: firstVenue.id },
        { ...sharedSeat, venueId: secondVenue.id },
      ]),
    ).resolves.toHaveLength(2);
  });

  it.each([
    ['número igual a zero', { number: 0, x: 0, y: 0 }],
    ['posição horizontal negativa', { number: 1, x: -1, y: 0 }],
    ['posição vertical negativa', { number: 1, x: 0, y: -1 }],
  ])('rejeita %s', async (_scenario, coordinates) => {
    const venue = await createVenue(`issue2.invalid-${venueIds.length}`);

    await expect(
      venueSeatsRepository.save({
        venueId: venue.id,
        label: 'A1',
        row: 'A',
        ...coordinates,
      }),
    ).rejects.toThrow();
  });

  it('impede remover um Venue que ainda possui layout', async () => {
    const venue = await createVenue('issue2.restrict-deletion');
    await venueSeatsRepository.save({
      venueId: venue.id,
      label: 'A1',
      row: 'A',
      number: 1,
      x: 0,
      y: 0,
    });

    await expect(venuesRepository.delete(venue.id)).rejects.toThrow();
  });
});
