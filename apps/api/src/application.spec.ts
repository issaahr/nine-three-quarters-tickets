import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { configureHttpApplication } from './httpApplication';
import { CatalogUnavailableError } from './modules/catalog/errors/catalogUnavailable.error';

@Controller('test')
class TestController {
  @Get('catalog-error')
  public catalogError(): never {
    throw new CatalogUnavailableError(
      new Error('Ticketmaster apikey=provider-secret; Retry-After=60; body=provider-secret-body'),
    );
  }
}

describe('Application HTTP hardening', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      controllers: [TestController],
    }).compile();

    app = testingModule.createNestApplication();
    configureHttpApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('aplica headers HTTP de segurança sem habilitar CSP', async () => {
    const response = await request(app.getHttpServer()).get('/test/catalog-error').expect(502);

    expect(response.headers).toMatchObject({
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'SAMEORIGIN',
      'x-permitted-cross-domain-policies': 'none',
    });
    expect(response.headers).not.toHaveProperty('content-security-policy');
  });

  it('mantém o Swagger acessível com o Helmet', async () => {
    const response = await request(app.getHttpServer()).get('/docs').expect(200);

    expect(response.text).toContain('Swagger UI');
    expect(response.headers).not.toHaveProperty('content-security-policy');
  });

  it('não expõe detalhes externos no erro HTTP normalizado', async () => {
    const response = await request(app.getHttpServer()).get('/test/catalog-error').expect(502);

    expect(response.body).toEqual({
      statusCode: 502,
      code: 'CATALOG_UNAVAILABLE',
      message: 'Catálogo externo indisponível',
    });
    expect(response.text).not.toContain('Ticketmaster');
    expect(response.text).not.toContain('provider-secret');
    expect(response.text).not.toContain('Retry-After');
  });
});
