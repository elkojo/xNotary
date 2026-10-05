import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

import { revision } from '../../app/scripts/revision';

/** The version, read from package.json at build time, so a deployed build can say which it is. */
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
/** The commit this build came from: the AGPL's source offer points at exactly this. */
const REVISION = revision();

const LICENCE_FILES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENSE-MIT', 'LICENSE-APACHE', 'COPYING'];

/**
 * THIRD-PARTY.txt: every npm package that reached the page or the worker, with its licence,
 * from the module graph rather than from package.json — plus the converters and fonts,
 * which are not JavaScript and are pointed to where their full notices are served.
 *
 * The worker is a separate Rollup build, so the same collector runs in both, and the page's
 * build — which finishes last — writes the file.
 */
function thirdPartyNotices(): { page: Plugin; worker: Plugin } {
  const packages = new Set<string>();
  const collect = (ids: Iterable<string>) => {
    for (const id of ids) {
      const match = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id.replace(/\\/g, '/'));
      if (match) packages.add(match[1]);
    }
  };
  const worker: Plugin = {
    name: 'xconvert-third-party-worker',
    apply: 'build',
    generateBundle(_o, bundle) {
      for (const file of Object.values(bundle)) if (file.type === 'chunk') collect(Object.keys(file.modules));
    },
  };
  const page: Plugin = {
    name: 'xconvert-third-party',
    apply: 'build',
    generateBundle(_o, bundle) {
      for (const file of Object.values(bundle)) if (file.type === 'chunk') collect(Object.keys(file.modules));
      const rule = '-'.repeat(78);
      const js = [...packages].sort().map((name) => {
        const dir = fileURLToPath(new URL(`./node_modules/${name}/`, import.meta.url));
        const meta = JSON.parse(readFileSync(`${dir}package.json`, 'utf8'));
        const texts = LICENCE_FILES.filter((f) => existsSync(`${dir}${f}`)).map((f) => readFileSync(`${dir}${f}`, 'utf8').trim());
        return [rule, `${name} ${meta.version} — ${meta.license}`, '', texts.join('\n\n') || '(no licence file shipped in the package)'].join('\n');
      });
      this.emitFile({
        type: 'asset',
        fileName: 'THIRD-PARTY.txt',
        source: `xConvert — third-party notices

xConvert itself is licensed AGPL-3.0-or-later; its source is at
https://github.com/elkojo/xNotary (this build: ${REVISION.commit || 'not from a commit'}).
This file lists the third-party code your browser downloads with it.

${rule}
pandoc 3.12 — GPL-2.0-or-later (used under GPL-3.0 terms)

vendor/pandoc.wasm.gz is pandoc's official WebAssembly release, unmodified.
Source: https://github.com/jgm/pandoc/tree/3.12
        https://hackage.haskell.org/package/pandoc-3.12
Licence and copyright: vendor/licences/pandoc-COPYING.md, vendor/licences/pandoc-COPYRIGHT.txt
Its JavaScript loader is adapted from pandoc-wasm (MIT): licences/pandoc-wasm-loader-MIT.txt

${rule}
typst-pdf — our Typst wrapper, AGPL-3.0-or-later, over Typst 0.15.1 (Apache-2.0)

vendor/typst-pdf.wasm.gz is built from xconvert/typst-pdf in the repository above.
The 280 crates compiled into it, each with its licence:
vendor/licences/typst-pdf-THIRD-PARTY.txt

${rule}
Fonts — Libertinus Serif (OFL-1.1), DejaVu Sans Mono (Bitstream Vera licence),
New Computer Modern Math (GUST Font License), from typst-assets v0.15.0

vendor/fonts/; their licences: vendor/licences/fonts-NOTICE.txt
They are embedded, subset, in the PDFs xConvert writes.

${js.join('\n\n')}
`,
      });
    },
  };
  return { page, worker };
}

const notices = thirdPartyNotices();

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
    __APP_REVISION__: JSON.stringify(REVISION.label),
    __APP_COMMIT__: JSON.stringify(REVISION.commit),
  },
  plugins: [svelte(), notices.page],
  // The converter runs as a module worker (src/worker.ts).
  worker: { format: 'es', plugins: () => [notices.worker] },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
