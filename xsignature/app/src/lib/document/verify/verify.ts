/**
 * Checking what a PDF claims about itself, and being exact about what the check
 * proves.
 *
 * A file may carry two kinds of claim, and they are not the same size.
 *
 * A **document timestamp** says these exact bytes existed at this time,
 * according to an authority that has never heard of whoever made them.
 *
 * A **certificate signature** says more: that whoever held a particular private
 * key signed these bytes. That is a claim about a person, and it is the one
 * worth being careful about.
 *
 * For either, two things are established here and a third is not.
 *
 *  1. **The document has not changed.** The bytes the claim covers are
 *     reassembled and checked against the digest inside it. If one byte moved,
 *     this fails.
 *  2. **The token is internally sound.** Its CMS signature is verified against
 *     the certificate carried inside it, so it is not something somebody
 *     assembled by hand.
 *  3. **Not** whether the signer deserves to be believed. That needs a list of
 *     trusted roots, kept current, and checked for revocation against a network
 *     this app does not use. So the signer's name is reported exactly as the
 *     token states it, and the screen says plainly that vouching for that name
 *     is a PDF reader's job.
 *
 * Point 3 matters more for a signature than for a timestamp. A timestamp whose
 * authority is unknown is still a timestamp; a signature whose signer is
 * unverified is a signature by nobody in particular. Reporting (3) as if it
 * were settled would be the dishonest version of this feature, and the
 * interesting failure — a document altered after signing — is caught by (1)
 * regardless.
 */
import type { Certificate, SignedData } from 'pkijs';

import type { ChainLink } from '../certificate/read/chain';
import { digestedBytes } from '../timestamp/byte-range';
import type { CertificateClaims } from './claims';
import { findSignatures, isDocumentTimestamp, type FoundSignature } from './find';
import {
  NO_SIGNER,
  checkSigner,
  embeddedTimestampOf,
  readTimestampToken,
  readTstInfo,
  signedDataFrom,
  signerFactsOf,
  type AttachedTimestamp,
} from './signer';

export type Verdict =
  /** Covers this file, and its own signature checks out. */
  | 'intact'
  /** The file has changed since it was signed or stamped. */
  | 'altered'
  /** The token's signature does not check out against its own certificate. */
  | 'broken'
  /** Something in the token could not be read at all. */
  | 'unreadable';

export interface CheckedSignature {
  readonly verdict: Verdict;
  /** What kind of claim this is. */
  readonly kind: 'timestamp' | 'signature';
  /**
   * The time the claim states.
   *
   * For a timestamp this is an authority's clock, which is the point of it. For
   * a signature it is the signer's own, asserted and checked by nobody.
   */
  readonly time: Date | null;
  /** The signer, exactly as the token names it. Not vouched for. */
  readonly signedBy: string | null;
  /**
   * Who the signer's certificate says issued it. Not vouched for either.
   *
   * Present even when the signature encloses no issuer certificate, which is
   * when it is worth the most: it names the certificate a reader has to find.
   */
  readonly issuedBy: string | null;
  readonly policy: string | null;
  /** True when this is a document timestamp rather than a signature of identity. */
  readonly isTimestamp: boolean;
  /**
   * What this signature permits to happen to the document afterwards.
   *
   * `null` for an ordinary approval signature, which restricts nothing. A
   * certifying one says how much later change it tolerates, and `1` means none
   * — so nothing may be added to such a document, counter-signature included.
   */
  readonly permits: 1 | 2 | 3 | null;
  /**
   * The signer's own certificate, when the token carried a readable one.
   *
   * A parsed object rather than the plain readings around it, because a chain
   * supplied afterwards has to be checked *against* something: a signature that
   * encloses no issuer certificates can still be traced once the reader fetches
   * them, and the arithmetic needs the leaf. Nothing here is vouched for by
   * exposing it.
   */
  readonly certificate: Certificate | null;
  /** What the signer typed into the signature, if anything. Not checked. */
  readonly reason: string | null;
  readonly location: string | null;
  readonly name: string | null;
  /** How many certificates the token carried, the signer's included. */
  readonly certificateCount: number;
  /**
   * What the signer's certificate declares about itself.
   *
   * Read out of the certificate, not decided here. Null when the token carried
   * no certificate to read.
   */
  readonly claims: CertificateClaims | null;
  /**
   * The certificates above the signer's, and whether each really signed the
   * next.
   *
   * Empty when the signature carries none, which is worth saying: a reader with
   * no chain has a name and no way to trace it. Arithmetic only — that these
   * certificates hang together, not that the one at the top is worth believing.
   */
  readonly chain: readonly ChainLink[];
  /** Those certificates themselves, issuer first. */
  readonly issuers: readonly Certificate[];
  /**
   * A timestamp carried *inside* this signature, when it has one.
   *
   * This is what makes a signature PAdES-B-T, and it is a stronger statement
   * than the signer's own clock beside it: an authority saw the signature and
   * said when. Its `standing` is checked rather than assumed — a token attached
   * to a signature it does not describe, or one nobody really signed, would
   * otherwise look like corroboration and be none.
   */
  readonly timestamp: AttachedTimestamp | null;
  readonly coversToEndOfFile: boolean;
  /** How much of the file this one covers, in bytes. */
  readonly covers: number;
  /** In the app's own voice, for when the verdict is not 'intact'. */
  readonly detail: string;
}

