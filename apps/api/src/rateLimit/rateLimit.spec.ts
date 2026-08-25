import { Controller, ExecutionContext, Get, INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { seconds, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';

import { AuthController } from '../modules/auth/auth.controller';
import { JwtAuthGuard } from '../modules/auth/guards/jwtAuth.guard';
import { PublicSignupGuard } from '../modules/auth/guards/publicSignup.guard';
import { RolesGuard } from '../modules/auth/guards/roles.guard';
import { CatalogController } from '../modules/catalog/catalog.controller';
import { EventsController } from '../modules/events/events.controller';
import { GateTicketsController } from '../modules/tickets/gateTickets.controller';
import { ApplicationRateLimitGuard } from './applicationRateLimit.guard';
import { RateLimit } from './rateLimit.decorator';
import { RateLimitPolicy } from './rateLimitPolicy.enum';
import {
  generateRateLimitKey,
  trackAuthRequest,
  trackCatalogRequest,
  trackManualCheckInRequest,
} from './rateLimit.trackers';

@Controller('rate-limit-test')
class RateLimitTestController {
  @Get()
  @RateLimit(RateLimitPolicy.Auth)
  public get(): { ok: true } {
    return { ok: true };
  }
}

describe('rate limiting', () => {
  describe('contrato HTTP', () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleReference = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot([
            {
              name: RateLimitPolicy.Auth,
              ttl: seconds(60),
              limit: 2,
              getTracker: trackAuthRequest,
              generateKey: generateRateLimitKey,
            },
            {
              name: RateLimitPolicy.Catalog,
              ttl: seconds(60),
              limit: 100,
              getTracker: trackCatalogRequest,
              generateKey: generateRateLimitKey,
            },
            {
              name: RateLimitPolicy.ManualCheckIn,
              ttl: seconds(60),
              limit: 100,
              getTracker: trackManualCheckInRequest,
              generateKey: generateRateLimitKey,
            },
          ]),
        ],
        controllers: [RateLimitTestController],
        providers: [ApplicationRateLimitGuard],
      }).compile();

      app = moduleReference.createNestApplication();
      await app.init();
    });

    afterAll(async () => {
      await app.close();
    });

    it('rejeita o excesso com contrato sanitizado e Retry-After', async () => {
      await request(app.getHttpServer()).get('/rate-limit-test').expect(200);
      await request(app.getHttpServer()).get('/rate-limit-test').expect(200);

      const response = await request(app.getHttpServer()).get('/rate-limit-test').expect(429);

      expect(response.body).toEqual({
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Muitas solicitações. Aguarde antes de tentar novamente.',
      });
      expect(response.headers['retry-after-auth']).toBeDefined();
      expect(JSON.stringify(response.body)).not.toContain('tracker');
      expect(JSON.stringify(response.body)).not.toContain('limit');
    });
  });

  describe('trackers', () => {
    const context = {} as ExecutionContext;

    it('isola autenticação por IP calculado pelo framework e ignora o header bruto', async () => {
      const first = await trackAuthRequest(
        { ip: '203.0.113.10', headers: { 'x-forwarded-for': '198.51.100.99' } },
        context,
      );
      const second = await trackAuthRequest({ ip: '203.0.113.11' }, context);

      expect(first).toBe('ip:203.0.113.10');
      expect(second).toBe('ip:203.0.113.11');
    });

    it('compartilha catálogo por usuário e usa IP somente como fallback', async () => {
      const first = await trackCatalogRequest(
        { ip: '203.0.113.10', user: { id: 'organizer-1', role: 'ORGANIZER' } },
        context,
      );
      const sameUserOtherIp = await trackCatalogRequest(
        { ip: '203.0.113.11', user: { id: 'organizer-1', role: 'ORGANIZER' } },
        context,
      );
      const otherUser = await trackCatalogRequest(
        { ip: '203.0.113.10', user: { id: 'organizer-2', role: 'ORGANIZER' } },
        context,
      );
      const fallback = await trackCatalogRequest({ ip: '203.0.113.10' }, context);

      expect(first).toBe('user:organizer-1');
      expect(sameUserOtherIp).toBe(first);
      expect(otherUser).not.toBe(first);
      expect(fallback).toBe('ip:203.0.113.10');
    });

    it('combina operador e IP no check-in manual', async () => {
      const first = await trackManualCheckInRequest(
        { ip: '203.0.113.10', user: { id: 'gate-1', role: 'GATE' } },
        context,
      );
      const otherIp = await trackManualCheckInRequest(
        { ip: '203.0.113.11', user: { id: 'gate-1', role: 'GATE' } },
        context,
      );
      const otherOperator = await trackManualCheckInRequest(
        { ip: '203.0.113.10', user: { id: 'gate-2', role: 'GATE' } },
        context,
      );

      expect(first).toBe('operator:gate-1:ip:203.0.113.10');
      expect(otherIp).not.toBe(first);
      expect(otherOperator).not.toBe(first);
    });

    it('compartilha a chave entre endpoints da mesma política', () => {
      expect(generateRateLimitKey(context, 'user:organizer-1', RateLimitPolicy.Catalog)).toBe(
        'catalog:user:organizer-1',
      );
    });
  });

  describe('aplicação nas rotas', () => {
    const protectedHandlers: Array<[CallableFunction, RateLimitPolicy]> = [
      [AuthController.prototype.login, RateLimitPolicy.Auth],
      [AuthController.prototype.signup, RateLimitPolicy.Auth],
      [CatalogController.prototype.searchMovies, RateLimitPolicy.Catalog],
      [CatalogController.prototype.listPopularMovies, RateLimitPolicy.Catalog],
      [CatalogController.prototype.searchAttractions, RateLimitPolicy.Catalog],
      [CatalogController.prototype.listPopularAttractions, RateLimitPolicy.Catalog],
      [EventsController.prototype.createMovie, RateLimitPolicy.Catalog],
      [EventsController.prototype.createShow, RateLimitPolicy.Catalog],
      [GateTicketsController.prototype.checkInManualCode, RateLimitPolicy.ManualCheckIn],
    ];

    const guardOrderExpectations: Array<[CallableFunction, unknown[]]> = [
      [AuthController.prototype.login, [ApplicationRateLimitGuard]],
      [AuthController.prototype.signup, [PublicSignupGuard, ApplicationRateLimitGuard]],
      [
        CatalogController.prototype.searchMovies,
        [JwtAuthGuard, RolesGuard, ApplicationRateLimitGuard],
      ],
      [
        EventsController.prototype.createMovie,
        [JwtAuthGuard, RolesGuard, ApplicationRateLimitGuard],
      ],
      [
        GateTicketsController.prototype.checkInManualCode,
        [JwtAuthGuard, RolesGuard, ApplicationRateLimitGuard],
      ],
    ];

    it.each(protectedHandlers)('mantém a política esperada em %p', (handler, policy) => {
      expect(Reflect.getMetadata(`THROTTLER:SKIP${policy}`, handler)).toBe(false);
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toContain(ApplicationRateLimitGuard);
    });

    it.each(guardOrderExpectations)('preserva a ordem dos guards em %p', (handler, guards) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual(guards);
    });

    it('não aplica o limite externo à publicação, que não chama provider', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, EventsController.prototype.publish),
      ).not.toContain(ApplicationRateLimitGuard);
    });
  });
});
