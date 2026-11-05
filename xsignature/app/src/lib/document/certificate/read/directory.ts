/**
 * The issuer certificates a signature should carry, found in a directory this app ships.
 *
 * A signer's certificate names its issuer and usually says where that issuer's certificate is
 * published — but at an address a web page cannot fetch: no CORS header, and as often as not
 * plain `http://`, which a page served over `https` may not load. Reaching it would take a
 * server in between, and this site has none (no backend, invariant 2). So the certificates are
 * fetched the other way round: ahead of time, on the build machine, from the trusted lists the
 * EU publishes, and Switzerland's and Ukraine's (scripts/issuers.ts), and served from this site in small shards
 * (public/issuers/). A click fetches one shard, from this origin, carrying nothing from the
 * reader.
 *
 * A certificate is taken as the issuer only when its name is the one the child names *and* its
 * key verifies the child's signature. A wrong or planted entry cannot pass that; at worst it is
 * not found.
 *
 * Since 2026-11-05 (owner's decision) the directory also says what a list records about the
 * service behind a certificate, which `verify/trust.ts` reads. That is a trust claim, so it rests
 * on more than the arithmetic above: an entry carries `s` only when the list it came from had its
 * signature verified at build time, up to the Official Journal (`scripts/issuers.ts`). An entry
 * without it still completes a chain, and claims nothing. Switzerland's and Ukraine's are like
 * that: they have no anchor to verify against.
 */
import { Certificate } from 'pkijs';

import { isSelfSigned, sameName } from './chain';
import type { ListedService } from './trusted-list';

/** One shard: every certificate whose key identifier starts with the shard's two hex digits. */
export interface DirectoryShard {
  /** The day the trusted lists were read. */
  readonly asOf: string;
  /** Key identifier (hex) → the certificates carrying it, base64 DER, with the list they came from. */
  readonly entries: Readonly<Record<string, readonly DirectoryEntry[]>>;
}

export interface DirectoryEntry {
  /** The certificate, base64 DER. */
  readonly c: string;
  /** The trusted list it came from, by territory: `PL`, `CZ`, … */
  readonly tl: string;
  /** What that list records about the services it identifies, when the list was verified. */
  readonly s?: readonly ListedService[];
}

/** What the site knows about one list, from `index.json`. */
export interface ListFacts {
  /** The list's own issue date. */
  readonly issued: string;
  /** When the list says the next one is due. */
  readonly next: string;
  readonly sequence: string;
}

/** `index.json`, for the parts a reader sees. */
export interface DirectoryIndex {
  readonly asOf: string;
  readonly verified?: Readonly<Record<string, ListFacts>>;
}

/**
 * For the rare certificate that names its issuer without the issuer's key identifier: the
 * SHA-256 of a subject name (hex) → the key identifiers of the certificates bearing it.
 */
export interface NameIndex {
  readonly asOf: string;
  readonly names: Readonly<Record<string, readonly string[]>>;
}

/** Fetches `<name>.json` from the directory, or null when it holds no such file. */
export type DirectorySource = (name: string) => Promise<unknown>;

/**
 * The directory could not be read at all: offline, or a server answering with something else.
 *
 * Kept apart from "not in the directory" because the reader acts on the difference. One means
 * try again; the other means go and find the certificate, and telling somebody that when the
 * entry was there all along sends them on a pointless errand.
 */
export class DirectoryUnreachable extends Error {}

/** The directory as the site serves it, under `base` (the app's base path). */
export function siteDirectory(base: string, cache: RequestCache = 'default'): DirectorySource {
  return async (name) => {
    try {
      const response = await fetch(`${base}issuers/${name}.json`, { cache });
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // A static host may answer a missing file with its HTML page and a 200.
      return await response.json();
    } catch (error) {
      throw new DirectoryUnreachable(String(error));
    }
  };
}

