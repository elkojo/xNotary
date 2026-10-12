/**
 * Putting a document timestamp on a finished PDF, start to end.
 *
 * The order is the whole of it, and none of it is interchangeable:
 *
 *  1. append the empty timestamp dictionary, with the token's space reserved
 *  2. write the file out, and only then measure where that space landed
 *  3. name the two stretches either side of it in `/ByteRange`
 *  4. digest those two stretches
 *  5. ask an authority to sign the digest — the next in line, if one does not answer
 *  6. write the token into the space already reserved for it
 *
 * After step 4 the file cannot change by a single byte, which is why steps 3
 * and 6 are length-preserving overwrites rather than edits.
 *
 * If step 5 fails, nothing has been written anywhere: the caller still holds
 * the untimestamped PDF and can offer it as it is.
 */
import { PDFDocument } from '@cantoo/pdf-lib';

import {
  byteRangeFor,
  digestedBytes,
  findContentsSpan,
  spliceToken,
  writeByteRange,
} from './byte-range';
import { addDocTimeStampPlaceholder } from './doctimestamp';
import { askInTurn, type Candidate, type Passed } from './in-turn';
import { sha256 } from './request';
import type { Timestamp } from './response';

export interface TimestampedPdf {
  /** The whole file: the document as it arrived, with the timestamp appended. */
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly timestamp: Timestamp;
  /** The authority that answered. */
  readonly by: Candidate;
  /** Those asked before it that did not. */
  readonly passed: readonly Passed[];
}

/** What actually goes over the network, so the interface can show it. */
export interface Outgoing {
  readonly url: string;
  /** The name it goes under on screen. */
  readonly authority: string;
  readonly digestHex: string;
  readonly requestBytes: number;
}

export interface ApplyOptions {
  /** Called before each request is sent, once the digest exists. */
  readonly onOutgoing?: (outgoing: Outgoing) => void;
}

export async function applyDocTimeStamp(
  pdf: Uint8Array,
  candidates: readonly Candidate[],
  options: ApplyOptions = {},
): Promise<TimestampedPdf> {
  // Appending, not rewriting: the bytes that came in stay exactly as they were,
  // which is what lets the timestamp describe the document as it was received.
  const doc = await PDFDocument.load(pdf, {
    updateMetadata: false,
    forIncrementalUpdate: true,
  });
  addDocTimeStampPlaceholder(doc);

  // `useObjectStreams: false` is not a preference. A signature dictionary may
  // not live inside a compressed object stream — a reader has to be able to
  // find `/Contents` in the file's plain bytes to skip over it, and so does the
  // code below.
  const withPlaceholder = await doc.commit({ useObjectStreams: false });

  const span = findContentsSpan(withPlaceholder);
  const range = byteRangeFor(span, withPlaceholder.length);
  writeByteRange(withPlaceholder, range);

  const digest = await sha256(digestedBytes(withPlaceholder, range));
  const { timestamp, by, passed } = await askInTurn(candidates, digest, options);

  spliceToken(withPlaceholder, span, timestamp.token);

  return { bytes: withPlaceholder, timestamp, by, passed };
}
