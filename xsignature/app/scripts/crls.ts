/**
 * Collect qualified authorities' revocation lists into public/crls/.
 *
 *   npm run crls:refresh
 *
 * Runs when a release is built, so copies are as new as the release, and they are not committed:
 * they run to 18 MB and change daily. A list is kept only if it parses and verifies against the key of the
 * service that named its address, so what ships is what the authority signed. An address that cannot
 * be read keeps its previous copy: a list stays good evidence for anything signed before it was made.
 *
 * Addresses come from crl-sources.json, which `issuers:refresh` writes from the verified trusted
 * lists' ServiceSupplyPoints. Most countries publish none there, so coverage is what the lists offer
 * (Hungary, Poland and Slovakia as of 2026-11-05), and the summary says how much that is. Being unable
 * to reach one is never a failure of the release: the screen handles a missing copy.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { webcrypto } from 'node:crypto';

import { Certificate, CertificateRevocationList, CryptoEngine, setEngine } from 'pkijs';

import { parseBer } from '../src/lib/document/verify/signer';
import { crlFileName } from '../src/lib/document/verify/crl-copy';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
setEngine('node', new CryptoEngine({ name: 'node', crypto: globalThis.crypto }));

const OUT = fileURLToPath(new URL('../public/crls/', import.meta.url));
/** Cloudflare Pages refuses a file over 25 MB. */
const MAX_BYTES = 20 * 1024 * 1024;
const AT_ONCE = 8;

export interface CrlSource {
  readonly url: string;
  /** Base64 of the certificates of the service that named it. */
  readonly issuers: readonly string[];
  readonly list: string;
}

async function download(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'xSignature revocation-list copy (+https://xnotary.digital)' }, signal: AbortSignal.timeout(45_000) });
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.length <= MAX_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

async function verifies(bytes: Uint8Array, issuers: readonly string[]): Promise<boolean> {
  let list: CertificateRevocationList;
  try {
    list = new CertificateRevocationList({ schema: parseBer(bytes) });
  } catch {
    return false;
  }
  for (const base64 of issuers) {
    try {
      const der = Uint8Array.from(Buffer.from(base64, 'base64'));
      if (await list.verify({ issuerCertificate: Certificate.fromBER(der.slice().buffer as ArrayBuffer) })) return true;
    } catch {
      // Another of the service's certificates may be the one.
    }
  }
  return false;
}

async function refreshCrls(sources: readonly CrlSource[]): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const previous = new Set(existsSync(OUT) ? readdirSync(OUT) : []);
  const kept = new Set<string>();
  const stats = { fetched: 0, keptOld: 0, failed: 0 };
  const covered = new Set<string>();

  const queue = [...sources];
  await Promise.all(
    Array.from({ length: AT_ONCE }, async () => {
      for (let source = queue.shift(); source; source = queue.shift()) {
        const file = `${await crlFileName(source.url)}.crl`;
        const bytes = await download(source.url);
        if (bytes && (await verifies(bytes, source.issuers))) {
          writeFileSync(`${OUT}${file}`, bytes);
          kept.add(file);
          covered.add(source.list);
          stats.fetched += 1;
        } else if (previous.has(file)) {
          kept.add(file);
          covered.add(source.list);
          stats.keptOld += 1;
        } else {
          stats.failed += 1;
        }
      }
    }),
  );

  // Addresses no list names any more.
  for (const file of previous) if (!kept.has(file) && file !== 'index.json') rmSync(`${OUT}${file}`);

  const total = [...kept].reduce((sum, file) => sum + statSync(`${OUT}${file}`).size, 0);
  writeFileSync(
    `${OUT}index.json`,
    `${JSON.stringify({ asOf: new Date().toISOString().slice(0, 10), files: kept.size, bytes: total, lists: [...covered].sort() }, null, 2)}\n`,
  );
  console.log(`Revocation lists: ${stats.fetched} fetched, ${stats.keptOld} kept from last time, ${stats.failed} unusable; ${(total / 1048576).toFixed(1)} MB; from ${covered.size} countries.`);
}

await refreshCrls(JSON.parse(readFileSync(new URL('./crl-sources.json', import.meta.url), 'utf8')) as CrlSource[]);
