import { rootCertificates } from 'node:tls';

import { loadDatabaseConnectionConfig } from './databaseConnectionConfig';
import { DatabaseTlsMode } from './databaseTlsMode.enum';
import { NodeEnv } from './nodeEnv.enum';

describe('configuração da conexão PostgreSQL', () => {
  const url = 'postgresql://fixture:fixture@db.example.test:5432/tickets';
  const production = {
    DATABASE_URL: url,
    NODE_ENV: NodeEnv.Production,
    DATABASE_TLS_MODE: DatabaseTlsMode.VerifyFull,
  };

  it('valida o servidor com o conjunto de CAs padrão quando nenhuma CA é fornecida', () => {
    expect(loadDatabaseConnectionConfig(production)).toEqual({
      url,
      ssl: { rejectUnauthorized: true },
    });
  });

  it('aceita uma cadeia PEM fornecida com a verificação completa', () => {
    const ca = rootCertificates.slice(0, 2).join('\n');
    expect(loadDatabaseConnectionConfig({ ...production, DATABASE_TLS_CA: ca })).toEqual({
      url,
      ssl: { rejectUnauthorized: true, ca },
    });
  });

  it.each(['texto inválido', '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----'])(
    'rejeita uma CA inválida antes de acessar o banco (%s)',
    (badCa) => {
      expect(() => loadDatabaseConnectionConfig({ ...production, DATABASE_TLS_CA: badCa })).toThrow(
        'DATABASE_TLS_CA',
      );
    },
  );

  it('mantém compatibilidade com TLS sem validar o servidor somente por escolha explícita', () => {
    const legacy = { ...production, DATABASE_TLS_MODE: DatabaseTlsMode.RequireUnverified };
    expect(loadDatabaseConnectionConfig(legacy)).toEqual({
      url,
      ssl: { rejectUnauthorized: false },
    });
    expect(() =>
      loadDatabaseConnectionConfig({ ...legacy, DATABASE_TLS_CA: rootCertificates[0] }),
    ).toThrow('DATABASE_TLS_CA exige');
  });

  describe.each(Object.values(DatabaseTlsMode))('NODE_ENV com TLS %s', (mode) => {
    it.each([undefined, '', '   ', 'prod', 'unexpected'])(
      'rejeita ambiente ausente ou inválido (%s) antes de conectar',
      (environment) => {
        expect(() =>
          loadDatabaseConnectionConfig({
            ...production,
            DATABASE_TLS_MODE: mode,
            NODE_ENV: environment,
          }),
        ).toThrow('NODE_ENV');
      },
    );
  });

  it('rejeita conexão sem TLS em produção', () => {
    const local = { ...production, DATABASE_TLS_MODE: DatabaseTlsMode.Disable };
    expect(() => loadDatabaseConnectionConfig(local)).toThrow('não é permitido em produção');
  });

  it.each([NodeEnv.Development, NodeEnv.Test])(
    'permite conexão sem TLS em %s sem exigir configuração HTTP',
    (environment) => {
      expect(
        loadDatabaseConnectionConfig({
          DATABASE_URL: url,
          DATABASE_TLS_MODE: DatabaseTlsMode.Disable,
          NODE_ENV: environment,
        }),
      ).toEqual({ url, ssl: false });
    },
  );

  it.each([undefined, 'unexpected'])('exige modo explícito (%s)', (mode) => {
    expect(() => loadDatabaseConnectionConfig({ ...production, DATABASE_TLS_MODE: mode })).toThrow(
      'DATABASE_TLS_MODE',
    );
  });

  it.each(['sslmode=require', 'ssl=false', 'sslcert=file', 'sslkey=file', 'sslrootcert=file'])(
    'impede que a URL sobrescreva a política TLS com %s',
    (query) => {
      expect(() =>
        loadDatabaseConnectionConfig({ ...production, DATABASE_URL: `${url}?${query}` }),
      ).toThrow('Remova os parâmetros TLS de DATABASE_URL');
    },
  );

  it('rejeita URL inválida sem reproduzir a credencial na mensagem', () => {
    expect(() =>
      loadDatabaseConnectionConfig({ ...production, DATABASE_URL: 'broken fixture credential' }),
    ).toThrow('DATABASE_URL deve ser uma URL PostgreSQL válida');
  });
});
