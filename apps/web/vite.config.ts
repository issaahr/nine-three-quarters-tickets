import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv } from 'vite';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const environmentDirectory = path.resolve(currentDirectory, '../..');

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, environmentDirectory, '');

  return {
    envDir: environmentDirectory,
    // Somente esta flag não secreta sem prefixo VITE é incorporada ao bundle público.
    define: {
      'import.meta.env.PUBLIC_SIGNUP_ENABLED': JSON.stringify(environment.PUBLIC_SIGNUP_ENABLED),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(currentDirectory, './src'),
      },
    },
  };
});
