import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getOptionsToken, seconds } from '@nestjs/throttler';
import request, { type Response as HttpResponse } from 'supertest';

import { AppModule } from '../src/app.module';
import { Application } from '../src/application';
import { applicationConfig } from '../src/config/applicationConfig';
import { AuthService } from '../src/modules/auth/auth.service';
import { AccessTokenPayload } from '../src/modules/auth/auth.types';
import { RateLimitPolicy } from '../src/rateLimit/rateLimitPolicy.enum';
import { generateRateLimitKey, trackAuthRequest } from '../src/rateLimit/rateLimit.trackers';

describe('CSRF nas operações de sessão', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let loginSpy: jest.SpyInstance;
  let customerCookie: string;
  let customerId: string;
  const credentials = {
    email: 'customer.one.demo@ntq.local',
    password: process.env.DEMO_USERS_PASSWORD,
  };

  function cookieFrom(response: HttpResponse): string {
    const header = response.headers['set-cookie'];
    const cookie = Array.isArray(header) ? header[0] : header;
    expect(cookie).toBeDefined();
    return cookie;
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    new Application().configure(app);
    await app.init();
    jwtService = app.get(JwtService);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', applicationConfig.corsOrigins[0])
      .send(credentials)
      .expect(200);
    customerCookie = cookieFrom(login).split(';', 1)[0];
    customerId = login.body.id as string;
    loginSpy = jest.spyOn(app.get(AuthService), 'login');
  });

  beforeEach(() => loginSpy.mockClear());

  afterAll(async () => {
    loginSpy.mockRestore();
    await app.close();
  });

  describe.each(['json', 'form'] as const)('corpo %s', (encoding) => {
    it.each([undefined, 'null', 'https://untrusted.example'])(
      'rejeita login de origem %s sem substituir a sessão',
      async (origin) => {
        let call = request(app.getHttpServer())
          .post('/auth/login')
          .set('Cookie', customerCookie)
          .type(encoding);
        if (origin !== undefined) call = call.set('Origin', origin);
        const response = await call
          .send({ ...credentials, email: 'customer.two.demo@ntq.local' })
          .expect(403);
        expect(response.body.code).toBe('ORIGIN_NOT_ALLOWED');
        expect(response.headers['set-cookie']).toBeUndefined();
        expect(loginSpy).not.toHaveBeenCalled();
        await request(app.getHttpServer())
          .get('/auth/session')
          .set('Cookie', customerCookie)
          .expect(200)
          .expect(({ body }) => expect(body.id).toBe(customerId));
      },
    );

    it.each([undefined, 'null', 'https://untrusted.example'])(
      'rejeita logout de origem %s sem limpar o cookie',
      async (origin) => {
        let call = request(app.getHttpServer())
          .post('/auth/logout')
          .set('Cookie', customerCookie)
          .type(encoding);
        if (origin !== undefined) call = call.set('Origin', origin);
        const response = await call.send({}).expect(403);
        expect(response.body.code).toBe('ORIGIN_NOT_ALLOWED');
        expect(response.headers['set-cookie']).toBeUndefined();
        await request(app.getHttpServer())
          .get('/auth/session')
          .set('Cookie', customerCookie)
          .expect(200);
      },
    );
  });

  it('permite login e logout entre Vercel e Render com cookie cross-site seguro', async () => {
    const webOrigin = 'https://csrf-fixture.vercel.app';
    const apiHost = 'csrf-fixture.onrender.com';
    const origins = [...applicationConfig.corsOrigins];
    const cookie = { ...applicationConfig.auth.cookie };
    // Reproduz os atributos de produção sem depender de um domínio ou certificado externo.
    applicationConfig.corsOrigins.splice(0, origins.length, webOrigin);
    applicationConfig.auth.cookie.sameSite = 'none';
    applicationConfig.auth.cookie.secure = true;
    try {
      await request(app.getHttpServer())
        .options('/auth/login')
        .set('Host', apiHost)
        .set('Origin', webOrigin)
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'content-type')
        .expect(204)
        .expect('Access-Control-Allow-Origin', webOrigin)
        .expect('Access-Control-Allow-Credentials', 'true');

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Host', apiHost)
        .set('Origin', webOrigin)
        .send(credentials)
        .expect(200)
        .expect('Access-Control-Allow-Origin', webOrigin)
        .expect('Access-Control-Allow-Credentials', 'true');
      const loginCookie = cookieFrom(login);
      expect(loginCookie).toContain('HttpOnly');
      expect(loginCookie).toContain('Secure');
      expect(loginCookie).toContain('SameSite=None');
      const token = loginCookie.split(';', 1)[0].split('=', 2)[1];
      const payload = await jwtService.verifyAsync<AccessTokenPayload>(token);
      expect(payload.sub).toBe(customerId);

      for (const route of ['login', 'logout']) {
        const rejected = await request(app.getHttpServer())
          .post(`/auth/${route}`)
          .set('Host', apiHost)
          .set('Origin', `${webOrigin}.untrusted.example`)
          .set('Cookie', loginCookie.split(';', 1)[0])
          .type('form')
          .send(credentials)
          .expect(403);
        expect(rejected.headers['set-cookie']).toBeUndefined();
      }

      const logout = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Host', apiHost)
        .set('Origin', webOrigin)
        .set('Cookie', loginCookie.split(';', 1)[0])
        .expect(204)
        .expect('Access-Control-Allow-Origin', webOrigin)
        .expect('Access-Control-Allow-Credentials', 'true');
      const clearedCookie = cookieFrom(logout);
      expect(clearedCookie).toContain('accessToken=;');
      expect(clearedCookie).toContain('HttpOnly');
      expect(clearedCookie).toContain('Secure');
      expect(clearedCookie).toContain('SameSite=None');
    } finally {
      applicationConfig.corsOrigins.splice(0, applicationConfig.corsOrigins.length, ...origins);
      Object.assign(applicationConfig.auth.cookie, cookie);
    }
  });

  it('verifica origem antes da autenticação e do consumo da quota de login', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getOptionsToken())
      .useValue([
        {
          name: RateLimitPolicy.Auth,
          ttl: seconds(60),
          limit: 2,
          getTracker: trackAuthRequest,
          generateKey: generateRateLimitKey,
        },
      ])
      .compile();
    const limited = module.createNestApplication();
    new Application().configure(limited);
    await limited.init();
    const limitedLogin = jest.spyOn(limited.get(AuthService), 'login');
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        await request(limited.getHttpServer())
          .post('/auth/login')
          .set('Origin', 'https://untrusted.example')
          .send(credentials)
          .expect(403);
      }
      expect(limitedLogin).not.toHaveBeenCalled();
      for (let attempt = 0; attempt < 2; attempt++) {
        await request(limited.getHttpServer())
          .post('/auth/login')
          .set('Origin', applicationConfig.corsOrigins[0])
          .send(credentials)
          .expect(200);
      }
      await request(limited.getHttpServer())
        .post('/auth/login')
        .set('Origin', applicationConfig.corsOrigins[0])
        .send(credentials)
        .expect(429);
      expect(limitedLogin).toHaveBeenCalledTimes(2);
    } finally {
      limitedLogin.mockRestore();
      await limited.close();
    }
  });
});
