import { fontNoticeText } from './src/site/fonts/notice';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';

import { buildId } from './scripts/build-id';
import { bankQr, lightningQr } from './scripts/support-qr';
import { revision } from './scripts/revision';
import { siteVersion } from './scripts/site-version';
import { SERVICES } from './src/site/services';
import { RULES_SCHEMA, llmsTxt } from './src/site/situations-export';
import { rulesJson, skillFiles } from './src/site/skill-files';

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

/** The payment QR codes on /support/ (scripts/support-qr.ts). */
const LIGHTNING_QR = await lightningQr();
const BANK_QR = await bankQr();

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

/**
 * /version.json: which build the site serves now. Every service's bundle carries the same id
 * (scripts/build-id.ts), and an open page that finds a different one here offers a refresh
 * (src/site/update-check.ts). Static, same-origin, and served `no-store` (hub/public/_headers).
 */
function versionFile(): Plugin {
  return {
    name: 'hub-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: siteVersion(), build: buildId() }) + '\n',
      });
    },
  };
}

/**
 * What /situations/ decides, for agents (E1): /situations/rules.json and its schema, and /llms.txt
 * pointing to them. Generated from the same data as the page (src/site/situations-export.ts), so
 * they cannot say something the page does not. Static and same-origin: no CSP change.
 */
function agentFiles(): Plugin {
  return {
    name: 'hub-agent-files',
    apply: 'build',
    generateBundle() {
      const meta = { version: siteVersion(), build: buildId() };
      this.emitFile({ type: 'asset', fileName: 'situations/rules.json', source: rulesJson(meta) });
      this.emitFile({ type: 'asset', fileName: 'situations/rules.schema.json', source: JSON.stringify(RULES_SCHEMA, null, 1) + '\n' });
      this.emitFile({ type: 'asset', fileName: 'llms.txt', source: llmsTxt(meta) });
      for (const [path, bytes] of Object.entries(skill(meta))) this.emitFile({ type: 'asset', fileName: path.slice(1), source: bytes });
    },
  };
}

/**
 * The Agent Skill, served from the site (/ai/), with the rules of this build in its zip: see
 * src/site/skill-files.ts. Read from agent/skills/, the one copy, so the site and the repository
 * can never offer different skills.
 */
function skill(meta: { version: string; build: string }): Record<string, Uint8Array> {
  return skillFiles(new Uint8Array(readFileSync(fileURLToPath(new URL('../agent/skills/xnotary/SKILL.md', import.meta.url)))), meta);
}

/** The same two files on the dev server, so /ai/ works there too. */
function skillFilesInDev(): Plugin {
  return {
    name: 'hub-skill-files-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        const files = skill({ version: siteVersion(), build: buildId() });
        if (!(path in files)) return next();
        res.setHeader('Content-Type', path.endsWith('.zip') ? 'application/zip' : 'text/markdown; charset=utf-8');
        res.end(Buffer.from(files[path]));
      });
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('./hub/', import.meta.url)),
  base: '/',
  plugins: [svelte(), noticesIndex(), versionFile(), agentFiles(), skillFilesInDev()],
  define: {
    __APP_REVISION__: JSON.stringify(REVISION.label),
    __APP_COMMIT__: JSON.stringify(REVISION.commit),
    __BUILD_ID__: JSON.stringify(buildId()),
    __LIGHTNING_QR__: JSON.stringify(LIGHTNING_QR),
    __BANK_QR__: JSON.stringify(BANK_QR),
  },
  build: {
    // Four pages: the front page at /, /support/, /situations/ and /ai/.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./hub/index.html', import.meta.url)),
        support: fileURLToPath(new URL('./hub/support/index.html', import.meta.url)),
        situations: fileURLToPath(new URL('./hub/situations/index.html', import.meta.url)),
        ai: fileURLToPath(new URL('./hub/ai/index.html', import.meta.url)),
      },
    },
    outDir: fileURLToPath(new URL('./dist/', import.meta.url)),
    // Empties the whole site; the app builds into dist/xnotary/ afterwards.
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: true,
  },
});
