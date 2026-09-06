import { build as esbuildBundle } from 'esbuild';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

// `base` is set from BASE_PATH so the same source builds for GitHub Pages
// (/<repo>/) and for a bare static host (/). See .github/workflows/deploy.yml.
const base = process.env.BASE_PATH ?? '/';

/**
 * The exact revision this bundle was built from, stamped into it.
 *
 * AGPL §13: whoever interacts with a hosted xNotary must be offered the source
 * of *that* version — a link to the project is not the same thing, and a
 * running service is precisely the case the clause exists for. So the app shows
 * what it was built from and links that commit. `--dirty` matters: a build made
 * from uncommitted changes corresponds to no public source at all, and should
 * say so rather than point at a commit it does not match.
 */
function revision(): { readonly label: string; readonly commit: string } {
  const git = (args: string) => execSync(`git ${args}`, { encoding: 'utf8' }).trim();
  try {
    return { label: git('describe --tags --always --dirty'), commit: git('rev-parse HEAD') };
  } catch {
    // A tarball or a checkout without git. Say nothing rather than guess.
    return { label: 'unknown', commit: '' };
  }
}

const REVISION = revision();

/**
 * The one copyleft dependency in the shipped bundle: LGPL-3.0-or-later.
 * Everything else that reaches the browser is MIT or BSD.
 *
 * Serving this app *is* conveying it — the bundle is copied to every visitor's
 * machine — so LGPL §4 applies here exactly as it would to a downloadable
 * binary. It is therefore NOT bundled into the app's own chunks. It is built
 * on its own, unminified and without tree-shaking, emitted at a stable path,
 * and imported by URL, so anyone can drop in their own build of the library
 * and have this app run against it. That is §4(d)(0) — a shared-library
 * mechanism — expressed in ES modules. See docs/relinking.md.
 *
 * Do not "optimize" this back into the bundle.
 */
const LINKED_LGPL_PKG = '@vitrified/typescript-opentimestamps';

/** Stable, unhashed on purpose: relinking means replacing this exact file. */
const LINKED_LGPL_FILE = 'vendor/opentimestamps.js';

const packageDir = (name: string) =>
  fileURLToPath(new URL(`./node_modules/${name}/`, import.meta.url));

const LICENSE_FILENAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'COPYING'];

interface PackageNotice {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly text: string;
  readonly note?: string;
}

function readPackageNotice(name: string, note?: string): PackageNotice | null {
  const dir = packageDir(name);
  if (!existsSync(`${dir}package.json`)) return null;

  const meta = JSON.parse(readFileSync(`${dir}package.json`, 'utf8'));
  const file = LICENSE_FILENAMES.map((f) => `${dir}${f}`).find((f) => existsSync(f));
  return {
    name,
    version: meta.version ?? 'unknown',
    license: meta.license ?? 'see text below',
    text: file ? readFileSync(file, 'utf8').trim() : '(no license file shipped in the package)',
    note,
  };
}

/**
 * Build the LGPL library as its own ES module and ship it alongside the app.
 *
 * `treeShaking: false` is deliberate: a tree-shaken library is a derived subset
 * of it, which is a worse thing to hand someone who wants to replace it. Same
 * reason for leaving it unminified — the file a user is invited to substitute
 * should be one they can read.
 */
function linkedLibrary(): Plugin {
  return {
    name: 'xnotary-linked-library',
    apply: 'build',
    async generateBundle() {
      const dir = packageDir(LINKED_LGPL_PKG);
      const meta = JSON.parse(readFileSync(`${dir}package.json`, 'utf8'));

      const result = await esbuildBundle({
        entryPoints: [`${dir}dist/esm/index.js`],
        outfile: 'opentimestamps.js',
        bundle: true,
        format: 'esm',
        target: 'es2022',
        minify: false,
        treeShaking: false,
        sourcemap: true,
        sourcesContent: true,
        write: false,
        logLevel: 'silent',
      });

      for (const out of result.outputFiles) {
        const suffix = out.path.endsWith('.map') ? '.map' : '';
        this.emitFile({
          type: 'asset',
          fileName: LINKED_LGPL_FILE + suffix,
          source: out.text,
        });
      }

      const licenseFile = LICENSE_FILENAMES.map((f) => `${dir}${f}`).find((f) => existsSync(f));
      if (licenseFile) {
        this.emitFile({
          type: 'asset',
          fileName: 'vendor/opentimestamps.LICENSE.txt',
          source: readFileSync(licenseFile, 'utf8'),
        });
      }

      this.emitFile({
        type: 'asset',
        fileName: 'vendor/README.md',
        source: relinkingNote(meta.version ?? 'unknown', meta.repository ?? ''),
      });
    },
  };
}

function relinkingNote(version: string, repository: string): string {
  const repo =
    typeof repository === 'string'
      ? repository.replace(/^github:/, 'https://github.com/')
      : (repository?.url ?? '');

  return `# Relinking the OpenTimestamps library

\`opentimestamps.js\` in this directory is a build of **${LINKED_LGPL_PKG} ${version}**, which is
licensed under the **LGPL-3.0-or-later**. Its full license text is in
\`opentimestamps.LICENSE.txt\`, and its source is published at ${repo || 'its npm package'} and in
the npm tarball for \`${LINKED_LGPL_PKG}@${version}\`. The build here is that package's own
published ES module with its (MIT-licensed) \`@noble/hashes\` imports inlined; it is neither
minified nor tree-shaken, and its source map carries the input it was built from.

xNotary links it dynamically rather than bundling it, so you can replace it with a modified
version of the library:

1. Build your modified library as a single ES module exporting at least the names xNotary uses:
   \`submit\`, \`upgrade\`, \`verify\`, \`verifiers\`, \`read\`, \`write\`, \`info\`.
2. Replace \`${LINKED_LGPL_FILE}\` in the deployed site with your build, keeping the file name.
3. Reload. Nothing else needs rebuilding — the app imports this path by URL.

If the app is installed as a PWA, clear its cache first (or bump the service worker) so the old
copy is not served from \`caches\`.

The rest of xNotary is a separate work licensed under AGPL-3.0-or-later; see the repository.
`;
}

