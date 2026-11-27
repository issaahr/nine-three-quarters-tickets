import { ConfigurationError } from '../errors/configuration.error';
import { PaymentProvider } from '../modules/payments/paymentProvider.enum';
import { ApplicationConfig, PaymentProviderConfig } from './applicationConfig.interfaces';
import { getRequiredEnvironmentVariable } from './environment';
import { NodeEnv } from './nodeEnv.enum';

const supportedEnvironments = [NodeEnv.Development, NodeEnv.Test, NodeEnv.Production] as const;

type RuntimeEnvironment = (typeof supportedEnvironments)[number];

/**
 * Restringe comportamentos dependentes do ambiente aos modos suportados pela aplicação.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Ambiente validado entre os modos suportados.
 */
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
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Origens normalizadas e sem duplicatas para comparação exata no CORS.
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

/**
 * Impede que uma chave HS256 claramente curta seja aceita por engano.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Segredo validado com ao menos 32 bytes para assinatura da sessão.
 */
function getJwtSecret(environmentVariables: NodeJS.ProcessEnv): string {
  const secret = getRequiredEnvironmentVariable('JWT_SECRET', environmentVariables);

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new ConfigurationError('Variável de ambiente JWT_SECRET deve possuir ao menos 32 bytes');
  }

  return secret;
}

/**
 * Mantém a credencial pública do Ticket independente do segredo usado pela sessão.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Segredo validado com ao menos 32 bytes para autenticar a credencial do Ticket.
 */
function getTicketHmacSecret(environmentVariables: NodeJS.ProcessEnv): string {
  const secret = getRequiredEnvironmentVariable('TICKET_HMAC_SECRET', environmentVariables);

  if (Buffer.byteLength(secret, 'utf8') < 32) {
    throw new ConfigurationError(
      'Variável de ambiente TICKET_HMAC_SECRET deve possuir ao menos 32 bytes',
    );
  }

  return secret;
}

/**
 * Garante que a duração possa ser usada diretamente na assinatura e no cookie.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Duração positiva da sessão em segundos, usada na assinatura e no cookie.
 */
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

/**
 * Impede holds sem prazo ou longos o bastante para degradar a disponibilidade do inventário.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Duração positiva do hold em segundos, aplicada pelo backend ao prazo persistido.
 */
function getReservationHoldDurationSeconds(environmentVariables: NodeJS.ProcessEnv): number {
  const holdDurationSeconds = Number(
    getRequiredEnvironmentVariable('RESERVATION_HOLD_DURATION_SECONDS', environmentVariables),
  );

  if (!Number.isInteger(holdDurationSeconds) || holdDurationSeconds <= 0) {
    throw new ConfigurationError(
      'Variável de ambiente RESERVATION_HOLD_DURATION_SECONDS deve ser um inteiro positivo',
    );
  }

  return holdDurationSeconds;
}

/**
 * Define por quanto tempo uma tentativa CARD PENDING pode bloquear uma Reservation
 * antes de ser recuperada como falha técnica.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Prazo técnico positivo em segundos para recuperar tentativas de cartão fake órfãs.
 */
function getPaymentCardPendingTimeoutSeconds(environmentVariables: NodeJS.ProcessEnv): number {
  const pendingTimeoutSeconds = Number(
    getRequiredEnvironmentVariable('PAYMENT_CARD_PENDING_TIMEOUT_SECONDS', environmentVariables),
  );

  if (!Number.isInteger(pendingTimeoutSeconds) || pendingTimeoutSeconds <= 0) {
    throw new ConfigurationError(
      'Variável de ambiente PAYMENT_CARD_PENDING_TIMEOUT_SECONDS deve ser um inteiro positivo',
    );
  }

  return pendingTimeoutSeconds;
}

/**
 * Mantém o modo fake como padrão e valida exclusivamente credenciais de teste no modo Stripe.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Configuração fake ou Stripe com credenciais de sandbox validadas.
 */
function getPaymentProviderConfig(environmentVariables: NodeJS.ProcessEnv): PaymentProviderConfig {
  const provider = environmentVariables.PAYMENT_PROVIDER?.toUpperCase();
  if (provider === undefined || provider === PaymentProvider.Fake) {
    return { provider: PaymentProvider.Fake };
  }
  if (provider !== PaymentProvider.Stripe) {
    throw new ConfigurationError('Variável de ambiente PAYMENT_PROVIDER deve ser fake ou stripe');
  }

  const secretKey = getRequiredEnvironmentVariable(
    'PAYMENT_STRIPE_SECRET_KEY',
    environmentVariables,
  );
  if (!/^sk_test_[A-Za-z0-9_]+$/.test(secretKey)) {
    throw new ConfigurationError('PAYMENT_STRIPE_SECRET_KEY deve ser uma chave de teste da Stripe');
  }
  const webhookSecret = getRequiredEnvironmentVariable(
    'PAYMENT_STRIPE_WEBHOOK_SECRET',
    environmentVariables,
  );
  if (!/^whsec_[A-Za-z0-9_]+$/.test(webhookSecret)) {
    throw new ConfigurationError(
      'PAYMENT_STRIPE_WEBHOOK_SECRET deve ser um segredo de assinatura da Stripe',
    );
  }
  return { provider: PaymentProvider.Stripe, secretKey, webhookSecret };
}

