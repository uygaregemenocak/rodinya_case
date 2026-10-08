import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // first run downloads a mongodb binary for mongodb-memory-server
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