/** Everything the file claims, checked. */
export async function checkSignatures(pdf: Uint8Array): Promise<CheckedSignature[]> {
  const found = findSignatures(pdf);
  return Promise.all(found.map((signature) => checkOne(pdf, signature)));
}

async function checkOne(pdf: Uint8Array, signature: FoundSignature): Promise<CheckedSignature> {
  const covered = digestedBytes(pdf, signature.byteRange);
  const isTimestamp = isDocumentTimestamp(signature);
  const shared = {
    isTimestamp,
    permits: signature.permits,
    kind: (isTimestamp ? 'timestamp' : 'signature') as 'timestamp' | 'signature',
    reason: signature.reason,
    location: signature.location,
    name: signature.name,
    coversToEndOfFile: signature.coversToEndOfFile,
    covers: signature.byteRange[1] + signature.byteRange[3],
  };

  let signed: SignedData;
  try {
    signed = signedDataFrom(signature.token);
  } catch {
    return {
      ...shared,
      verdict: 'unreadable',
      ...NO_SIGNER,
      time: null,
      policy: null,
      certificateCount: 0,
      timestamp: null,
      detail: 'The token in this file could not be read.',
    };
  }

  // A timestamp carries its time inside a TSTInfo in the signed content; a
  // signature carries it in `/M` in its dictionary, where PAdES puts it and
  // where `find` already read it. Neither is fatal to read — the integrity
  // check below does not depend on it.
  let time: Date | null = null;
  let policy: string | null = null;
  if (isTimestamp) {
    try {
      const info = readTstInfo(signed);
      if (!info) throw new Error('no content');
      time = info.genTime;
      policy = info.policy ?? null;
    } catch {
      return {
        ...shared,
        verdict: 'unreadable',
        ...(await signerFactsOf(signed)),
        time: null,
        policy: null,
        chain: [],
        issuers: [],
        timestamp: null,
        detail: 'The token in this file could not be read as a timestamp.',
      };
    }
  } else {
    time = signature.signingTime;
  }

  const described = {
    ...shared,
    ...(await signerFactsOf(signed)),
    time,
    policy,
    timestamp: await embeddedTimestampOf(signed),
  };

  // The library reports these different failures in different ways, and they
  // mean different things to the reader. Only a digest that does not match says
  // the file changed; the rest say something about the token.
  const noun = isTimestamp ? 'timestamp' : 'signature';
  // Until the value holds, the name, the time and any timestamp beside it are only what the file
  // says, and a real certificate copied onto a forgery must not collect a list's approval.
  const unproven = { ...shared, ...NO_SIGNER, certificateCount: described.certificateCount, time: null, policy: null, timestamp: null };
  const stamp = isTimestamp ? await readTimestampToken(signed, covered) : null;
  const outcome = isTimestamp
    ? stamp?.standing === 'holds'
      ? 'holds'
      : stamp?.standing === 'other-signature'
        ? 'digest-mismatch'
        : stamp?.standing === 'broken'
          ? 'bad-signature'
          : 'cannot-check'
    : await checkSigner(signed, 0, covered);
  switch (outcome) {
    case 'holds':
      return { ...described, verdict: 'intact', detail: '' };
    case 'bad-signature':
      return {
        ...unproven,
        verdict: 'broken',
        detail: isTimestamp
          ? 'The timestamp covers this file, but its own signature does not check out against the certificate inside it.'
          : 'The signature covers this file, but does not check out against the certificate inside it.',
      };
    case 'no-certificate':
      return {
        ...unproven,
        verdict: 'broken',
        detail: `This ${noun} does not carry the certificate it says it was made with, so nobody can be named as its signer and it cannot be checked.`,
      };
    case 'cannot-check':
      return {
        ...unproven,
        verdict: 'unreadable',
        detail: `This ${noun} uses an algorithm this browser cannot check. That says nothing either way about whether it holds.`,
      };
    case 'digest-mismatch':
      return {
        ...described,
        verdict: 'altered',
        detail: isTimestamp
          ? 'This file has changed since it was timestamped. The timestamp describes different bytes than the ones here.'
          : 'This file has changed since it was signed. The signature describes different bytes than the ones here.',
      };
  }
}
