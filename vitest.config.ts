import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Node-environment unit tests for the pure finance/title logic. Uses the same
// '@' alias as the app so tests import exactly what the app runs.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
