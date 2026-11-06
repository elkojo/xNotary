/**
 * Refresh the issuer directory in public/issuers/ from the EU's trusted lists.
 *
 *   npm run issuers:refresh
 *
 * Runs on the build machine, never in the browser — the lists are served without CORS and the
 * certificates they point at often over plain http, which is why the app cannot fetch either
 * itself (src/lib/document/certificate/read/directory.ts says why the directory exists at all).
 *
 * Reads the List of Trusted Lists, then each national list it points to — and Switzerland's and
 * Ukraine's, which it does not (OTHER_LISTS) — and keeps the
 * certificate of every qualified certificate-issuing service (CA/QC), current and historical:
 * a signature made years ago still needs the issuer it was made under.
 *
 * It also keeps what each list records about those services, which the app reports to readers, so
 * here the lists' signatures matter (ETSI TS 119 615, 4.1 and 4.2). The EU's list has to be signed
 * by a certificate in lotl-anchor.json, copied from the Official Journal; each national list by a
 * certificate that verified list names for it. A list that fails, or that nothing anchors
 * (Switzerland's, Ukraine's), keeps its certificates for completing chains and contributes no status,
 * so nothing can be claimed from it. If the EU's own list fails, this stops: that means a newer
 * Official Journal notice is due, and lotl-anchor.json is updated by a person reading it.
 *
 *
 * A national server that cannot be reached — some sit behind bot checks that only a browser
 * passes (Estonia's, on 2026-10-28), some do not answer (Finland's) — is read instead from the
 * copy the European Commission republishes on its eIDAS dashboard; index.json says which lists
 * came from there. A list neither can serve keeps the entries it had last time, and is named in
 * index.json too, so a refresh on a bad day never silently shrinks the directory.
 * Commit what it writes; the build serves public/ as it is.
 */
import { createHash, webcrypto } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CryptoEngine, setEngine } from 'pkijs';

import { buildDirectory, type DirectoryShard, type ListFacts } from '../src/lib/document/certificate/read/directory';
import { readQualifiedServices, type ListedService } from '../src/lib/document/certificate/read/trusted-list';
import type { CrlSource } from './crls';
import { listSignature, parseList } from './list-signature';

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
setEngine('node', new CryptoEngine({ name: 'node', crypto: globalThis.crypto }));

const LOTL = 'https://ec.europa.eu/tools/lotl/eu-lotl.xml';
/** The Commission's republished copy of each national list, by territory: the eIDAS dashboard's own download. */
const MIRROR = (territory: string) => `https://eidas.ec.europa.eu/efda/api/v2/browse/eidas/tl/download/${territory}`;
/**
 * Lists outside the EU's List of Trusted Lists, each qualified under its own framework, not
 * eIDAS: Switzerland's (ZertES, published by the Swiss accreditation body) and Ukraine's (as the
 * Commission republishes it among third-country lists). Used, like every other entry, only to
 * complete a chain whose links verify.
 */
const OTHER_LISTS = [
  { territory: 'CH', url: 'https://trustedlist.tsl-switzerland.ch/tsl-ch.xml' },
  { territory: 'UA', url: 'https://eidas.ec.europa.eu/efda/api/v2/browse/ades/download/UA' },
];
const OUT = fileURLToPath(new URL('../public/issuers/', import.meta.url));
/** Some lists sit behind firewalls that turn away a client with no name, or one that asks for nothing in particular. */
const HEADERS = {
  'user-agent': 'xSignature issuer-directory refresh (+https://xnotary.digital)',
  accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
  'accept-language': 'en',
};

// Attributes allowed: canonical XML, which is what a verified list is read from, declares namespaces
// on the elements that use them.
const tag = (name: string) => new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, 'g');
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

const lotlFetched = await get(LOTL);
if (!lotlFetched) throw new Error(`Could not read ${LOTL}`);

const anchor = JSON.parse(readFileSync(new URL('./lotl-anchor.json', import.meta.url), 'utf8')) as { certificates: string[]; officialJournal: string };
const lotlCheck = await listSignature(lotlFetched, new Set(anchor.certificates));
if (!lotlCheck.ok || !lotlCheck.signed) {
  throw new Error(`The EU's list did not verify against ${anchor.officialJournal}: ${lotlCheck.why}. Read the latest notice its SchemeInformationURI names, and update scripts/lotl-anchor.json by hand.`);
}
console.log('EU list: signature verified against the Official Journal.');
// From here on, only what the signature covers.
const lotl = lotlCheck.signed;

