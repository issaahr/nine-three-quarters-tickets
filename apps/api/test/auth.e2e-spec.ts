import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Application } from '../src/application';
import { applicationConfig } from '../src/config/applicationConfig';
import { User } from '../src/modules/users/user.entity';
import { UserRole } from '../src/modules/users/userRole.enum';
import { AccessTokenPayload } from '../src/modules/auth/auth.types';

describe('POST /auth/login', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let usersRepository: Repository<User>;

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = testingModule.createNestApplication();
    new Application().configure(app);
    await app.init();

    jwtService = app.get(JwtService);
    usersRepository = app.get<Repository<User>>(getRepositoryToken(User));
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['organizer.demo@ntq.local', UserRole.Organizer],
    ['customer.one.demo@ntq.local', UserRole.Customer],
    ['customer.two.demo@ntq.local', UserRole.Customer],
    ['gate.demo@ntq.local', UserRole.Gate],
  ])('autentica o usuário seedado %s e envia o JWT somente no cookie', async (email, role) => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email,
        password: process.env.DEMO_USERS_PASSWORD,
      })
      .expect(200);

    expect(response.body).toEqual({
      id: expect.any(String),
      email,
      role,
    });
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.headers['cache-control']).toBe('no-store');

    const setCookie = response.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    expect(cookie).toContain('accessToken=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure');

    const token = cookie.split(';', 1)[0].split('=', 2)[1];
    const payload = await jwtService.verifyAsync<AccessTokenPayload>(token);

    expect(payload.sub).toBe(response.body.id);
    expect(payload.role).toBe(role);
    expect(payload).toHaveProperty('iat');
    expect(payload).toHaveProperty('exp');
    expect(payload).not.toHaveProperty('email');
  });

  it('omite passwordHash nas consultas comuns do repositório', async () => {
    const regularUser = await usersRepository.findOneByOrFail({
      email: 'organizer.demo@ntq.local',
    });

    expect(regularUser.passwordHash).toBeUndefined();
  });

  it('normaliza o email antes de consultar as credenciais', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: '  CUSTOMER.ONE.DEMO@NTQ.LOCAL  ',
        password: process.env.DEMO_USERS_PASSWORD,
      })
      .expect(200);

    expect(response.body.email).toBe('customer.one.demo@ntq.local');
  });

  it.each([
    ['customer.one.demo@ntq.local', 'incorrect-password'],
    ['missing@ntq.local', 'incorrect-password'],
  ])('retorna o mesmo erro para credenciais inválidas', async (email, password) => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(401);

    expect(response.body).toEqual({
      statusCode: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Credenciais inválidas',
    });
  });

  it.each([
    [{}, ['Email inválido', 'Senha inválida']],
    [{ email: 'invalid-email', password: 'password' }, ['Email inválido']],
    [{ email: 'customer.one.demo@ntq.local', password: '' }, ['Senha inválida']],
  ])('descreve os campos inválidos do payload', async (body, expectedMessages) => {
    const response = await request(app.getHttpServer()).post('/auth/login').send(body).expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
      message: expect.arrayContaining(expectedMessages),
    });
  });

  it('rejeita campos que não pertencem ao contrato de login', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'customer.one.demo@ntq.local',
        password: 'password',
        role: UserRole.Organizer,
      })
      .expect(400);

    expect(response.body.message).toContain('property role should not exist');
  });

  it('permite credenciais CORS somente para origem configurada', async () => {
    const allowedOrigin = applicationConfig.corsOrigins[0];
    const response = await request(app.getHttpServer())
      .options('/auth/login')
      .set('Origin', allowedOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(allowedOrigin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });
});
