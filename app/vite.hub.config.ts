import { fontNoticeText } from './src/site/fonts/notice';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

import { revision } from './scripts/revision';
import { SERVICES } from './src/site/services';

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

/**
 * /THIRD-PARTY.txt: an index of every service's third-party notices, read from the
 * registry so a new service is listed by adding it there, followed by the notices for the
 * front page's own code, from its module graph. The services' files are their own; CI
 * checks each one the index names is really in the build.
 */
function noticesIndex(): Plugin {
  return {
    name: 'hub-notices-index',
    apply: 'build',
    generateBundle(_options, bundle) {
      const packages = new Set<string>();
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue;
        for (const id of Object.keys(file.modules)) {
          const match = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id.replace(/\\/g, '/'));
          if (match) packages.add(match[1]);
        }
      }
      const rule = '-'.repeat(78);
      const own = [...packages].sort().map((name) => {
        const dir = fileURLToPath(new URL(`./node_modules/${name}/`, import.meta.url));
        const meta = JSON.parse(readFileSync(`${dir}package.json`, 'utf8'));
        const licence = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'].map((f) => `${dir}${f}`).find((f) => existsSync(f));
        return [rule, `${name} ${meta.version} — ${meta.license}`, '', licence ? readFileSync(licence, 'utf8').trim() : '(no licence file shipped)'].join('\n');
      });
      const width = Math.max(...SERVICES.map((s) => s.name.length));
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD-PARTY.txt',
        source:
          `xNotary.digital — third-party notices\n\n` +
          `Every service on this site is free software under the AGPL-3.0-or-later. Each lists\n` +
          `the third-party code it ships, with the licences, in its own file:\n\n` +
          SERVICES.map((s) => `  ${s.name.padEnd(width)}  ${s.href}${s.notices}`).join('\n') +
          `\n\nThe front page itself ships the following.\n\n${[...own, fontNoticeText(rule)].join('\n\n')}\n`,
      });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('./hub/', import.meta.url)),
  base: '/',
  plugins: [svelte(), noticesIndex()],
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
