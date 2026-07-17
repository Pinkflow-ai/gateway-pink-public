import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Data-API tests must never hit the real network in CI — they use fixtures.
    // A test that needs live calls opts in with `it.skipIf(process.env.CI)`.
  },
});
