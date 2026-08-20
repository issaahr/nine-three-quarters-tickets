import { ConfigurationError } from '../errors/configuration.error';
import { getRequiredEnvironmentVariable } from './environment';

const supportedEnvironments = ['development', 'test', 'production'] as const;
type RuntimeEnvironment = (typeof supportedEnvironments)[number];

// Restringe comportamentos dependentes do ambiente aos modos suportados pela aplicação.
function getRuntimeEnvironment(environmentVariables: NodeJS.ProcessEnv): RuntimeEnvironment {
  const environment = getRequiredEnvironmentVariable('NODE_ENV', environmentVariables);

  if (!supportedEnvironments.includes(environment as RuntimeEnvironment)) {
    throw new ConfigurationError(`Variável de ambiente NODE_ENV inválida: ${environment}`);
  }

  return environment as RuntimeEnvironment;
}

/**
 * Normaliza as origens CORS para comparação exata e rejeita URLs que incluam
 * caminho, query ou fragmento, pois esses componentes não fazem parte de uma origem.
 */
function getCorsOrigins(environmentVariables: NodeJS.ProcessEnv): string[] {
  const configuredOrigins = getRequiredEnvironmentVariable('CORS_ORIGINS', environmentVariables)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configuredOrigins.length === 0) {
    throw new ConfigurationError('Variável de ambiente CORS_ORIGINS não possui origens válidas');
  }

  const normalizedOrigins = configuredOrigins.map((origin) => {
    let url: URL;

    try {
      url = new URL(origin);
    } catch (cause) {
      throw new ConfigurationError(`Origem CORS inválida: ${origin}`, cause);
    }

    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new ConfigurationError(`Origem CORS inválida: ${origin}`);
    }

    return url.origin;
  });

  return [...new Set(normalizedOrigins)];
}

// Impede que uma chave HS256 claramente curta seja aceita por engano.
function getJwtSecret(environmentVariables: NodeJS.ProcessEnv): string {
  const secret = getRequiredEnvironmentVariable('JWT_SECRET', environmentVariables);

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new ConfigurationError('Variável de ambiente JWT_SECRET deve possuir ao menos 32 bytes');
  }

  return secret;
}

// Garante que a duração possa ser usada diretamente na assinatura e no cookie.
function getJwtExpiresInSeconds(environmentVariables: NodeJS.ProcessEnv): number {
  const expiresInSeconds = Number(
    getRequiredEnvironmentVariable('JWT_EXPIRES_IN_SECONDS', environmentVariables),
  );

  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new ConfigurationError(
      'Variável de ambiente JWT_EXPIRES_IN_SECONDS deve ser um inteiro positivo',
    );
  }

  return expiresInSeconds;
}

// Converte a porta uma única vez antes da criação da aplicação Nest.
function getPort(environmentVariables: NodeJS.ProcessEnv): number {
  const port = Number(getRequiredEnvironmentVariable('PORT', environmentVariables));

  if (!port) {
    throw new ConfigurationError('Variável de ambiente PORT não definida ou inválida');
  }

  return port;
}

/**
 * Lê e valida conjuntamente toda configuração exigida pelo servidor HTTP.
 * Configurações exclusivas do banco permanecem separadas para uso pelo CLI de migrations.
 */
export function loadApplicationConfig(environmentVariables: NodeJS.ProcessEnv) {
  const environment = getRuntimeEnvironment(environmentVariables);

  return {
    environment,
    port: getPort(environmentVariables),
    corsOrigins: getCorsOrigins(environmentVariables),
    auth: {
      jwtSecret: getJwtSecret(environmentVariables),
      jwtExpiresInSeconds: getJwtExpiresInSeconds(environmentVariables),
      cookie: {
        name: 'accessToken',
        httpOnly: true,
        path: '/',
        sameSite: environment === 'production' ? ('none' as const) : ('lax' as const),
        secure: environment === 'production',
      },
    },
  } as const;
}

export const applicationConfig = loadApplicationConfig(process.env);
