import path from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(currentDirectory, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    env: {
      VITE_API_URL: 'http://api.test',
      VITE_DEMO_USERS_PASSWORD: 'demo-password',
    },
    setupFiles: ['./src/test/setup.ts'],
  },
});
