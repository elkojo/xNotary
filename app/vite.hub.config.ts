import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

import { revision } from './scripts/revision';

/**
 * The xNotary.digital front page, served at `/`.
 *
 * Built first, into the root of dist/; `vite build` (vite.config.ts) then puts
 * xNotary into dist/xnotary/. hub/public/ carries what belongs to the whole
 * site rather than to one app: `_headers` (the CSP, per path), `_redirects`,
 * and the `/sw.js` that retires the worker xNotary used to register here.
 *
 * It shares app.css and the bar (src/site/) with xNotary, and the version: the
 * two are released together from one tag.
 */
const REVISION = revision();

export default defineConfig({
  root: fileURLToPath(new URL('./hub/', import.meta.url)),
  base: '/',
  plugins: [svelte()],
  define: {
    __APP_REVISION__: JSON.stringify(REVISION.label),
    __APP_COMMIT__: JSON.stringify(REVISION.commit),
  },
  build: {
    outDir: fileURLToPath(new URL('./dist/', import.meta.url)),
    // Empties the whole site; the app builds into dist/xnotary/ afterwards.
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
});
