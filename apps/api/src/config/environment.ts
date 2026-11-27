import { config } from 'dotenv';
import { resolve } from 'node:path';

import { ConfigurationError } from '../errors/configuration.error';

// A estrutura relativa à raiz é a mesma em src/config e dist/config.
config({ path: resolve(__dirname, '../../../../env/api.env'), quiet: true });

export function getRequiredEnvironmentVariable(
  name: string,
  environment: NodeJS.ProcessEnv = process.env,
): string {
  const value = environment[name];

  if (!value?.trim()) {
    throw new ConfigurationError(`Variável de ambiente obrigatória não definida: ${name}`);
  }

  return value;
}
