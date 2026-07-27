/**
 * M0 risk spike — OpenTimestamps lifecycle in a browser-compatible runtime.
 *
 * Questions this spike must answer:
 *   1. Can we stamp a digest against the public calendars using only code that
 *      runs in a browser (no node builtins, no polyfills)?
 *   2. Is the resulting `.ots` a byte-exact match for what the reference
 *      `ots` CLI produces, i.e. can a third party verify it without xNotary?
 *   3. Can we upgrade a pending timestamp to a Bitcoin attestation?
 *   4. Can we verify an upgraded timestamp against a public block explorer,
 *      and does verification fail closed on a tampered digest?
 *
 * Runs against live calendars: `npm run spike:ots`. Excluded from CI.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  info,
  read,
  submit,
  upgrade,
  verifiers,
  verify,
  write,
} from '@vitrified/typescript-opentimestamps';

import { sha256Bytes, toHex } from '../lib/hash';

const fixture = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)));

describe('M0 · OpenTimestamps', () => {
  it('Q1 — stamps a digest against the live calendars from browser-safe code', async () => {
    // A fresh random payload so we always exercise a real calendar round-trip.
    const payload = crypto.getRandomValues(new Uint8Array(64));
    const digest = await sha256Bytes(payload);
    expect(digest).toHaveLength(32);

    const { timestamp, errors } = await submit('sha256', digest);

    // Some calendars are flaky; the spike passes if at least one answered.
    console.log(`calendar errors: ${errors.length}`, errors.map((e) => e.message));
    expect(timestamp.fileHash.algorithm).toBe('sha256');
    expect(toHex(timestamp.fileHash.value)).toBe(toHex(digest));

    const serialized = write(timestamp);
    // Magic header of every .ots file.
    const magic = '004f70656e54696d657374616d7073000050726f6f6600bf89e2e884e89294';
    expect(toHex(serialized).startsWith(magic)).toBe(true);

    // Round-trips through the wire format unchanged.
    expect(toHex(write(read(serialized)))).toBe(toHex(serialized));

    const rendered = info(timestamp);
    console.log(rendered);
    expect(rendered).toMatch(/pendingURI|https?:/);
  });

  it('Q2 — parses a .ots produced by the reference `ots` CLI', () => {
    // Fixture generated with the Python reference client (see fixtures/README.md).
    const ots = new Uint8Array(fixture('reference.ots'));
    const timestamp = read(ots);

    expect(timestamp.fileHash.algorithm).toBe('sha256');
    // Byte-exact re-serialization proves our reader/writer agree with the
    // reference implementation, which is what "independently verifiable" needs.
    expect(toHex(write(timestamp))).toBe(toHex(ots));
    console.log(info(timestamp));
  });

  it('Q2b — the reference .ots commits to the reference file digest', async () => {
    const doc = new Uint8Array(fixture('reference.txt'));
    const digest = await sha256Bytes(doc);
    const timestamp = read(new Uint8Array(fixture('reference.ots')));
    expect(toHex(timestamp.fileHash.value)).toBe(toHex(digest));
  });

  it('Q3+Q4 — upgrades a confirmed timestamp and verifies it against Bitcoin', async () => {
    // An already-anchored timestamp, so the test does not have to wait ~1h for
    // a fresh calendar submission to make it into a block.
    const pending = read(new Uint8Array(fixture('reference.ots')));

    const { timestamp: upgraded, errors } = await upgrade(pending);
    console.log(`upgrade errors: ${errors.length}`, errors.map((e) => e.message));

    const { attestations, errors: verifyErrors } = await verify(upgraded, {
      blockstream: verifiers.verifyViaBlockstream,
      blockchainInfo: verifiers.verifyViaBlockchainInfo,
    });
    console.log('attestations:', attestations);
    console.log('verify errors:', verifyErrors);

    // NOTE for the implementation: `verify` keys attestations by the *Unix time
    // of the Bitcoin block*, not by block height. The height only appears in
    // `info()` output. Certificate 1 must therefore render this key as the
    // attested time and dig the height out of the tree if it wants to show it.
    const blockTimes = Object.keys(attestations).map(Number);
    expect(blockTimes.length).toBeGreaterThan(0);

    for (const t of blockTimes) {
      expect(t).toBeGreaterThan(1_231_006_505); // Bitcoin genesis
      expect(t).toBeLessThan(Date.now() / 1000 + 7200);
      console.log(`attested at ${new Date(t * 1000).toISOString()}`);
    }
  });

  it('Q4b — fails closed when the attested digest is tampered with', async () => {
    const timestamp = read(new Uint8Array(fixture('reference.ots')));
    // Flip one bit of the file hash: nothing downstream should still attest.
    timestamp.fileHash.value[0] ^= 0x01;

    const { attestations } = await verify(timestamp, {
      blockstream: verifiers.verifyViaBlockstream,
    });
    expect(Object.keys(attestations)).toHaveLength(0);
  });
});
