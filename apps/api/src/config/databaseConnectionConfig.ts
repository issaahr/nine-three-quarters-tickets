import { X509Certificate } from 'node:crypto';

import { ConfigurationError } from '../errors/configuration.error';
import { DatabaseConnectionConfig } from './databaseConfig.interfaces';
import { DatabaseTlsMode } from './databaseTlsMode.enum';
import { getRequiredEnvironmentVariable } from './environment';
import { NodeEnv } from './nodeEnv.enum';

const postgresProtocols = new Set(['postgres:', 'postgresql:']);
const pemCertificate = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

/**
 * Valida a conexão usada tanto pela API quanto pelo CLI de migrations.
 * A política TLS deve ser definida fora da URL, pois o driver aplica opções da URL por último.
 *
 * @param environmentVariables - Variáveis do processo ou conjunto explícito do chamador, sem substituir valores obrigatórios ausentes.
 * @returns URL e opções TLS validadas, compartilhadas pela API e pelo CLI de migrations.
 */
export function loadDatabaseConnectionConfig(
  environmentVariables: NodeJS.ProcessEnv,
): DatabaseConnectionConfig {
  const environment = getRequiredEnvironmentVariable('NODE_ENV', environmentVariables);
  if (
    !Object.values(NodeEnv).some((supportedEnvironment) => supportedEnvironment === environment)
  ) {
    throw new ConfigurationError(`NODE_ENV deve ser ${Object.values(NodeEnv).join(', ')}`);
  }

  const url = getRequiredEnvironmentVariable('DATABASE_URL', environmentVariables);
  let connectionUrl: URL;
  try {
    connectionUrl = new URL(url);
  } catch {
    // O erro do parser de URL pode incluir a credencial.
    throw new ConfigurationError('DATABASE_URL deve ser uma URL PostgreSQL válida');
  }
  if (!postgresProtocols.has(connectionUrl.protocol) || !connectionUrl.hostname) {
    throw new ConfigurationError('DATABASE_URL deve ser uma URL PostgreSQL com host');
  }
  for (const name of connectionUrl.searchParams.keys()) {
    const option = name.toLowerCase();
    if (option.startsWith('ssl') || option === 'uselibpqcompat') {
      throw new ConfigurationError(
        'Remova os parâmetros TLS de DATABASE_URL e configure DATABASE_TLS_MODE',
      );
    }
  }

  const mode = getRequiredEnvironmentVariable('DATABASE_TLS_MODE', environmentVariables);
  const ca = environmentVariables.DATABASE_TLS_CA?.trim();
  if (ca && mode !== DatabaseTlsMode.VerifyFull) {
    throw new ConfigurationError('DATABASE_TLS_CA exige DATABASE_TLS_MODE=verify-full');
  }
  switch (mode) {
    case DatabaseTlsMode.Disable:
      if (environment === NodeEnv.Production) {
        throw new ConfigurationError('DATABASE_TLS_MODE=disable não é permitido em produção');
      }
      return { url, ssl: false };
    case DatabaseTlsMode.RequireUnverified:
      return { url, ssl: { rejectUnauthorized: false } };
    case DatabaseTlsMode.VerifyFull: {
      if (!ca) return { url, ssl: { rejectUnauthorized: true } };
      const certificates = ca.match(pemCertificate);
      if (!certificates?.length || ca.replace(pemCertificate, '').trim()) {
        throw new ConfigurationError('DATABASE_TLS_CA deve conter certificados no formato PEM');
      }
      try {
        for (const certificate of certificates) new X509Certificate(certificate);
      } catch {
        throw new ConfigurationError('DATABASE_TLS_CA deve conter certificados no formato PEM');
      }
      return { url, ssl: { rejectUnauthorized: true, ca } };
    }
    default:
      throw new ConfigurationError(
        'DATABASE_TLS_MODE deve ser disable, verify-full ou require-unverified',
      );
  }
}
