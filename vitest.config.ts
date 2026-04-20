import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    include: ['test/**/*.{spec,test}.ts'],
    environment: 'node',
    globals: false,
    pool: 'threads',
    reporters: ['default'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
