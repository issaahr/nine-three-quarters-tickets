import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  let app: INestApplication;
  const dataSource = {
    query: jest.fn(),
  };

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: DataSource, useValue: dataSource }],
    }).compile();

    app = testingModule.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    dataSource.query.mockReset();
  });

  afterAll(async () => {
    await app.close();
  });

  it('retorna 200 quando a API consegue consultar o PostgreSQL', async () => {
    dataSource.query.mockResolvedValueOnce([{ '?column?': 1 }]);

    await request(app.getHttpServer()).get('/health').expect(200).expect({ ok: true });

    expect(dataSource.query).toHaveBeenCalledWith('SELECT 1');
  });

  it('retorna 503 sem detalhes internos quando o PostgreSQL está indisponível', async () => {
    dataSource.query.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED postgres://internal-user:secret@database:5432/app'),
    );

    const response = await request(app.getHttpServer()).get('/health').expect(503);

    expect(response.body).toEqual({
      statusCode: 503,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Serviço temporariamente indisponível',
    });
    expect(response.text).not.toContain('ECONNREFUSED');
    expect(response.text).not.toContain('internal-user');
  });

  it('não mantém o endpoint raiz de liveness', async () => {
    await request(app.getHttpServer()).get('/').expect(404);
  });
});
