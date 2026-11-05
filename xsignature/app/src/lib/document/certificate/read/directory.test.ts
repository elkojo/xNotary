import { Certificate } from 'pkijs';
import { beforeAll, describe, expect, it } from 'vitest';

import { authorityKeyIdOf, buildDirectory, DirectoryUnreachable, findIssuers, keyIdOf, siteDirectory, type DirectorySource } from './directory';
import { makeChain, type GeneratedChain } from './fixtures/make-keys';

const parse = (der: Uint8Array) => Certificate.fromBER(der.slice().buffer as ArrayBuffer);
const nameOf = (c: Certificate) =>
  c.subject.typesAndValues.find((p) => p.type === '2.5.4.3')?.value.valueBlock.value as string;

/** The directory as the site would serve it, from memory, counting what was asked for. */
async function served(certificates: { der: Uint8Array; tl: string }[]) {
  const { shards, names } = await buildDirectory(certificates, '2026-10-28');
  const asked: string[] = [];
  const source: DirectorySource = async (name) => {
    asked.push(name);
    return name === 'names' ? names : (shards[name] ?? null);
  };
  return { source, asked, shards };
}

let withIds: GeneratedChain;
let byName: GeneratedChain;
let other: GeneratedChain;

beforeAll(async () => {
  [withIds, byName, other] = await Promise.all([makeChain('x', { keyIds: true }), makeChain(), makeChain()]);
}, 120_000);

describe('key identifiers', () => {
  it("reads a certificate's issuer from its authority key identifier", async () => {
    const leaf = parse(withIds.leaf);
    expect(authorityKeyIdOf(leaf)).toBe(await keyIdOf(parse(withIds.intermediateDer)));
  });

  it('has none to read when the certificate states none', () => {
    expect(authorityKeyIdOf(parse(byName.leaf))).toBeNull();
  });
});

describe('findIssuers', () => {
  it('walks up by key identifier, one shard per link, and says which list each came from', async () => {
    const { source, asked } = await served([
      { der: withIds.intermediateDer, tl: 'CZ' },
      { der: withIds.rootDer, tl: 'CZ' },
      { der: other.intermediateDer, tl: 'PL' },
    ]);
    const found = await findIssuers(parse(withIds.leaf), source);
    expect(found?.chain.map(nameOf)).toEqual(['Test Issuing CA', 'Test Root CA']);
    expect(found?.lists).toEqual(['CZ', 'CZ']);
    expect(found?.asOf).toBe('2026-10-28');
    // Two links, two shards, and never the whole directory.
    expect(asked).toHaveLength(2);
    expect(asked).not.toContain('names');
  });

  it('falls back to the name when the certificate states no issuer key identifier', async () => {
    const { source, asked } = await served([
      { der: byName.intermediateDer, tl: 'SK' },
      { der: byName.rootDer, tl: 'SK' },
    ]);
    const found = await findIssuers(parse(byName.leaf), source);
    expect(found?.chain.map(nameOf)).toEqual(['Test Issuing CA', 'Test Root CA']);
    expect(asked[0]).toBe('names');
  });

  it('takes no certificate whose key did not sign the child — a same-named impostor is passed over', async () => {
    // `other` was made with the same names but different keys: by name alone it would pass.
    const { source } = await served([{ der: other.intermediateDer, tl: 'XX' }]);
    expect(await findIssuers(parse(byName.leaf), source)).toBeNull();
  });

  it('stops at a hole and claims only the links it has', async () => {
    const { source } = await served([{ der: withIds.intermediateDer, tl: 'CZ' }]);
    const found = await findIssuers(parse(withIds.leaf), source);
    expect(found?.chain.map(nameOf)).toEqual(['Test Issuing CA']);
  });

  it('finds nothing in a directory that cannot be reached', async () => {
    expect(await findIssuers(parse(withIds.leaf), async () => null)).toBeNull();
  });
});

describe('buildDirectory', () => {
  it('lays out the same files whatever order the certificates came in', async () => {
    const certs = [
      { der: withIds.intermediateDer, tl: 'CZ' },
      { der: withIds.rootDer, tl: 'CZ' },
      { der: other.rootDer, tl: 'PL' },
    ];
    const a = await buildDirectory(certs, 'd');
    const b = await buildDirectory([...certs].reverse(), 'd');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('keeps one copy of a certificate listed twice', async () => {
    const { shards } = await buildDirectory(
      [
        { der: withIds.rootDer, tl: 'CZ' },
        { der: withIds.rootDer, tl: 'CZ' },
      ],
      'd',
    );
    expect(Object.values(shards).flatMap((s) => Object.values(s.entries).flat())).toHaveLength(1);
  });
});

describe('what a verified list records', () => {
  const service = { n: ['Provider'], h: [{ s: 'granted', t: '2020-01-01T00:00:00Z', a: ['ForeSignatures'] }] };

  it('travels with the certificate, and merges when one certificate identifies two services', async () => {
    const { rootDer: der } = await makeChain();
    const second = { ...service, n: ['Second'] };
    const { shards } = await buildDirectory(
      [
        { der, tl: 'SK', services: [service] },
        { der, tl: 'SK', services: [second] },
      ],
      '2026-11-05',
    );
    const entry = Object.values(Object.values(shards)[0].entries)[0][0];
    expect(entry.s?.map((s) => s.n[0])).toEqual(['Provider', 'Second']);
  });

  it('is absent from a list nothing verified, which still completes a chain', async () => {
    const { rootDer: der } = await makeChain();
    const { shards } = await buildDirectory([{ der, tl: 'CH' }], '2026-11-05');
    expect(Object.values(Object.values(shards)[0].entries)[0][0].s).toBeUndefined();
  });
});

describe('the directory as this site serves it', () => {
  const answering = (response: () => Promise<Response>) => {
    const real = globalThis.fetch;
    globalThis.fetch = response as typeof fetch;
    return () => {
      globalThis.fetch = real;
    };
  };
  const read = () => siteDirectory('/x/')('42');

  it('returns a shard', async () => {
    const restore = answering(async () => new Response('{"asOf":"x"}'));
    await expect(read()).resolves.toEqual({ asOf: 'x' });
    restore();
  });

  it('says a missing file is missing', async () => {
    const restore = answering(async () => new Response('', { status: 404 }));
    await expect(read()).resolves.toBeNull();
    restore();
  });

  it('does not mistake a server answering with its HTML page for a directory without the entry', async () => {
    const restore = answering(async () => new Response('<!doctype html><html></html>'));
    await expect(read()).rejects.toBeInstanceOf(DirectoryUnreachable);
    restore();
  });

  it('does not mistake being offline for it either', async () => {
    const restore = answering(async () => {
      throw new TypeError('offline');
    });
    await expect(read()).rejects.toBeInstanceOf(DirectoryUnreachable);
    restore();
  });
});