/**
 * Converte a porta uma única vez antes da criação da aplicação Nest.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Porta HTTP validada para iniciar o servidor.
 */
function getPort(environmentVariables: NodeJS.ProcessEnv): number {
  const port = Number(getRequiredEnvironmentVariable('PORT', environmentVariables));

  if (!port) {
    throw new ConfigurationError('Variável de ambiente PORT não definida ou inválida');
  }

  return port;
}

/**
 * Aceita somente booleanos explícitos para evitar habilitar cadastro público por engano.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Indicação explícita de que o cadastro público está habilitado.
 */
function getPublicSignupEnabled(environmentVariables: NodeJS.ProcessEnv): boolean {
  const configuredValue = getRequiredEnvironmentVariable(
    'PUBLIC_SIGNUP_ENABLED',
    environmentVariables,
  );

  if (configuredValue !== 'true' && configuredValue !== 'false') {
    throw new ConfigurationError(
      'Variável de ambiente PUBLIC_SIGNUP_ENABLED deve ser true ou false',
    );
  }

  return configuredValue === 'true';
}

/**
 * Valida limites operacionais que precisam ser positivos e explicitamente configurados.
 *
 * @param name - Nome da variável cujo valor deve ser um inteiro estritamente positivo.
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Valor convertido em inteiro estritamente positivo.
 */
function getPositiveInteger(name: string, environmentVariables: NodeJS.ProcessEnv): number {
  const value = Number(getRequiredEnvironmentVariable(name, environmentVariables));

  if (!Number.isInteger(value) || value <= 0) {
    throw new ConfigurationError(`Variável de ambiente ${name} deve ser um inteiro positivo`);
  }

  return value;
}

/**
 * Limita a confiança do Express à quantidade conhecida de proxies da topologia.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Quantidade inteira não negativa de proxies confiáveis da topologia.
 */
function getTrustedProxyHops(environmentVariables: NodeJS.ProcessEnv): number {
  const trustedHops = Number(
    getRequiredEnvironmentVariable('TRUST_PROXY_HOPS', environmentVariables),
  );

  if (!Number.isInteger(trustedHops) || trustedHops < 0) {
    throw new ConfigurationError(
      'Variável de ambiente TRUST_PROXY_HOPS deve ser um inteiro maior ou igual a zero',
    );
  }

  return trustedHops;
}

/**
 * Mantém a credencial da TMDb obrigatória e exclusivamente no backend.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Token obrigatório da TMDb, destinado exclusivamente ao backend.
 */
function getTmdbAccessToken(environmentVariables: NodeJS.ProcessEnv): string {
  return getRequiredEnvironmentVariable('TMDB_API_READ_ACCESS_TOKEN', environmentVariables);
}

/**
 * Restringe o idioma ao formato regional aceito pelas consultas utilizadas na V1.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Idioma regional validado para consultas à TMDb.
 */
function getTmdbLanguage(environmentVariables: NodeJS.ProcessEnv): string {
  const language = getRequiredEnvironmentVariable('TMDB_LANGUAGE', environmentVariables);

  if (!/^[a-z]{2}-[A-Z]{2}$/.test(language)) {
    throw new ConfigurationError('Variável de ambiente TMDB_LANGUAGE inválida');
  }

  return language;
}

/**
 * Impede que uma integração externa permaneça aguardando indefinidamente.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Limite positivo de espera das chamadas à TMDb em milissegundos.
 */
function getTmdbRequestTimeoutMs(environmentVariables: NodeJS.ProcessEnv): number {
  const timeout = Number(
    getRequiredEnvironmentVariable('TMDB_REQUEST_TIMEOUT_MS', environmentVariables),
  );

  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new ConfigurationError(
      'Variável de ambiente TMDB_REQUEST_TIMEOUT_MS deve ser um inteiro positivo',
    );
  }

  return timeout;
}

/**
 * Aceita somente tamanhos de imagem reconhecíveis pela configuração da TMDb.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Tamanho de pôster validado para compor URLs de imagem da TMDb.
 */
function getTmdbPosterSize(environmentVariables: NodeJS.ProcessEnv): string {
  const posterSize = getRequiredEnvironmentVariable('TMDB_POSTER_SIZE', environmentVariables);

  if (!/^w\d+$|^original$/.test(posterSize)) {
    throw new ConfigurationError('Variável de ambiente TMDB_POSTER_SIZE inválida');
  }

  return posterSize;
}

/**
 * Mantém a chave da Ticketmaster obrigatória e exclusivamente no backend.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Chave obrigatória da Ticketmaster, destinada exclusivamente ao backend.
 */
