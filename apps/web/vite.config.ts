import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const webEnvironmentPath = path.resolve(currentDirectory, '../../env/web.env');

/**
 * Lê apenas o arquivo público local. CI, deploy e Compose podem fornecer variáveis sem o arquivo.
 *
 * @returns Variáveis do arquivo público local, ou objeto vazio quando o arquivo não existe.
 */
function readWebEnvironment(): NodeJS.Dict<string> {
  try {
    return parseEnv(readFileSync(webEnvironmentPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return {};
  }
}

const environment = readWebEnvironment();

export default defineConfig({
  envDir: false,
  envPrefix: [],
  // As duas opções públicas podem ser sobrescritas pelo ambiente do build ou do processo.
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify(
      process.env.VITE_API_URL ?? environment.VITE_API_URL,
    ),
    'import.meta.env.PUBLIC_SIGNUP_ENABLED': JSON.stringify(
      process.env.PUBLIC_SIGNUP_ENABLED ?? environment.PUBLIC_SIGNUP_ENABLED,
    ),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(currentDirectory, './src'),
    },
  },
});
