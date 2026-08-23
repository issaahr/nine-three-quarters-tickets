import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { Application } from '../src/application';
import { AppModule } from '../src/app.module';

describe('health check', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = testingModule.createNestApplication();
    new Application().configure(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('confirma a conectividade da API com PostgreSQL', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ ok: true });
  });

  it('não expõe mais o endpoint raiz de liveness', async () => {
    await request(app.getHttpServer()).get('/').expect(404);
  });
});
