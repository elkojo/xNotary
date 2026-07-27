import { defineConfig } from 'vitest/config';

// M0 risk spikes. These hit live OpenTimestamps calendars and block explorers,
// so they are excluded from the default suite and from CI.
export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    environment: 'node',
    include: ['src/spikes/**/*.spike.test.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
