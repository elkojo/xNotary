import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Default suite: offline, deterministic. Network spikes live in vitest.spike.config.ts.
export default defineConfig({
  plugins: [svelte({ hot: false })],
  test: {
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    environment: 'node',
    // The PAdES spike is fully offline, so it doubles as the regression
    // suite for src/lib/pades.ts. The OTS spike hits live calendars and is
    // excluded — run it with `npm run spike:ots`.
    include: ['src/**/*.test.ts', 'src/spikes/pades.spike.test.ts'],
    exclude: ['src/spikes/ots.spike.test.ts'],
  },
});
