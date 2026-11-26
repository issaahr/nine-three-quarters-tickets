import { Controller, Get, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { Application } from '../src/application';
import { applicationConfig } from '../src/config/applicationConfig';
import { Auth } from '../src/modules/auth/decorators/auth.decorator';
import { Roles } from '../src/modules/auth/decorators/roles.decorator';
import {
  movieCatalogProviderToken,
  showCatalogProviderToken,
} from '../src/modules/catalog/catalog.constants';
import { UserRole } from '../src/modules/users/userRole.enum';
import { PaymentCheckoutMode } from '../src/modules/payments/paymentCheckoutMode.enum';
import { PaymentMethod } from '../src/modules/payments/paymentMethod.enum';

@Controller('test/authorization')
class AuthorizationTestController {
  @Get('authenticated')
  @Auth()
  public authenticated() {
    return { authorized: true };
  }

  @Get('organizer')
  @Roles(UserRole.Organizer)
  public organizer() {
    return { authorized: true };
  }

  @Get('gate')
  @Roles(UserRole.Gate)
  public gate() {
    return { authorized: true };
  }
}

describe('Autenticação e autorização', () => {
  let app: INestApplication;
  let jwtService: JwtService;

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [AuthorizationTestController],
    })
      .overrideProvider(movieCatalogProviderToken)
      .useValue({})
      .overrideProvider(showCatalogProviderToken)
      .useValue({})
      .compile();

    app = testingModule.createNestApplication();
    new Application().configure(app);
    await app.init();

    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({
      email,
      password: process.env.DEMO_USERS_PASSWORD,
    });
    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    expect(response.status).toBe(200);
    expect(cookie).toBeDefined();

    return cookie.split(';', 1)[0];
  }

  it('divulga somente modo e métodos simulados ao CUSTOMER autenticado', async () => {
    await request(app.getHttpServer()).get('/payments/configuration').expect(401);
    const organizerCookie = await login('organizer.demo@ntq.local');
    await request(app.getHttpServer())
      .get('/payments/configuration')
      .set('Cookie', organizerCookie)
      .expect(403);
    const customerCookie = await login('customer.one.demo@ntq.local');
    const result = await request(app.getHttpServer())
      .get('/payments/configuration')
      .set('Cookie', customerCookie)
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(result.body).toEqual({
      mode: PaymentCheckoutMode.Simulated,
      methods: [PaymentMethod.Card, PaymentMethod.Pix],
    });
  });

  it('retorna 401 quando o cookie está ausente', async () => {
    const response = await request(app.getHttpServer())
      .get('/test/authorization/authenticated')
      .expect(401);

    expect(response.body).toEqual({
      statusCode: 401,
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Autenticação necessária',
    });
  });

  it.each(['invalid-token', 'eyJhbGciOiJIUzI1NiJ9.invalid.signature'])(
    'retorna 401 para token inválido',
    async (token) => {
      await request(app.getHttpServer())
        .get('/test/authorization/authenticated')
        .set('Cookie', `${applicationConfig.auth.cookie.name}=${token}`)
        .expect(401);
    },
  );

  it('retorna 401 para token expirado', async () => {
    const token = await jwtService.signAsync(
      {
        sub: '25c9813c-6909-4b7c-bd75-8bc0090a33a0',
        role: UserRole.Customer,
      },
      { expiresIn: -1 },
    );

    await request(app.getHttpServer())
      .get('/test/authorization/authenticated')
      .set('Cookie', `${applicationConfig.auth.cookie.name}=${token}`)
      .expect(401);
  });

  it('retorna 401 para role inválida mesmo em token assinado', async () => {
    const token = await jwtService.signAsync({
      sub: '25c9813c-6909-4b7c-bd75-8bc0090a33a0',
      role: 'ADMIN',
    });

    await request(app.getHttpServer())
      .get('/test/authorization/authenticated')
      .set('Cookie', `${applicationConfig.auth.cookie.name}=${token}`)
      .expect(401);
  });

  it('permite qualquer role autenticada em @Auth()', async () => {
    const cookie = await login('customer.one.demo@ntq.local');

    await request(app.getHttpServer())
      .get('/test/authorization/authenticated')
      .set('Cookie', cookie)
      .expect(200, { authorized: true });
  });

  it('permite ORGANIZER no endpoint de organizador', async () => {
    const cookie = await login('organizer.demo@ntq.local');

    await request(app.getHttpServer())
      .get('/test/authorization/organizer')
      .set('Cookie', cookie)
      .expect(200, { authorized: true });
  });

  it('retorna 403 para CUSTOMER no endpoint de organizador', async () => {
    const cookie = await login('customer.one.demo@ntq.local');
    const response = await request(app.getHttpServer())
      .get('/test/authorization/organizer')
      .set('Cookie', cookie)
      .expect(403);

    expect(response.body).toEqual({
      statusCode: 403,
      code: 'FORBIDDEN_ROLE',
      message: 'Acesso não permitido',
    });
  });

  it('retorna 403 para ORGANIZER no endpoint de portaria', async () => {
    const cookie = await login('organizer.demo@ntq.local');

    await request(app.getHttpServer())
      .get('/test/authorization/gate')
      .set('Cookie', cookie)
      .expect(403);
  });

  it('permite GATE no endpoint de portaria', async () => {
    const cookie = await login('gate.demo@ntq.local');

    await request(app.getHttpServer())
      .get('/test/authorization/gate')
      .set('Cookie', cookie)
      .expect(200, { authorized: true });
  });

  describe('rotas reais de operações da demonstração', () => {
    const eventId = '25c9813c-6909-4b7c-bd75-8bc0090a33a0';
    const endpoints = [
      { method: 'post', path: '/events/movies', role: UserRole.Organizer },
      { method: 'post', path: '/events/shows', role: UserRole.Organizer },
      { method: 'get', path: '/catalog/movies?query=Duna', role: UserRole.Organizer },
      { method: 'get', path: '/catalog/movies/popular', role: UserRole.Organizer },
      { method: 'get', path: '/catalog/attractions?query=Jazz', role: UserRole.Organizer },
      { method: 'get', path: '/catalog/attractions/popular', role: UserRole.Organizer },
      { method: 'post', path: `/gate/events/${eventId}/check-in`, role: UserRole.Gate },
      { method: 'post', path: `/gate/events/${eventId}/check-in/manual-code`, role: UserRole.Gate },
    ] as const;
    const cookies = new Map<UserRole, string>();

    beforeAll(async () => {
      cookies.set(UserRole.Customer, await login('customer.one.demo@ntq.local'));
      cookies.set(UserRole.Organizer, await login('organizer.demo@ntq.local'));
      cookies.set(UserRole.Gate, await login('gate.demo@ntq.local'));
    });

    it.each(endpoints)(
      '$method $path exige cookie válido e papel $role',
      async ({ method, path, role }) => {
        const send = () => request(app.getHttpServer())[method](path);
        const tokenClaims = { sub: eventId, role };
        const expiredToken = await jwtService.signAsync(tokenClaims, { expiresIn: -1 });
        const invalidSignatureToken = await jwtService.signAsync(tokenClaims, {
          secret: 'test-only-incorrect-signing-key',
        });
        const validCookie = cookies.get(role)!;
        const tokenFromCookie = validCookie.slice(validCookie.indexOf('=') + 1);

        const anonymousResponse = await send().expect(401);
        expect(anonymousResponse.body.code).toBe('AUTHENTICATION_REQUIRED');
        await send().set('Authorization', `Bearer ${tokenFromCookie}`).expect(401);

        for (const token of ['invalid-token', expiredToken, invalidSignatureToken]) {
          await send().set('Cookie', `${applicationConfig.auth.cookie.name}=${token}`).expect(401);
        }

        for (const [otherRole, cookie] of cookies) {
          if (otherRole !== role) {
            const forbiddenResponse = await send().set('Cookie', cookie).expect(403);
            expect(forbiddenResponse.body.code).toBe('FORBIDDEN_ROLE');
          }
        }
      },
    );
  });
});