const hex = (bytes: ArrayBuffer | Uint8Array): string =>
  [...(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

function extension(certificate: Certificate, oid: string) {
  return certificate.extensions?.find((e) => e.extnID === oid)?.parsedValue;
}

/**
 * The certificate's own key identifier: its Subject Key Identifier, or — when it states none —
 * the SHA-1 of its public key, which is how RFC 5280 says to make one and how most issuers do.
 */
export async function keyIdOf(certificate: Certificate): Promise<string> {
  const stated = extension(certificate, '2.5.29.14');
  if (stated?.valueBlock?.valueHexView) return hex(stated.valueBlock.valueHexView);
  const key = certificate.subjectPublicKeyInfo.subjectPublicKey.valueBlock.valueHexView;
  return hex(await crypto.subtle.digest('SHA-1', key.slice()));
}

/** The key identifier of the issuer, as the certificate states it, or null. */
export function authorityKeyIdOf(certificate: Certificate): string | null {
  const stated = extension(certificate, '2.5.29.35')?.keyIdentifier;
  return stated?.valueBlock?.valueHexView ? hex(stated.valueBlock.valueHexView) : null;
}

/** The SHA-256 of a name's encoding, which is how names are compared. */
export async function nameHash(name: Certificate['subject']): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', name.toSchema().toBER(false)));
}

const shardOf = (keyId: string) => keyId.slice(0, 2);

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(base64: string): ArrayBuffer {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

/**
 * Lay certificates out as the directory: the shards, and the name index. Shared by the build
 * script that writes them and the tests that read them, so both use the one layout.
 * Deterministic: the same certificates give the same files, whatever order they came in.
 */
export async function buildDirectory(
  certificates: readonly { readonly der: Uint8Array; readonly tl: string; readonly services?: readonly ListedService[] }[],
  asOf: string,
): Promise<{ shards: Record<string, DirectoryShard>; names: NameIndex }> {
  const byKey = new Map<string, Map<string, { c: string; tl: string; s?: ListedService[] }>>();
  const names = new Map<string, Set<string>>();

  for (const { der, tl, services } of certificates) {
    let certificate: Certificate;
    try {
      certificate = Certificate.fromBER(der.slice().buffer as ArrayBuffer);
    } catch {
      continue;
    }
    const keyId = await keyIdOf(certificate);
    const c = toBase64(der);
    const entries = byKey.get(keyId) ?? new Map<string, { c: string; tl: string; s?: ListedService[] }>();
    const entry = entries.get(c) ?? { c, tl };
    // One certificate can identify several services, and the rules weigh all of them.
    if (services?.length) {
      const known = new Set((entry.s ?? []).map((service) => JSON.stringify(service)));
      for (const service of services) {
        if (!known.has(JSON.stringify(service))) (entry.s ??= []).push(service);
      }
    }
    entries.set(c, entry);
    byKey.set(keyId, entries);

    const name = await nameHash(certificate.subject);
    names.set(name, (names.get(name) ?? new Set()).add(keyId));
  }

  const shards: Record<string, { asOf: string; entries: Record<string, DirectoryEntry[]> }> = {};
  for (const keyId of [...byKey.keys()].sort()) {
    const shard = (shards[shardOf(keyId)] ??= { asOf, entries: {} });
    shard.entries[keyId] = [...byKey.get(keyId)!.values()].sort((a, b) => (a.c < b.c ? -1 : 1));
  }
  const index: Record<string, string[]> = {};
  for (const name of [...names.keys()].sort()) index[name] = [...names.get(name)!].sort();
  return { shards, names: { asOf, names: index } };
}

export interface FoundIssuers {
  /** Issuer first, as `orderChain` gives it: the signer's issuer, then that one's, and so on. */
  readonly chain: Certificate[];
  /** The trusted lists they came from, in chain order. */
  readonly lists: string[];
  readonly asOf: string;
  /**
   * What a verified list records about the services on this path, nearest first, with the list.
   *
   * Every certificate in the same shard with the same key and name counts: a service's
   * certificate may have been reissued, and it is the key and the name that identify it.
   */
  readonly listed: { readonly list: string; readonly services: readonly ListedService[] } | null;
}

/** How far up to go. Real chains are two or three deep; this only stops a loop. */
const MAX_DEPTH = 6;

/**
 * Walk up from `leaf` through the directory, one verified link at a time. Null when not even
 * the first link is there — the directory holds qualified issuers only, so most others are not.
 */
export async function findIssuers(leaf: Certificate, source: DirectorySource): Promise<FoundIssuers | null> {
  const chain: Certificate[] = [];
  const lists: string[] = [];
  let asOf = '';
  let listed: FoundIssuers['listed'] = null;
  let current = leaf;
  let names: NameIndex | null | undefined;

  while (!isSelfSigned(current) && chain.length < MAX_DEPTH) {
    let keyIds: readonly string[];
    const authority = authorityKeyIdOf(current);
    if (authority) {
      keyIds = [authority];
    } else {
      names ??= (await source('names')) as NameIndex | null;
      keyIds = names?.names[await nameHash(current.issuer)] ?? [];
    }

    let next: { certificate: Certificate; tl: string; services: ListedService[] } | null = null;
    for (const keyId of keyIds) {
      const shard = (await source(shardOf(keyId))) as DirectoryShard | null;
      for (const entry of shard?.entries[keyId] ?? []) {
        let candidate: Certificate;
        try {
          candidate = Certificate.fromBER(fromBase64(entry.c));
        } catch {
          continue;
        }
        if (!sameName(candidate.subject, current.issuer)) continue;
        let holds = false;
        try {
          holds = await current.verify(candidate);
        } catch {
          holds = false;
        }
        if (holds) {
          const services = await servicesWithSameIdentity(shard!.entries[keyId], candidate, entry.tl);
          next = { certificate: candidate, tl: entry.tl, services };
          asOf = shard!.asOf;
          break;
        }
      }
      if (next) break;
    }

    if (!next) break;
    chain.push(next.certificate);
    lists.push(next.tl);
    if (!listed && next.services.length > 0) listed = { list: next.tl, services: next.services };
    current = next.certificate;
  }

  return chain.length ? { chain, lists, asOf, listed } : null;
}

async function servicesWithSameIdentity(
  entries: readonly DirectoryEntry[],
  certificate: Certificate,
  list: string,
): Promise<ListedService[]> {
  const found: ListedService[] = [];
  for (const entry of entries) {
    if (entry.tl !== list || !entry.s) continue;
    try {
      if (sameName(Certificate.fromBER(fromBase64(entry.c)).subject, certificate.subject)) found.push(...entry.s);
    } catch {
      // One unreadable entry does not spoil the others.
    }
  }
  return found;
}
