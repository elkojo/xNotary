import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

/**
 * The version, read from package.json at build time.
 *
 * A deployed build could not say which one it was. Checking that a release
 * reached the site meant grepping the bundle for a sentence that had changed,
 * which works and is a poor substitute for the build simply stating it.
 */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Standalone dev/build config for xSignature.
 *
 * This exists so the module runs on its own during development. When the module
 * is dropped into xNotary it is `app/src/lib/signature/`, `app/src/views/` and
 * `app/src/signature.css` that move; nothing in this file goes with them, and
 * the parent's own vite.config.ts stays untouched.
 */
/**
 * Publishes xsignature/THIRD-PARTY.md with the build, as THIRD-PARTY.md beside index.html,
 * so the notices travel with the code they cover and the front page's index can link them.
 * It is the reviewed, hand-kept list: update it when a dependency changes.
 */
function publishNotices(): Plugin {
  return {
    name: 'xsignature-publish-notices',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD-PARTY.md',
        source: readFileSync(new URL('../THIRD-PARTY.md', import.meta.url), 'utf8'),
      });
    },
  };
}

export default defineConfig({
  // xSignature lives at /xsignature/ on xnotary.digital. BASE_PATH overrides it.
  base: process.env.BASE_PATH ?? '/xsignature/',
  // The shared bar (app/src/site/) is compiled into this app from outside its
  // root. Both must use this app's copy of Svelte: two runtimes in one page
  // do not work.
  resolve: { dedupe: ['svelte'] },
  server: { fs: { allow: [fileURLToPath(new URL('../../', import.meta.url))] } },
  define: {
    // A literal, so it is in the bundle rather than fetched from anywhere.
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [svelte(), publishNotices()],
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  ssr: {
    // Only the Node-side dev scripts take this path; the browser build never
    // does. pdf-lib's ES build imports its font metrics as JSON, which Node
    // refuses to load without an import attribute nothing here can add — so it
    // goes through Vite instead, which reads JSON without argument.
    noExternal: ['@cantoo/pdf-lib'],
  },
});
