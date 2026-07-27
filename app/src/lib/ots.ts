/**
 * OpenTimestamps: the Certificate 1 timestamp layer.
 *
 * The only thing that leaves the device here is a 32-byte SHA-256 digest.
 * The user's file is never uploaded.
 *
 * Lifecycle: a fresh stamp is **pending** — the calendars have promised to
 * include the digest in a Bitcoin transaction but no block exists yet. Roughly
 * an hour later the proof can be **upgraded** into a complete path down to a
 * Bitcoin block header, at which point it is **confirmed** and verifiable by
 * anyone against the blockchain, with or without xNotary or the calendars.
 */
import {
  info,
  read,
  submit,
  upgrade,
  verifiers,
  verify,
  write,
  type Leaf,
  type Timestamp,
  type Tree,
} from '@vitrified/typescript-opentimestamps';

import { toHex } from './hash';

/**
 * Calendars used for stamping.
 *
 * Deliberately NOT the library's `defaultCalendarUrls`: the M0 spike found that
 * btc.calendar.catallaxy.com serves no `Access-Control-Allow-Origin` header, so
 * a browser blocks it and every stamp reports a spurious failure. The remaining
 * three are the OpenTimestamps defaults and all work cross-origin.
 * See docs/m0-spike.md.
 */
export const CALENDAR_URLS: readonly URL[] = [
  new URL('https://alice.btc.calendar.opentimestamps.org'),
  new URL('https://bob.btc.calendar.opentimestamps.org'),
  new URL('https://finney.calendar.eternitywall.com'),
];

export type OtsStatus =
  /** Calendars have accepted the digest; no Bitcoin block yet. */
  | { readonly kind: 'pending'; readonly calendars: readonly string[] }
  /** Anchored in Bitcoin and confirmed against at least one block explorer. */
  | {
      readonly kind: 'confirmed';
      readonly blockTime: Date;
      readonly blockHeights: readonly number[];
      readonly confirmedBy: readonly string[];
    }
  /**
   * The proof is attested, but this device has not confirmed that attestation.
   * Either an explorer was unreachable, or the anchor is on a chain xNotary
   * does not check. The proof may well be good; we simply have not verified it
   * and must not claim that we have.
   *
   * `blockHeights` is empty when the anchor is not a Bitcoin one; `reason`
   * always explains which case this is, and is shown to the user verbatim.
   */
  | {
      readonly kind: 'unverified';
      readonly blockHeights: readonly number[];
      readonly reason: string;
    };

export interface StampResult {
  readonly timestamp: Timestamp;
  /** Serialized `.ots` file, ready to save next to the document. */
  readonly ots: Uint8Array;
  /** Calendars that did not answer. A stamp with some failures is still valid. */
  readonly errors: readonly string[];
}

export class OtsError extends Error {}

/** Submit a digest to the calendars and return a pending `.ots` proof. */
export async function stamp(digest: Uint8Array): Promise<StampResult> {
  if (digest.length !== 32) throw new OtsError('A SHA-256 digest must be 32 bytes');

  const { timestamp, errors } = await submit('sha256', digest, undefined, [...CALENDAR_URLS]);
  const messages = errors.map((e) => e.message);

  // Every calendar failed: there is no proof to save, so surface it rather than
  // handing the user a `.ots` that attests to nothing.
  if (collectLeaves(timestamp.tree).length === 0) {
    throw new OtsError(
      `No calendar accepted the timestamp. ${messages.join('; ') || 'Check your connection.'}`,
    );
  }
  return { timestamp, ots: write(timestamp), errors: messages };
}

/** Ask the calendars whether a pending proof has been anchored yet. */
export async function upgradeProof(
  timestamp: Timestamp,
): Promise<{ timestamp: Timestamp; ots: Uint8Array; changed: boolean; errors: string[] }> {
  const before = toHex(write(timestamp));
  const { timestamp: upgraded, errors } = await upgrade(timestamp);
  const ots = write(upgraded);
  return {
    timestamp: upgraded,
    ots,
    changed: toHex(ots) !== before,
    errors: errors.map((e) => e.message),
  };
}

