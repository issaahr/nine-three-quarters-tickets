import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource, In, Repository } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Application } from '../src/application';
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
    new Application().configure(app);
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

  /**
   * Cria um Venue isolado e o registra para limpeza ao final da suíte.
   *
   * @param name - Nome único que identifica o cenário.
   * @returns Venue disponível para configurar seu layout.
   */
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

  /**
   * Percorre o login real para validar a autorização do endpoint de Venues.
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

  it('disponibiliza o Venue inicial com um layout de 60 assentos e corredor central', async () => {
    const venue = await venuesRepository.findOneOrFail({
      where: { name: 'Cine Imperial · Sala A' },
      relations: { seats: true },
    });

    expect(venue).toMatchObject({
      address: 'Rua das Lanternas, 93',
      city: 'São Paulo',
      state: 'São Paulo',
      country: 'Brasil',
      timeZone: 'America/Sao_Paulo',
    });
    expect(venue.seats).toHaveLength(60);
    expect(new Set(venue.seats.map(({ row }) => row))).toEqual(
      new Set(['A', 'B', 'C', 'D', 'E', 'F']),
    );
    for (const row of ['A', 'B', 'C', 'D', 'E', 'F']) {
      expect(venue.seats.filter((seat) => seat.row === row)).toHaveLength(10);
    }
    expect(venue.seats.some(({ x }) => x === 5)).toBe(false);
    expect(venue.seats).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'A1', row: 'A', number: 1, x: 0, y: 0 }),
        expect.objectContaining({ label: 'A10', row: 'A', number: 10, x: 10, y: 0 }),
        expect.objectContaining({ label: 'F1', row: 'F', number: 1, x: 0, y: 5 }),
        expect.objectContaining({ label: 'F10', row: 'F', number: 10, x: 10, y: 5 }),
      ]),
    );
  });

  it('expõe os Venues configurados somente ao papel ORGANIZER', async () => {
    const organizerCookie = await authenticate('organizer.demo@ntq.local');
    const response = await request(app.getHttpServer())
      .get('/venues')
      .set('Cookie', organizerCookie)
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Cine Imperial · Sala A',
          city: 'São Paulo',
          timeZone: 'America/Sao_Paulo',
        }),
      ]),
    );

    const customerCookie = await authenticate('customer.one.demo@ntq.local');
    await request(app.getHttpServer()).get('/venues').set('Cookie', customerCookie).expect(403);
  });

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
