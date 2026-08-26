import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['test/**/*.{spec,test}.ts'],
    environment: 'node',
    globals: false,
    pool: 'threads',
    reporters: ['default'],
    env: {
      // Keep storage tests away from the tracked production-like dataset.
      RAGE_STORAGE_DIR: './tmp/vitest-rage',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
});
