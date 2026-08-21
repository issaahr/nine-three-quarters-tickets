import { ConfigurationError } from '../errors/configuration.error';
import { loadApplicationConfig } from './applicationConfig';

describe('loadApplicationConfig', () => {
  const validEnvironment: NodeJS.ProcessEnv = {
    NODE_ENV: 'development',
    PORT: '3000',
    CORS_ORIGINS: 'http://localhost:5173, http://localhost:5173',
    JWT_SECRET: 'test-only-jwt-secret-with-at-least-32-bytes',
    JWT_EXPIRES_IN_SECONDS: '900',
    PUBLIC_SIGNUP_ENABLED: 'true',
    TMDB_API_READ_ACCESS_TOKEN: 'test-tmdb-token',
    TMDB_LANGUAGE: 'pt-BR',
    TMDB_REQUEST_TIMEOUT_MS: '5000',
    TMDB_POSTER_SIZE: 'w500',
  };

  it('normaliza valores e configura o cookie para ambiente local', () => {
    const config = loadApplicationConfig(validEnvironment);

    expect(config).toMatchObject({
      environment: 'development',
      port: 3000,
      corsOrigins: ['http://localhost:5173'],
      publicSignupEnabled: true,
      catalog: {
        tmdb: {
          language: 'pt-BR',
          requestTimeoutMs: 5000,
          posterSize: 'w500',
        },
      },
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

  it('desabilita o cadastro público somente com o valor false explícito', () => {
    const config = loadApplicationConfig({
      ...validEnvironment,
      PUBLIC_SIGNUP_ENABLED: 'false',
    });

    expect(config.publicSignupEnabled).toBe(false);
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
    ['PUBLIC_SIGNUP_ENABLED', 'enabled'],
    ['PUBLIC_SIGNUP_ENABLED', undefined],
    ['TMDB_API_READ_ACCESS_TOKEN', undefined],
    ['TMDB_LANGUAGE', 'portuguese'],
    ['TMDB_REQUEST_TIMEOUT_MS', '0'],
    ['TMDB_POSTER_SIZE', 'large'],
  ])('rejeita configuração inválida em %s', (name, value) => {
    expect(() =>
      loadApplicationConfig({
        ...validEnvironment,
        [name]: value,
      }),
    ).toThrow(ConfigurationError);
  });
});