const fingerprint = (base64: string): string => createHash('sha256').update(Buffer.from(base64.replace(/\s/g, ''), 'base64')).digest('hex');

const pointers = [
  ...all(lotl, 'OtherTSLPointer')
    .map((p) => ({
      territory: first(p, 'SchemeTerritory'),
      url: first(p, 'TSLLocation'),
      mime: first(p, 'MimeType'),
      signers: new Set(all(p, 'X509Certificate').map(fingerprint)),
    }))
    .filter((p) => p.mime.includes('xml') && p.territory && p.territory !== 'EU' && p.territory !== 'UK'),
  ...OTHER_LISTS.map((l) => ({ ...l, mime: 'xml', signers: new Set<string>() })),
];
const outsideEu = OTHER_LISTS.map((l) => l.territory);

/**
 * Stop rather than write a directory that has lost most of itself. A reader that finds nothing still
 * "succeeds", and the weekly job would propose the result as a routine pull request.
 */
const MIN_NATIONAL_LISTS = 25;
if (pointers.length - outsideEu.length < MIN_NATIONAL_LISTS) {
  throw new Error(`The EU's list names only ${pointers.length - outsideEu.length} national lists. Nothing was written.`);
}

const certificates: { der: Uint8Array; tl: string; services?: readonly ListedService[]; timeServices?: readonly ListedService[] }[] = [];
const verified: Record<string, ListFacts> = {};
const unverified: string[] = [];
const crlSources = new Map<string, CrlSource>();
const lists: Record<string, number> = {};
const missing: string[] = [];
const mirrored: string[] = [];

for (const { territory, url, signers } of pointers) {
  // Its own server first, then the Commission's copy, keeping the first that verifies. One bad list
  // must not stop the others, or cost it the entries it had.
  let fetched: string | null = null;
  let check: { ok: boolean; why: string; signed?: string } = { ok: false, why: 'not read' };
  for (const [source, address] of [['own', url], ['copy', outsideEu.includes(territory) ? null : MIRROR(territory)]] as const) {
    if (!address) continue;
    const text = await get(address);
    if (!text) continue;
    let attempt: { ok: boolean; why: string; signed?: string };
    try {
      parseList(text);
      attempt = signers.size > 0 ? await listSignature(text, signers) : { ok: false, why: 'no anchor' };
    } catch (error) {
      console.warn(`${territory}: ${address} could not be read: ${String(error).slice(0, 100)}`);
      continue;
    }
    if (!fetched || attempt.ok) {
      fetched = text;
      check = attempt;
      if (source === 'copy') {
        mirrored.push(territory);
        console.warn(`${territory}: read the Commission's copy instead of ${url}`);
      }
    }
    if (attempt.ok) break;
  }
  if (!fetched) {
    missing.push(territory);
    console.warn(`${territory}: could not read ${url} or the Commission's copy — keeping its previous entries`);
    continue;
  }
  // Verified: only what the signature covers. Otherwise it claims nothing and completes chains by arithmetic.
  const xml: string = check.signed ?? fetched;
  if (check.ok) {
    verified[territory] = {
      issued: first(xml, 'ListIssueDateTime'),
      next: first(first(xml, 'NextUpdate'), 'dateTime'),
      sequence: first(xml, 'TSLSequenceNumber'),
    };
  } else {
    unverified.push(territory);
    if (!outsideEu.includes(territory)) console.warn(`${territory}: signature did not verify (${check.why}) — certificates only, no status`);
  }

  let count = 0;
  for (const { certificates: identifying, service, supplyPoints, kind } of readQualifiedServices(parseList(xml))) {
    if (kind === 'tsa') {
      // Only ever from a verified list: on an unverified one a time authority would mean nothing.
      if (check.ok) {
        for (const base64 of identifying) {
          certificates.push({ der: Uint8Array.from(Buffer.from(base64, 'base64')), tl: territory, timeServices: [service] });
        }
      }
      continue;
    }
    // Only from a verified list, and only what looks like a list rather than an OCSP address.
    if (check.ok) {
      for (const url of supplyPoints.filter((point) => /^https?:\/\/\S*crl\S*$/i.test(point) && !/ocsp/i.test(point))) {
        const known = crlSources.get(url);
        crlSources.set(url, { url, list: territory, issuers: [...(known?.issuers ?? []), ...identifying] });
      }
    }
    for (const base64 of identifying) {
      certificates.push({
        der: Uint8Array.from(Buffer.from(base64, 'base64')),
        tl: territory,
        ...(check.ok ? { services: [service] } : {}),
      });
      count += 1;
    }
  }
  lists[territory] = count;
  console.log(`${territory}: ${count}`);
}