function getTicketmasterApiKey(environmentVariables: NodeJS.ProcessEnv): string {
  return getRequiredEnvironmentVariable('TICKETMASTER_API_KEY', environmentVariables);
}

/**
 * Restringe o locale ao formato regional aceito pela Ticketmaster.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Locale regional validado para consultar a Ticketmaster.
 */
function getTicketmasterLocale(environmentVariables: NodeJS.ProcessEnv): string {
  const locale = getRequiredEnvironmentVariable('TICKETMASTER_LOCALE', environmentVariables);

  if (!/^[a-z]{2}-[A-Z]{2}$/.test(locale)) {
    throw new ConfigurationError('Variável de ambiente TICKETMASTER_LOCALE inválida');
  }

  return locale;
}

/**
 * Impede que a consulta de atrações permaneça aguardando indefinidamente.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Limite positivo de espera das chamadas à Ticketmaster em milissegundos.
 */
function getTicketmasterRequestTimeoutMs(environmentVariables: NodeJS.ProcessEnv): number {
  const timeout = Number(
    getRequiredEnvironmentVariable('TICKETMASTER_REQUEST_TIMEOUT_MS', environmentVariables),
  );

  if (!Number.isInteger(timeout) || timeout <= 0) {
    throw new ConfigurationError(
      'Variável de ambiente TICKETMASTER_REQUEST_TIMEOUT_MS deve ser um inteiro positivo',
    );
  }

  return timeout;
}

/**
 * Lê e valida conjuntamente toda configuração exigida pelo servidor HTTP.
 * Configurações exclusivas do banco permanecem separadas para uso pelo CLI de migrations.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns Configuração HTTP validada antes de iniciar a API; as opções do banco são carregadas separadamente.
 */
export function loadApplicationConfig(environmentVariables: NodeJS.ProcessEnv): ApplicationConfig {
  const environment = getRuntimeEnvironment(environmentVariables);

  return {
    environment,
    port: getPort(environmentVariables),
    corsOrigins: getCorsOrigins(environmentVariables),
    publicSignupEnabled: getPublicSignupEnabled(environmentVariables),
    proxy: {
      trustedHops: getTrustedProxyHops(environmentVariables),
    },
    rateLimit: {
      auth: {
        windowSeconds: getPositiveInteger('RATE_LIMIT_AUTH_WINDOW_SECONDS', environmentVariables),
        maxRequests: getPositiveInteger('RATE_LIMIT_AUTH_MAX_REQUESTS', environmentVariables),
      },
      catalog: {
        windowSeconds: getPositiveInteger(
          'RATE_LIMIT_CATALOG_WINDOW_SECONDS',
          environmentVariables,
        ),
        maxRequests: getPositiveInteger('RATE_LIMIT_CATALOG_MAX_REQUESTS', environmentVariables),
      },
      manualCheckIn: {
        windowSeconds: getPositiveInteger(
          'RATE_LIMIT_CHECK_IN_WINDOW_SECONDS',
          environmentVariables,
        ),
        maxRequests: getPositiveInteger('RATE_LIMIT_CHECK_IN_MAX_REQUESTS', environmentVariables),
      },
      hostedCheckout: {
        windowSeconds: getPositiveInteger(
          'RATE_LIMIT_HOSTED_CHECKOUT_WINDOW_SECONDS',
          environmentVariables,
        ),
        maxRequests: getPositiveInteger(
          'RATE_LIMIT_HOSTED_CHECKOUT_MAX_REQUESTS',
          environmentVariables,
        ),
      },
    },
    reservations: {
      holdDurationSeconds: getReservationHoldDurationSeconds(environmentVariables),
    },
    payments: {
      cardPendingTimeoutSeconds: getPaymentCardPendingTimeoutSeconds(environmentVariables),
      ...getPaymentProviderConfig(environmentVariables),
    },
    catalog: {
      tmdb: {
        accessToken: getTmdbAccessToken(environmentVariables),
        language: getTmdbLanguage(environmentVariables),
        requestTimeoutMs: getTmdbRequestTimeoutMs(environmentVariables),
        posterSize: getTmdbPosterSize(environmentVariables),
      },
      ticketmaster: {
        apiKey: getTicketmasterApiKey(environmentVariables),
        locale: getTicketmasterLocale(environmentVariables),
        requestTimeoutMs: getTicketmasterRequestTimeoutMs(environmentVariables),
      },
    },
    auth: {
      jwtSecret: getJwtSecret(environmentVariables),
      jwtExpiresInSeconds: getJwtExpiresInSeconds(environmentVariables),
      cookie: {
        name: 'accessToken',
        httpOnly: true,
        path: '/',
        sameSite: environment === NodeEnv.Production ? 'none' : 'lax',
        secure: environment === NodeEnv.Production,
      },
    },
    tickets: {
      hmacSecret: getTicketHmacSecret(environmentVariables),
    },
  };
}

export const applicationConfig = loadApplicationConfig(process.env);
