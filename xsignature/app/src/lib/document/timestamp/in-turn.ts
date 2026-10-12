/**
 * Asking authorities one at a time, stopping at the first that answers.
 *
 * Automatic is not a choice the app makes on the reader's behalf. It is a fixed
 * order, shown on screen before anything is sent: ask the first, and only if it
 * does not answer, the next. One digest, one request at a time, and never a
 * request to an authority after one has already answered.
 *
 * What counts as not answering is narrow on purpose. An authority that cannot
 * be reached, or that sends back something that does not answer the request
 * (refused, malformed, the wrong digest or nonce), is passed over. Anything
 * else is a bug here rather than a failure there, and it is thrown as it is.
 *
 * The answer carries the name of the authority that gave it, because that is
 * the name the result has to show. Reading it off the selection would say
 * "Izenpe dates this" about a token APED signed.
 */
import type { Outgoing } from './apply';
import { fetchTimestamp, TimestampUnreachable } from './fetch';
import { buildTimestampRequest } from './request';
import { readTimestampResponse, TimestampRefused, type Timestamp } from './response';

/** Somewhere a request can go, and the name to report if it answers. */
export interface Candidate {
  readonly name: string;
  readonly url: string;
}

/** An authority that was asked and did not answer, and why. */
export interface Passed {
  readonly name: string;
  readonly reason: string;
}

export interface Answered {
  readonly timestamp: Timestamp;
  /** Who answered. */
  readonly by: Candidate;
  /** Who was asked first and did not, in the order they were asked. */
  readonly passed: readonly Passed[];
}

export interface InTurnHooks {
  /** Called before each request is sent, with exactly what is about to go. */
  readonly onOutgoing?: (outgoing: Outgoing) => void;
}

/** The network and the parser, replaceable so the order can be tested offline. */
export interface InTurnDeps {
  readonly fetch: (url: string, request: Uint8Array) => Promise<Uint8Array>;
  readonly read: (reply: Uint8Array, digest: Uint8Array, nonce: Uint8Array) => Timestamp;
}

const NETWORK: InTurnDeps = { fetch: fetchTimestamp, read: readTimestampResponse };

export async function askInTurn(
  candidates: readonly Candidate[],
  digest: Uint8Array,
  hooks: InTurnHooks = {},
  deps: InTurnDeps = NETWORK,
): Promise<Answered> {
  if (candidates.length === 0) throw new Error('There is no authority to ask.');

  // One request, built once: the same digest and the same nonce go to each
  // authority in turn, and each reply is checked against them.
  const { der, nonce } = buildTimestampRequest(digest);
  const digestHex = toHex(digest);
  const passed: Passed[] = [];

  for (const candidate of candidates) {
    hooks.onOutgoing?.({
      url: candidate.url,
      authority: candidate.name,
      digestHex,
      requestBytes: der.length,
    });
    try {
      const reply = await deps.fetch(candidate.url, der);
      return { timestamp: deps.read(reply, digest, nonce), by: candidate, passed };
    } catch (cause) {
      if (!(cause instanceof TimestampUnreachable || cause instanceof TimestampRefused)) {
        throw cause;
      }
      // Asked for one authority, the reader gets that authority's own words.
      if (candidates.length === 1) throw cause;
      passed.push({ name: candidate.name, reason: cause.message });
    }
  }

  throw new TimestampUnreachable(
    `None of the ${candidates.length} authorities answered: ` +
      passed.map((p) => `${p.name} — ${firstSentence(p.reason)}`).join('; ') +
      '.',
  );
}

/** The cause without the reassurance, which the summary would repeat per authority. */
function firstSentence(message: string): string {
  const end = message.indexOf('. ');
  return (end === -1 ? message.replace(/\.$/, '') : message.slice(0, end)).trim();
}

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}