/**
 * Determine the status of a proof, checking any Bitcoin attestation against
 * public block explorers.
 *
 * Every branch below only claims what something in the proof actually
 * evidences. In particular `pending` is a positive assertion — "a calendar
 * accepted this and it will anchor later" — so it requires a pending leaf to
 * be present, and is never used as a fallback for "none of the above".
 *
 * @throws {OtsError} if the proof carries no attestations at all.
 */
export async function checkStatus(timestamp: Timestamp): Promise<OtsStatus> {
  const leaves = collectLeaves(timestamp.tree);
  const bitcoinHeights = leaves.filter(isBitcoin).map((l) => l.height);

  if (bitcoinHeights.length === 0) {
    const calendars = leaves
      .filter((l): l is Extract<Leaf, { type: 'pending' }> => l.type === 'pending')
      .map((l) => l.url.href);
    if (calendars.length > 0) {
      return { kind: 'pending', calendars: [...new Set(calendars)] };
    }

    // Anchored on a chain xNotary does not check, or by an attestation type
    // newer than this build. The proof may be perfectly good — say so, rather
    // than reporting a "pending" state that would never resolve.
    const foreign = [...new Set(leaves.map((l) => l.type))].filter((t) => t !== 'pending');
    if (foreign.length > 0) {
      return {
        kind: 'unverified',
        blockHeights: [],
        reason:
          `this proof is anchored using ${foreign.join(' and ')}, which xNotary does not ` +
          `check. Verify it with a client for that chain.`,
      };
    }

    throw new OtsError(
      'This proof contains no attestations — it does not commit the document to anything.',
    );
  }

  let attestations: Record<number, string[]>;
  let verifyErrors: Record<string, Error[]>;
  try {
    ({ attestations, errors: verifyErrors } = await verify(timestamp, {
      blockstream: verifiers.verifyViaBlockstream,
      'blockchain.info': verifiers.verifyViaBlockchainInfo,
    }));
  } catch (e) {
    return {
      kind: 'unverified',
      blockHeights: bitcoinHeights,
      reason: e instanceof Error ? e.message : String(e),
    };
  }

  // `verify` keys attestations by the *Unix time of the Bitcoin block*, not by
  // block height. The height lives in the proof tree.
  const times = Object.keys(attestations).map(Number).filter(Number.isFinite);
  if (times.length === 0) {
    const reasons = Object.values(verifyErrors)
      .flat()
      .map((e) => e.message);
    return {
      kind: 'unverified',
      blockHeights: bitcoinHeights,
      reason: reasons[0] ?? 'No block explorer could confirm the attestation.',
    };
  }

  // If explorers disagree, the earliest attested time is the conservative claim.
  const blockTime = new Date(Math.min(...times) * 1000);
  const confirmedBy = [...new Set(Object.values(attestations).flat())];
  return { kind: 'confirmed', blockTime, blockHeights: bitcoinHeights, confirmedBy };
}

/** Parse a `.ots` file. Throws on anything that is not a valid proof. */
export function parseOts(bytes: Uint8Array): Timestamp {
  try {
    return read(bytes);
  } catch (e) {
    throw new OtsError(`Not a valid .ots proof: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function serializeOts(timestamp: Timestamp): Uint8Array {
  return write(timestamp);
}

/** Human-readable dump of the proof tree, as `ots info` prints it. */
export function describeProof(timestamp: Timestamp): string {
  return info(timestamp);
}

export function digestOf(timestamp: Timestamp): Uint8Array {
  return timestamp.fileHash.value;
}

function isBitcoin(leaf: Leaf): leaf is Extract<Leaf, { type: 'bitcoin' }> {
  return leaf.type === 'bitcoin';
}

/** Walk the proof tree and gather every attestation leaf. */
function collectLeaves(tree: Tree): Leaf[] {
  const out: Leaf[] = [...tree.leaves.values()];
  for (const subtree of tree.edges.values()) out.push(...collectLeaves(subtree));
  return out;
}
