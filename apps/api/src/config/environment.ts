import { config } from 'dotenv';
import { resolve } from 'node:path';

import { ConfigurationError } from '../errors/configuration.error';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

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
