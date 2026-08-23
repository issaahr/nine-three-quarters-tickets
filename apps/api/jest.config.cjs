process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';
process.env.JWT_EXPIRES_IN_SECONDS = '900';
process.env.TICKET_HMAC_SECRET = 'test-only-ticket-secret-with-at-least-32-bytes';
process.env.RESERVATION_HOLD_DURATION_SECONDS = '600';
process.env.PAYMENT_CARD_PENDING_TIMEOUT_SECONDS = '60';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.PUBLIC_SIGNUP_ENABLED = 'true';
process.env.TRUST_PROXY_HOPS = '0';
process.env.RATE_LIMIT_AUTH_WINDOW_SECONDS = '60';
process.env.RATE_LIMIT_AUTH_MAX_REQUESTS = '100';
process.env.RATE_LIMIT_CATALOG_WINDOW_SECONDS = '60';
process.env.RATE_LIMIT_CATALOG_MAX_REQUESTS = '100';
process.env.RATE_LIMIT_CHECK_IN_WINDOW_SECONDS = '60';
process.env.RATE_LIMIT_CHECK_IN_MAX_REQUESTS = '100';
process.env.TMDB_API_READ_ACCESS_TOKEN = 'test-tmdb-token';
process.env.TMDB_LANGUAGE = 'pt-BR';
process.env.TMDB_REQUEST_TIMEOUT_MS = '5000';
process.env.TMDB_POSTER_SIZE = 'w500';
process.env.TICKETMASTER_API_KEY = 'test-ticketmaster-key';
process.env.TICKETMASTER_REQUEST_TIMEOUT_MS = '5000';

module.exports = {
  clearMocks: true,
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: {
            decorators: true,
            syntax: 'typescript',
          },
          target: 'es2022',
          transform: {
            decoratorMetadata: true,
            legacyDecorator: true,
          },
        },
        module: {
          type: 'commonjs',
        },
      },
    ],
  },
};