// What a list that could not be read had last time.
const previousIndex = existsSync(`${OUT}index.json`)
  ? (JSON.parse(readFileSync(`${OUT}index.json`, 'utf8')) as { verified?: Record<string, ListFacts> })
  : {};
for (const territory of missing) {
  if (previousIndex.verified?.[territory]) verified[territory] = previousIndex.verified[territory];
}
if (missing.length && existsSync(OUT)) {
  for (const file of readdirSync(OUT).filter((f) => /^[0-9a-f]{2}\.json$/.test(f))) {
    const shard = JSON.parse(readFileSync(`${OUT}${file}`, 'utf8')) as DirectoryShard;
    for (const entries of Object.values(shard.entries)) {
      for (const entry of entries) {
        if (missing.includes(entry.tl)) certificates.push({ der: Uint8Array.from(Buffer.from(entry.c, 'base64')), tl: entry.tl, services: entry.s, timeServices: entry.t });
      }
    }
  }
}

const asOf = new Date().toISOString().slice(0, 10);
const { shards, names } = await buildDirectory(certificates, asOf);

const keptNow = Object.values(shards).reduce((n, shard) => n + Object.keys(shard.entries).length, 0);
const verifiedNow = Object.keys(verified).length;
if (verifiedNow < MIN_NATIONAL_LISTS) throw new Error(`Only ${verifiedNow} lists verified. Nothing was written.`);
if (existsSync(`${OUT}names.json`)) {
  const before = Object.values((JSON.parse(readFileSync(`${OUT}names.json`, 'utf8')) as { names: Record<string, string[]> }).names).flat().length;
  if (keptNow < before * 0.7) throw new Error(`The directory would shrink from ${before} entries to ${keptNow}. Nothing was written.`);
}

// In place, removing only what is no longer wanted. Deleting the folder first leaves a running dev
// server answering every shard with its HTML page until it is restarted.
mkdirSync(OUT, { recursive: true });
const written = new Set(['names.json', 'index.json']);
for (const [name, shard] of Object.entries(shards)) {
  writeFileSync(`${OUT}${name}.json`, JSON.stringify(shard));
  written.add(`${name}.json`);
}
for (const file of readdirSync(OUT)) if (!written.has(file)) rmSync(`${OUT}${file}`);
writeFileSync(`${OUT}names.json`, JSON.stringify(names));
writeFileSync(
  `${OUT}index.json`,
  JSON.stringify(
    {
      asOf,
      source: LOTL,
      outsideEu: Object.fromEntries(OTHER_LISTS.map((l) => [l.territory, l.url])),
      lists,
      anchor: anchor.officialJournal,
      verified,
      unverified: unverified.sort(),
      fromCommissionCopy: mirrored.sort(),
      missing: missing.sort(),
    },
    null,
    2,
  ) + '\n',
);

const kept = Object.values(shards).reduce((n, s) => n + Object.keys(s.entries).length, 0);
console.log(`\n${kept} issuer key identifiers in ${Object.keys(shards).length} shards, as of ${asOf}.`);
if (mirrored.length) console.log(`Read from the Commission's copy: ${mirrored.join(', ')}`);
if (unverified.length) console.log(`No status kept for: ${unverified.join(', ')}`);
if (missing.length) console.log(`Not read this time (previous entries kept): ${missing.join(', ')}`);

// A list not read this time keeps its addresses, as it keeps its entries.
const previousSources: CrlSource[] = existsSync(new URL('./crl-sources.json', import.meta.url))
  ? JSON.parse(readFileSync(new URL('./crl-sources.json', import.meta.url), 'utf8'))
  : [];
for (const source of previousSources) {
  if (missing.includes(source.list) && !crlSources.has(source.url)) crlSources.set(source.url, source);
}

// Where the release build collects the revocation lists from (scripts/crls.ts). The addresses are
// committed and the lists are not: they run to 18 MB and change daily.
const sources = [...crlSources.values()].sort((a, b) => (a.url < b.url ? -1 : 1));
writeFileSync(new URL('./crl-sources.json', import.meta.url), `${JSON.stringify(sources, null, 1)}\n`);
console.log(`${sources.length} revocation list addresses, from ${new Set(sources.map((source) => source.list)).size} countries.`);
