import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

/** The version, read from package.json at build time, so a deployed build can say which it is. */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

export default defineConfig({
  // xConvert lives at /xconvert/ on xnotary.digital. BASE_PATH overrides it.
  base: process.env.BASE_PATH ?? '/xconvert/',
  // The shared bar (app/src/site/) is compiled into this app from outside its
  // root. Both must use this app's copy of Svelte: two runtimes in one page
  // do not work.
  resolve: { dedupe: ['svelte'] },
  server: { fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] } },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [svelte()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
