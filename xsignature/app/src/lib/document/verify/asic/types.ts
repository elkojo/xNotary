/** What checking a signature container reports. */
import type { Certificate } from 'pkijs';

import { NO_SIGNER, type AttachedTimestamp, type SignerFacts } from '../signer';
import type { RevocationAnswer } from './revocation';

export type ContainerVerdict =
  /** Its signature verifies, it binds its certificate, and everything it signed still matches. */
  | 'intact'
  /** The signature verifies and says something here is not what was signed. */
  | 'altered'
  /** The signature does not verify, or names a certificate other than the one it carries. */
  | 'broken'
  /** It holds, and it signs none of the files in the container. */
  | 'covers-nothing'
  /** The check could not be completed. No claim either way. */
  | 'cannot-check'
  /** It could not be read at all. */
  | 'unreadable';

/** Things a signature carries that are not checked, each named on screen. */
export type UncheckedPart =
  /** A counter-signature nested inside a counter-signature in a CMS. */
  | 'counter-signature'
  /** An archive timestamp inside a CMS signature, whose inputs are not reassembled here. */
  | 'archive-timestamp';

export interface ContainerSignature extends SignerFacts {
  /** The file inside the container this came from. */
  readonly source: string;
  readonly form: 'XAdES' | 'CAdES' | 'timestamp';
  readonly verdict: ContainerVerdict;
  /**
   * The signer's own stated time, or for a timestamp the authority's.
   *
   * Only ever read from what the signature covers. An unsigned copy of the same
   * element beside it is ignored.
   */
  readonly time: Date | null;
  readonly timestamp: AttachedTimestamp | null;
  /** Files outside `META-INF/` this signature covers and that still match. */
  readonly covers: readonly string[];
  /** Files it signed whose bytes no longer match. */
  readonly changed: readonly string[];
  /** Files it signed that are no longer in the container. */
  readonly missing: readonly string[];
  /** Its signed details no longer match, though the signature value still verifies over the digest. */
  readonly detailsChanged: boolean;
  readonly unchecked: readonly UncheckedPart[];
  /** The index in `signatures` of the signature this counter-signs, when it does. */
  readonly counters: number | null;
  /** A counter-signature whose parent's signature value is no longer what it signed. */
  readonly counterChanged: boolean;
  /** What the signature's own embedded answers say about the signer's certificate. */
  readonly revocation: RevocationAnswer | null;
  /**
   * Archive timestamps inside this signature.
   *
   * `other-signature` here is weaker than on a signature timestamp: what they cover
   * is reassembled from many parts by rules writers have read differently, so a
   * mismatch may be this check's reading rather than damage. Never a finding.
   */
  readonly archiveTimestamps: readonly AttachedTimestamp[];
  /** In the app's own voice, for a verdict the fields above do not explain. */
  readonly detail: string;
}

export interface ContainerFile {
  readonly name: string;
  readonly bytes: Uint8Array;
  /** Indexes into `signatures`: those that hold and cover this file. */
  readonly coveredBy: readonly number[];
}

export interface CheckedContainer {
  /** Read from an unpacked folder, so nothing about the ZIP itself could be checked. */
  readonly fromFolder: boolean;
  /** What its `mimetype` entry says, when it has one. */
  readonly mediaType: string | null;
  /** The `mimetype` entry names something other than a signature container. */
  readonly unusualMediaType: boolean;
  readonly files: readonly ContainerFile[];
  readonly signatures: readonly ContainerSignature[];
  /** Archive manifests renewing the evidence for the whole container. */
  readonly archives: readonly ContainerArchive[];
  /** An evidence record is present, which this check does not read. */
  readonly uncheckedEvidence: boolean;
}

export interface ContainerArchive {
  readonly source: string;
  readonly standing: AttachedTimestamp['standing'] | 'unreadable';
  readonly time: Date | null;
  readonly signedBy: string | null;
  /** The certificate that made it, for asking whether that authority is listed. */
  readonly certificate: Certificate | null;
  /** Parts it lists whose bytes no longer match. */
  readonly changed: readonly string[];
  /** Parts it lists that are no longer in the container. */
  readonly missing: readonly string[];
  /** Whether every signature file here is among what it lists and still matches. */
  readonly coversEverySignature: boolean;
  /**
   * A later archive manifest that holds, matches, and lists this one.
   *
   * Renewal is allowed to change what an older manifest listed: evidence is added
   * to a signature file as it is renewed. So a difference here is not the alarm it
   * would be on the newest one, which nothing later accounts for.
   */
  readonly renewedBy: string | null;
}

/** Turns XML text into a DOM. The browser's by default; the tests pass their own. */
export type ParseXml = (text: string) => Document;

/** A signature nothing has been established about yet. */
export const blankSignature = (source: string, form: ContainerSignature['form']): Omit<ContainerSignature, 'verdict'> => ({
  ...NO_SIGNER,
  source,
  form,
  certificateCount: 0,
  time: null,
  timestamp: null,
  covers: [],
  changed: [],
  missing: [],
  detailsChanged: false,
  unchecked: [],
  counters: null,
  counterChanged: false,
  revocation: null,
  archiveTimestamps: [],
  detail: '',
});
