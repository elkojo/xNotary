import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Offline and deterministic, like the rest of the site's suites.
export default defineConfig({
  plugins: [svelte({ hot: false })],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