/**
 * Emit THIRD-PARTY.txt listing every package that actually reached the bundle,
 * with its license text. Generated from the module graph rather than from
 * package.json, so it cannot drift from what is really shipped.
 */
function thirdPartyNotices(): Plugin {
  return {
    name: 'xnotary-third-party-notices',
    apply: 'build',
    generateBundle(_options, bundle) {
      const names = new Set<string>();
      for (const file of Object.values(bundle)) {
        if (file.type !== 'chunk') continue;
        for (const id of Object.keys(file.modules)) {
          const match = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(id.replace(/\\/g, '/'));
          if (match) names.add(match[1]);
        }
      }

      const notices: PackageNotice[] = [];

      // Externalized, so it never appears in the module graph above — but it is
      // the one whose notice matters most.
      const linked = readPackageNotice(
        LINKED_LGPL_PKG,
        `Linked dynamically, not bundled: shipped as ${LINKED_LGPL_FILE} and replaceable. ` +
          `See vendor/README.md.`,
      );
      if (linked) notices.push(linked);

      for (const name of [...names].sort()) {
        const notice = readPackageNotice(name);
        if (notice) notices.push(notice);
      }

      const ofl = fileURLToPath(new URL('./src/lib/fonts/OFL.txt', import.meta.url));
      if (existsSync(ofl)) {
        notices.push({
          name: 'Liberation Sans / Liberation Mono',
          version: 'subset, see src/lib/fonts/README.md',
          license: 'OFL-1.1',
          text: readFileSync(ofl, 'utf8').trim(),
          note: 'Subset and embedded in the certificate PDFs this app generates.',
        });
      }

      const rule = '-'.repeat(78);
      const body = notices
        .map((n) =>
          [
            rule,
            `${n.name} ${n.version} — ${n.license}`,
            ...(n.note ? ['', n.note] : []),
            '',
            n.text,
          ].join('\n'),
        )
        .join('\n\n');

      this.emitFile({
        type: 'asset',
        fileName: 'THIRD-PARTY.txt',
        source:
          `xNotary — third-party notices\n\n` +
          `xNotary itself is licensed AGPL-3.0-or-later. This file lists the third-party code\n` +
          `that is part of what your browser downloaded, and is generated at build time from\n` +
          `the modules actually present in the bundle.\n\n${body}\n`,
      });
    },
  };
}

/**
 * Emit an offline-first service worker with the built asset list baked in.
 *
 * Hand-rolled rather than workbox: the whole app is a handful of files, the
 * caching policy matters (network requests to calendars and block explorers
 * must NEVER be served from cache — a stale "confirmed" would be a lie), and
 * this keeps the dependency surface of a security-sensitive app small enough
 * to read in one sitting.
 */
function serviceWorker(): Plugin {
  return {
    name: 'xnotary-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle)
        .filter((f) => /\.(js|css|html|svg|png|woff2?)$/.test(f))
        .map((f) => base + f);
      const precache = [base, `${base}manifest.webmanifest`, ...assets];

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: swSource(precache),
      });
    },
  };
}

function swSource(precache: string[]): string {
  return `/* Generated by vite.config.ts — do not edit. */
const CACHE = 'xnotary-${Date.now().toString(36)}';
const PRECACHE = ${JSON.stringify(precache, null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Only ever serve this origin's own shell from cache. Calendar submissions
  // and block-explorer lookups must always hit the network: a cached response
  // could make a pending timestamp look confirmed.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).catch(() =>
        request.mode === 'navigate' ? caches.match(${JSON.stringify(precache[0])}) : Promise.reject(),
      );
    }),
  );
});
`;
}

/** Write the web app manifest, so `base` stays the single source of truth. */
function webManifest(): Plugin {
  return {
    name: 'xnotary-manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.webmanifest',
        source: JSON.stringify(
          {
            name: 'xNotary',
            short_name: 'xNotary',
            description:
              'Self-custodial notarization: hash a file locally, timestamp it on Bitcoin, ' +
              'attest the electronic signatures made over it elsewhere.',
            theme_color: '#07130f',
            background_color: '#07130f',
            display: 'standalone',
            start_url: base,
            scope: base,
            icons: [
              { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
              { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
              {
                src: `${base}icon-512.png`,
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable',
              },
            ],
          },
          null,
          2,
        ),
      });
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    svelte(),
    webManifest(),
    linkedLibrary(),
    thirdPartyNotices(),
    // Last, so the emitted vendor and notice files are already in the bundle
    // and get precached with everything else.
    serviceWorker(),
  ],
  define: {
    __APP_REVISION__: JSON.stringify(REVISION.label),
    __APP_COMMIT__: JSON.stringify(REVISION.commit),
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      // Kept out of the bundle on purpose — see LINKED_LGPL_PKG above.
      external: (id) => id === LINKED_LGPL_PKG,
      output: {
        paths: { [LINKED_LGPL_PKG]: base + LINKED_LGPL_FILE },
        // pdf-lib and the certificate builder are only needed once the user
        // acts, so keep them out of the initial payload.
        manualChunks(id) {
          if (id.includes('pdf-lib') || id.includes('@pdf-lib')) return 'pdf';
          if (id.includes('pkijs') || id.includes('asn1js')) return 'pki';
          if (id.includes('@noble')) return 'hashes';
        },
      },
    },
  },
});
