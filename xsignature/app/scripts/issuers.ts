/**
 * Refresh the issuer directory in public/issuers/ from the EU's trusted lists.
 *
 *   npm run issuers:refresh
 *
 * Runs on the build machine, never in the browser — the lists are served without CORS and the
 * certificates they point at often over plain http, which is why the app cannot fetch either
 * itself (src/lib/document/certificate/read/directory.ts says why the directory exists at all).
 *
 * Reads the List of Trusted Lists, then each national list it points to, and keeps the
 * certificate of every qualified certificate-issuing service (CA/QC), current and historical:
 * a signature made years ago still needs the issuer it was made under. The lists' own XML
 * signatures are not checked, and need not be — the app takes a certificate from the directory
 * only when its key verifies the signer's certificate, so a wrong entry is harmless.
 *
 * A national list that cannot be read this time keeps the entries it had last time, and is
 * named in index.json, so a refresh on a bad day never silently shrinks the directory.
 * Commit what it writes; the build serves public/ as it is.
 */
import { webcrypto } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CryptoEngine, setEngine } from 'pkijs';

import { buildDirectory, type DirectoryShard } from '../src/lib/document/certificate/read/directory';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
setEngine('node', new CryptoEngine({ name: 'node', crypto: globalThis.crypto }));

const LOTL = 'https://ec.europa.eu/tools/lotl/eu-lotl.xml';
const CA_QC = 'http://uri.etsi.org/TrstSvc/Svctype/CA/QC';
const OUT = fileURLToPath(new URL('../public/issuers/', import.meta.url));
/** Some lists sit behind bot checks that turn away a client with no name. */
const HEADERS = { 'user-agent': 'xSignature issuer-directory refresh (+https://xnotary.digital)' };

const tag = (name: string) => new RegExp(`<(?:\\w+:)?${name}>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'g');
const all = (xml: string, name: string) => [...xml.matchAll(tag(name))].map((m) => m[1].trim());
const first = (xml: string, name: string) => all(xml, name)[0] ?? '';

async function get(url: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(60_000) });
      const text = await response.text();
      if (response.ok && text.includes('TrustServiceStatusList')) return text;
    } catch {
      // Try again.
    }
  }
  return null;
}

const lotl = await get(LOTL);
if (!lotl) throw new Error(`Could not read ${LOTL}`);

const pointers = all(lotl, 'OtherTSLPointer')
  .map((p) => ({ territory: first(p, 'SchemeTerritory'), url: first(p, 'TSLLocation'), mime: first(p, 'MimeType') }))
  .filter((p) => p.mime.includes('xml') && p.territory && p.territory !== 'EU' && p.territory !== 'UK');

const certificates: { der: Uint8Array; tl: string }[] = [];
const lists: Record<string, number> = {};
const missing: string[] = [];

for (const { territory, url } of pointers) {
  const xml = await get(url);
  if (!xml) {
    missing.push(territory);
    console.warn(`${territory}: could not read ${url} — keeping its previous entries`);
    continue;
  }
  let count = 0;
  for (const service of all(xml, 'TSPService')) {
    if (!service.includes(CA_QC)) continue;
    for (const base64 of all(service, 'X509Certificate')) {
      certificates.push({ der: Uint8Array.from(Buffer.from(base64.replace(/\s/g, ''), 'base64')), tl: territory });
      count += 1;
    }
  }
  lists[territory] = count;
  console.log(`${territory}: ${count}`);
}

// What a list that could not be read had last time.
if (missing.length && existsSync(OUT)) {
  for (const file of readdirSync(OUT).filter((f) => /^[0-9a-f]{2}\.json$/.test(f))) {
    const shard = JSON.parse(readFileSync(`${OUT}${file}`, 'utf8')) as DirectoryShard;
    for (const entries of Object.values(shard.entries)) {
      for (const entry of entries) {
        if (missing.includes(entry.tl)) certificates.push({ der: Uint8Array.from(Buffer.from(entry.c, 'base64')), tl: entry.tl });
      }
    }
  }
}

const asOf = new Date().toISOString().slice(0, 10);
const { shards, names } = await buildDirectory(certificates, asOf);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const [name, shard] of Object.entries(shards)) writeFileSync(`${OUT}${name}.json`, JSON.stringify(shard));
writeFileSync(`${OUT}names.json`, JSON.stringify(names));
writeFileSync(
  `${OUT}index.json`,
  JSON.stringify({ asOf, source: LOTL, lists, missing: missing.sort() }, null, 2) + '\n',
);

const kept = Object.values(shards).reduce((n, s) => n + Object.keys(s.entries).length, 0);
console.log(`\n${kept} issuer key identifiers in ${Object.keys(shards).length} shards, as of ${asOf}.`);
if (missing.length) console.log(`Not read this time (previous entries kept): ${missing.join(', ')}`);
