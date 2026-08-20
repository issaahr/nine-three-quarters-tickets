import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../../.env'), quiet: true });

export function getRequiredEnvironmentVariable(name: string): string {
  const value = process.env[name];

  if (!value?.trim()) {
    throw new Error(`Variável de ambiente obrigatória não definida: ${name}`);
  }

  return value;
}
