import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Like, Repository } from 'typeorm';

import { AppModule } from '../src/app.module';
import { Application } from '../src/application';
import { applicationConfig } from '../src/config/applicationConfig';
import { User } from '../src/modules/users/user.entity';
import { UserRole } from '../src/modules/users/userRole.enum';
import { AccessTokenPayload } from '../src/modules/auth/auth.types';
import { publicSignupEnabledToken } from '../src/modules/auth/auth.constants';

describe('autenticação', () => {
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
    await usersRepository.delete({ email: Like('issue20.%@ntq.local') });
    await app.close();
  });

  it('cadastra exclusivamente CUSTOMER, normaliza o email e armazena somente o hash', async () => {
    const email = 'issue20.customer@ntq.local';
    const password = 'valid-password';
    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: `  ${email.toUpperCase()}  `, password })
      .expect(201);

    expect(response.body).toEqual({
      id: expect.any(String),
      email,
      role: UserRole.Customer,
    });
    expect(response.body).not.toHaveProperty('passwordHash');

    const persistedUser = await usersRepository.findOne({
      where: { email },
      select: { id: true, email: true, passwordHash: true, role: true },
    });

    expect(persistedUser).not.toBeNull();
    expect(persistedUser?.role).toBe(UserRole.Customer);
    expect(persistedUser?.passwordHash).not.toBe(password);
  });

  it('rejeita dados inválidos e valores autoritativos enviados pelo cliente', async () => {
    const invalidPayloads = [
      { body: {}, message: ['Email inválido', 'Senha inválida'] },
      {
        body: { email: 'invalid-email', password: 'short' },
        message: ['Email inválido', 'Senha deve possuir ao menos 8 caracteres'],
      },
      {
        body: { email: 'issue20.long-password@ntq.local', password: 'a'.repeat(73) },
        message: ['Senha deve possuir no máximo 72 bytes'],
      },
      {
        body: {
          email: 'issue20.role@ntq.local',
          password: 'valid-password',
          role: UserRole.Organizer,
        },
        message: ['property role should not exist'],
      },
    ];

    for (const payload of invalidPayloads) {
      const response = await request(app.getHttpServer())
        .post('/auth/signup')
        .send(payload.body)
        .expect(400);

      expect(response.body.message).toEqual(expect.arrayContaining(payload.message));
    }
  });

  it('usa bytes UTF-8 no limite imposto ao bcrypt', async () => {
    await request(app.getHttpServer())
      .post('/auth/signup')
      .send({ email: 'issue20.unicode@ntq.local', password: '🚀'.repeat(19) })
      .expect(400)
      .expect(({ body }) => {
        expect(body.message).toContain('Senha deve possuir no máximo 72 bytes');
      });
  });

  it('rejeita email duplicado sem depender de uma leitura anterior', async () => {
    const credentials = {
      email: 'issue20.duplicate@ntq.local',
      password: 'valid-password',
    };

    await request(app.getHttpServer()).post('/auth/signup').send(credentials).expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/signup')
      .send(credentials)
      .expect(409);

    expect(response.body).toEqual({
      statusCode: 409,
      code: 'EMAIL_ALREADY_REGISTERED',
      message: 'Email já cadastrado',
    });
  });

  it('mantém a unicidade sob duas tentativas concorrentes', async () => {
    const credentials = {
      email: 'issue20.concurrent@ntq.local',
      password: 'valid-password',
    };

    const responses = await Promise.all([
      request(app.getHttpServer()).post('/auth/signup').send(credentials),
      request(app.getHttpServer()).post('/auth/signup').send(credentials),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 409]);
    await expect(usersRepository.countBy({ email: credentials.email })).resolves.toBe(1);
  });

  it('retorna cadastro indisponível sem criar usuário quando a flag está desabilitada', async () => {
    const testingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(publicSignupEnabledToken)
      .useValue(false)
      .compile();
    const disabledApp = testingModule.createNestApplication();
    new Application().configure(disabledApp);
    await disabledApp.init();

    try {
      const email = 'issue20.disabled@ntq.local';
      const response = await request(disabledApp.getHttpServer())
        .post('/auth/signup')
        .send({ email, password: 'valid-password' })
        .expect(404);

      expect(response.body).toEqual({
        statusCode: 404,
        code: 'PUBLIC_SIGNUP_UNAVAILABLE',
        message: 'Cadastro público indisponível',
      });
      await expect(usersRepository.countBy({ email })).resolves.toBe(0);
    } finally {
      await disabledApp.close();
    }
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

  it('restaura a identidade da sessão sem expor o token ou o email', async () => {
    const agent = request.agent(app.getHttpServer());
    const loginResponse = await agent.post('/auth/login').send({
      email: 'customer.one.demo@ntq.local',
      password: process.env.DEMO_USERS_PASSWORD,
    });

    const response = await agent.get('/auth/session').expect(200);

    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body).toEqual({
      id: loginResponse.body.id,
      role: UserRole.Customer,
    });
    expect(response.body).not.toHaveProperty('email');
    expect(response.body).not.toHaveProperty('accessToken');
  });

  it('remove o cookie no logout e invalida a sessão do navegador', async () => {
    const agent = request.agent(app.getHttpServer());

    await agent
      .post('/auth/login')
      .send({
        email: 'customer.one.demo@ntq.local',
        password: process.env.DEMO_USERS_PASSWORD,
      })
      .expect(200);

    const logoutResponse = await agent.post('/auth/logout').expect(204);
    const setCookie = logoutResponse.headers['set-cookie'];
    const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;

    expect(logoutResponse.headers['cache-control']).toBe('no-store');
    expect(cookie).toContain('accessToken=;');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Lax');

    await agent.get('/auth/session').expect(204);
  });

  it('representa cookie ausente ou inválido como sessão anônima', async () => {
    await request(app.getHttpServer()).get('/auth/session').expect(204);
    await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', 'accessToken=invalid-token')
      .expect(204);
  });

  it('mantém logout idempotente sem sessão válida', async () => {
    await request(app.getHttpServer()).post('/auth/logout').expect(204);
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
