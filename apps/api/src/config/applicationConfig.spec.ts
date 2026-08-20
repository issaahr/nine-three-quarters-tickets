import { ConfigurationError } from '../errors/configuration.error';
import { loadApplicationConfig } from './applicationConfig';

describe('loadApplicationConfig', () => {
  const validEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
    PORT: '3000',
    CORS_ORIGINS: 'http://localhost:5173, http://localhost:5173',
    JWT_SECRET: 'test-only-jwt-secret-with-at-least-32-bytes',
    JWT_EXPIRES_IN_SECONDS: '900',
  };

  it('normaliza valores e configura o cookie para ambiente local', () => {
    const config = loadApplicationConfig(validEnvironment);

    expect(config).toMatchObject({
      environment: 'development',
      port: 3000,
      corsOrigins: ['http://localhost:5173'],
      auth: {
        jwtExpiresInSeconds: 900,
        cookie: {
          httpOnly: true,
          sameSite: 'lax',
          secure: false,
        },
      },
    });
  });

  it('configura cookie cross-site seguro em produção', () => {
    const config = loadApplicationConfig({
      ...validEnvironment,
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.com',
    });

    expect(config.auth.cookie).toMatchObject({
      sameSite: 'none',
      secure: true,
    });
  });

  it.each([
    ['PORT', undefined],
    ['NODE_ENV', 'staging'],
    ['CORS_ORIGINS', 'https://app.example.com/path'],
    ['JWT_SECRET', 'short-secret'],
    ['JWT_EXPIRES_IN_SECONDS', '0'],
  ])('rejeita configuração inválida em %s', (name, value) => {
    expect(() =>
      loadApplicationConfig({
        ...validEnvironment,
        [name]: value,
      }),
    ).toThrow(ConfigurationError);
  });
});
