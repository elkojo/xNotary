/**
 * `checkStatus` decides what the app tells the user a proof is worth, so every
 * branch is pinned here. The rule these tests enforce: a status is only
 * reported when something in the proof actually evidences it.
 *
 * Synthetic trees keep this offline — the only branch that talks to the network
 * is the Bitcoin one, covered live in `src/spikes/ots.spike.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { newTree, type Timestamp, type Tree } from '@vitrified/typescript-opentimestamps';

import { toHex } from './hash';
import { OtsError, checkStatus, digestOf, parseOts } from './ots';

const referenceOts = new Uint8Array(
  readFileSync(fileURLToPath(new URL('../spikes/fixtures/reference.ots', import.meta.url))),
);

/** A timestamp whose attestations are exactly the leaves supplied. */
function timestampWith(build: (tree: Tree) => void): Timestamp {
  const tree = newTree();
  build(tree);
  return { version: 1, fileHash: { algorithm: 'sha256', value: new Uint8Array(32) }, tree };
}

describe('checkStatus', () => {
  it('reports pending when a calendar has accepted the digest', async () => {
    const status = await checkStatus(
      timestampWith((tree) => {
        tree.leaves.add({ type: 'pending', url: new URL('https://alice.btc.calendar.example/') });
        tree.leaves.add({ type: 'pending', url: new URL('https://bob.btc.calendar.example/') });
      }),
    );

    expect(status.kind).toBe('pending');
    if (status.kind !== 'pending') return;
    expect(status.calendars).toHaveLength(2);
  });

  it('deduplicates repeated calendars', async () => {
    const status = await checkStatus(
      timestampWith((tree) => {
        const url = new URL('https://alice.btc.calendar.example/');
        tree.leaves.add({ type: 'pending', url });
        tree.leaves.add({ type: 'pending', url: new URL(url.href) });
      }),
    );

    expect(status.kind === 'pending' && status.calendars).toEqual([
      'https://alice.btc.calendar.example/',
    ]);
  });

  // The regression this suite exists for: an attestation on a chain we do not
  // check used to fall through to `pending`, so the UI promised a Bitcoin
  // confirmation that could never arrive and offered an Upgrade button that
  // could never do anything.
  it.each([
    ['litecoin', { type: 'litecoin' as const, height: 2_800_000 }],
    ['ethereum', { type: 'ethereum' as const, height: 21_000_000 }],
  ])('does not claim pending for a %s anchor', async (chain, leaf) => {
    const status = await checkStatus(timestampWith((tree) => tree.leaves.add(leaf)));

    expect(status.kind).toBe('unverified');
    if (status.kind !== 'unverified') return;
    expect(status.reason).toContain(chain);
    // No Bitcoin height may be asserted for a non-Bitcoin anchor.
    expect(status.blockHeights).toEqual([]);
  });

  it('does not claim pending for an attestation type it does not recognise', async () => {
    const status = await checkStatus(
      timestampWith((tree) =>
        tree.leaves.add({
          type: 'unknown',
          header: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
          payload: new Uint8Array([9]),
        }),
      ),
    );

    expect(status.kind).toBe('unverified');
    expect(status.kind === 'unverified' && status.reason).toMatch(/does not check/);
  });

  it('still reports pending when a foreign anchor sits alongside a calendar', async () => {
    // A pending calendar is live evidence the proof will anchor on Bitcoin, so
    // it outranks an anchor we cannot check.
    const status = await checkStatus(
      timestampWith((tree) => {
        tree.leaves.add({ type: 'litecoin', height: 2_800_000 });
        tree.leaves.add({ type: 'pending', url: new URL('https://alice.btc.calendar.example/') });
      }),
    );

    expect(status.kind).toBe('pending');
  });

  it('rejects a proof that attests to nothing rather than calling it pending', async () => {
    await expect(checkStatus(timestampWith(() => {}))).rejects.toBeInstanceOf(OtsError);
    await expect(checkStatus(timestampWith(() => {}))).rejects.toThrow(/no attestations/);
  });
});

describe('parseOts', () => {
  it('reads a reference proof and exposes the digest it commits to', () => {
    const timestamp = parseOts(referenceOts);
    expect(toHex(digestOf(timestamp))).toBe(
      '03ba204e50d126e4674c005e04d82e84c21366780af1f43bd54a37816b6ab340',
    );
  });

  it('throws an OtsError on input that is not a proof', () => {
    expect(() => parseOts(new TextEncoder().encode('not a timestamp'))).toThrow(OtsError);
  });
});
