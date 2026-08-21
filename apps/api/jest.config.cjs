process.env.NODE_ENV = 'test';
process.env.PORT = '3000';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';
process.env.JWT_EXPIRES_IN_SECONDS = '900';
process.env.CORS_ORIGINS = 'http://localhost:5173';
process.env.PUBLIC_SIGNUP_ENABLED = 'true';
process.env.TMDB_API_READ_ACCESS_TOKEN = 'test-tmdb-token';
process.env.TMDB_LANGUAGE = 'pt-BR';
process.env.TMDB_REQUEST_TIMEOUT_MS = '5000';
process.env.TMDB_POSTER_SIZE = 'w500';

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
