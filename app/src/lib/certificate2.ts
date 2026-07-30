/**
 * Certificate 2 — attestation by identified signatories.
 *
 * Certificate 1 says a document existed. Certificate 2 says who put their name
 * to it. It is assembled from a *signed* PDF — normally a Certificate 1 that
 * one or more people have signed. Nothing here is specific to one jurisdiction:
 * the input is a PAdES/CMS signature, and eIDAS is the framework the wording
 * cites as its worked example, not a precondition.
 *
 * Three constraints shape the whole file:
 *
 * 1. **It never appends to the signed document.** Adding a page would push the
 *    last signature's `/ByteRange` short of the end of the file, which is
 *    exactly the condition that means "bytes nobody signed were appended". So
 *    the signed document is embedded verbatim as an attachment instead, the way
 *    Certificate 1 embeds `proof.ots`. The signed bytes stay bit-for-bit
 *    intact and independently checkable.
 *
 * 2. **It reports claims, never verdicts.** This module cannot say a signature
 *    has any particular legal status — that needs a trust list, the EU's being
 *    the one the certificate links to. The page prints what the certificates
 *    assert and names who can actually make the determination — see
 *    `DSS_SOURCE_URL` for why that is not the Commission's hosted demo.
 *
 * 3. **Only consented signers appear.** `signers` is whatever the caller passes;
 *    the consent decision belongs to the UI. Signers who withheld consent are
 *    counted, never named — a certificate that quietly omitted them would
 *    misrepresent the document.
 */
import { PDFDocument } from 'pdf-lib';

import { extractOtsAttachment } from './certificate1';
import { bytesEqual, groupHex, sha256Bytes, toHex } from './hash';
import { utcStamp } from './time';
import { parseOts, digestOf, type OtsStatus } from './ots';
import { parsePades, type PadesSignature, type QualifiedClaim } from './pades';
import {
  Cursor,
  INK,
  MARGIN,
  MUTED,
  PAGE_H,
  PAGE_W,
  loadFonts,
  drawable,
} from './pdf-layout';

/**
 * The EU's open-source reference implementation for signature validation.
 *
 * Deliberately *not* the Commission's hosted instance at
 * `.../DSS/webapp-demo/validation`: that page titles itself "DSS Demonstration
 * WebApp" and is a showcase for this library, not an operated validation
 * service. Calling it official claimed an assurance nobody gave — and pointing
 * users at it told them to upload the document to a third party, in a product
 * whose premise is that documents stay put. Naming the source instead lets the
 * check happen on their own machine.
 */
export const DSS_SOURCE_URL = 'https://github.com/esig/dss';

/** The proof's attachment name, and how the closing text recognises it. */
export const PROOF_NAME = 'proof.ots';

export const DISCLAIMER_2 =
  'This certificate lists the signatures found in what is attached to it and what their ' +
  'certificates claim. It is not a validation result: xNotary checks no trust list, so it ' +
  'cannot and does not state the legal status of any signature — in the EU, whether it is a ' +
  'qualified electronic signature. Use a validator for the framework it was issued under, as ' +
  'above. Where a law treats a signature as equivalent to a handwritten or officially ' +
  'verified one, ' +
  'that rests on conditions this certificate does not establish. Nothing here attests to what ' +
  'the document means or to the authority of any signatory.';

/** One signature, reduced to the fields Certificate 2 is allowed to print. */
export interface Certificate2Signer {
  /** As read from the signing certificate's subject. */
  readonly name: string;
  /** Which of the attached documents this signature is in. */
  readonly sourceFileName: string;
  /** The issuing CA — for a qualified signature, the QTSP. */
  readonly qtsp: string;
  /**
   * The certificate issued itself. Nobody vouched for the name on it, so it
   * must never be presented as though an authority had — see `authorityLine`.
   */
  readonly selfSigned: boolean;
  /** Best available signing time, and where it came from. */
  readonly signedAt: Date | null;
  readonly timeSource: 'timestamp' | 'claimed' | 'none';
  /** The TSA, when the time came from an RFC 3161 token. */
  readonly timestampAuthority: string | null;
  /** The token's imprint covers this signature's bytes. */
  readonly timestampMatches: boolean;
  /** The signed bytes hash to the CMS messageDigest. */
  readonly documentIntegrity: boolean;
  /** Which revision this signature covers, when the document is countersigned. */
  readonly revision: { readonly index: number; readonly of: number } | null;
  readonly qualifiedClaim: QualifiedClaim;
  readonly warnings: readonly string[];
}

export interface Certificate2Input {
  /**
   * The signed documents, embedded verbatim and never modified.
   *
   * Parallel signing — the brief's default — gives each signer their own copy
   * to sign, so several files can describe one signing round. They are only
   * pooled onto one certificate when `checkAgreement` says they are signatures
   * over the same document; see `AgreementError`.
   */
  readonly sources: readonly SignedSourceRef[];
  /** Signers who consented to appear, in source then signature order. */
  readonly signers: readonly Certificate2Signer[];
  /** Signatures present in the document whose signer withheld consent. */
  readonly withheldCount: number;
  readonly generatedAt: Date;
  /**
   * The Certificate 1 chain, when the signed document is one. Lets Certificate
   * 2 name the document that was originally notarized rather than only the
   * signed wrapper.
   */
  readonly underlying?: {
    readonly digest: Uint8Array;
    readonly otsStatus?: OtsStatus;
  };
  /**
   * The timestamp of the document that was signed, when the signed document is
   * the original rather than a Certificate 1 about it.
   *
   * This is what makes signing the contract itself worth doing: the proof
   * anchors a revision of the very file these people signed, so the certificate
   * can say the signatures are over the document, not over a statement about
   * it. Only stated for sources where `links` actually found the revision.
   */
  readonly timestamp?: TimestampEvidence;
}

/** A signed document to embed. */
export interface SignedSourceRef {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

/** One signed document, read. */
export interface SignedSource extends SignedSourceRef {
  /**
   * The document this is ultimately about, without extension — what a
   * Certificate 1 was issued *for*, not the name of the signed copy. Signers
   * rename their copies (`… — Certificate 1_sign2.pdf`), so this is read from
   * the certificate's own metadata rather than inferred from the file name.
   */
  readonly originalName: string;
  readonly digest: Uint8Array;
  /** Every signature found in this file, consented or not. */
  readonly signatures: readonly PadesSignature[];
  readonly signers: readonly Certificate2Signer[];
  /** Parse failures — signatures that could not be read at all. */
  readonly errors: readonly string[];
  /** Present when this file is an xNotary Certificate 1. */
  readonly underlying: { readonly digest: Uint8Array } | null;
}

/**
 * Whether several signed files are signatures over the *same* document.
 *
 * This is the question parallel signing forces. Listing Alice and Bob together
 * on one certificate asserts they signed the same thing; if they signed
 * different documents, pooling them produces a false statement that looks
 * exactly like a true one. So agreement is established before anything is
 * pooled, and a certificate is refused when it cannot be.
 */
export type DocumentAgreement =
  | { readonly kind: 'single' }
  /** All files carry the same OpenTimestamps proof — the strongest evidence. */
  | { readonly kind: 'agree'; readonly evidence: 'notarized-digest' | 'base-revision' }
  | { readonly kind: 'differs'; readonly detail: string };

/**
 * What the supplied PDFs contain, before any consent decision has been made.
 *
 * The UI shows this, collects a consent choice per signature, and only then
 * calls `buildCertificate2` with the subset that consented.
 */
export interface Certificate2Draft {
  readonly sources: readonly SignedSource[];
  /** Whether the sources may be pooled onto one certificate. */
  readonly agreement: DocumentAgreement;
  /** Every signer across every source, in source then signature order. */
  readonly signers: readonly Certificate2Signer[];
  /** Parse failures across all sources. */
  readonly errors: readonly string[];
  /** The notarized document all sources agree on, when there is one. */
  readonly underlying: { readonly digest: Uint8Array } | null;
  /**
   * A proof supplied alongside, when the signed document is the original rather
   * than a Certificate 1 about it. `links` says whether it actually fits.
   */
  readonly timestamp: TimestampEvidence | null;
  /** What to call the Certificate 2 built from these sources. */
  readonly suggestedFileName: string;
}

/** Raised rather than emit a certificate implying a shared signing that did not happen. */
export class AgreementError extends Error {}

/** Read one signed PDF and reduce it to what Certificate 2 is allowed to show. */
export async function analyzeSignedDocument(
  fileName: string,
  pdfBytes: Uint8Array,
): Promise<SignedSource> {
  const { signatures, errors } = await parsePades(pdfBytes);

  // If this is a Certificate 1, recover the digest of the document it notarized
  // so Certificate 2 can name the whole chain — and so parallel copies can be
  // shown to be signatures over the same thing.
  let underlying: { digest: Uint8Array } | null = null;
  const ots = await extractOtsAttachment(pdfBytes).catch(() => null);
  if (ots) {
    try {
      underlying = { digest: digestOf(parseOts(ots)) };
    } catch {
      // An attachment that is not a readable proof tells us nothing; say nothing.
    }
  }

  return {
    fileName,
    originalName: await originalDocumentName(pdfBytes, fileName),
    bytes: pdfBytes,
    digest: await sha256Bytes(pdfBytes),
    signatures,
    signers: signatures.map((sig) => toSigner(sig, signatures.length, fileName)),
    errors,
    underlying,
  };
}

/**
 * Read several signed PDFs — one signing round, parallel or sequential — and
 * decide whether they may be pooled onto a single certificate.
 */
export async function analyzeSignedDocuments(
  files: readonly SignedSourceRef[],
  proof?: TimestampProofRef,
): Promise<Certificate2Draft> {
  const sources = await Promise.all(files.map((f) => analyzeSignedDocument(f.fileName, f.bytes)));
  const agreement = checkAgreement(sources);

  let timestamp: TimestampEvidence | null = null;
  if (proof) {
    const { ots, digest } = await readTimestampProof(proof);
    timestamp = {
      ots,
      digest,
      // Status is whatever the caller establishes; nothing is claimed here.
      status: null,
      links: await Promise.all(sources.map((s) => findTimestampedRevision(s.bytes, digest))),
    };
  }

  return {
    sources,
    agreement,
    timestamp,
    signers: sources.flatMap((s) => s.signers),
    errors: sources.flatMap((s) => s.errors.map((e) => `${s.fileName}: ${e}`)),
    underlying: agreement.kind === 'differs' ? null : (sources[0]?.underlying ?? null),
    suggestedFileName: certificate2FileName(sources[0]?.originalName ?? 'document'),
  };
}

/** Certificate 2 is named after the document, not after the copy that was signed. */
export function certificate2FileName(originalName: string): string {
  return `${originalName} — Certificate 2.pdf`;
}

/**
 * Recover the name of the document a signed PDF is ultimately about.
 *
 * A Certificate 1 records it in its PDF Title, and signing appends a revision
 * without touching that — verified across singly signed, countersigned and
 * parallel-signed copies. So the metadata is authoritative, where the file name
 * is not: signers rename their copies freely.
 *
 * Falls back to the file name for signed PDFs that are not Certificate 1s, where
 * the signed document simply is the document.
 */
export async function originalDocumentName(
  pdfBytes: Uint8Array,
  sourceFileName: string,
): Promise<string> {
  try {
    const title = (await PDFDocument.load(pdfBytes, { updateMetadata: false })).getTitle();
    const match = title?.match(/^xNotary Certificate 1 [—-] (.+)$/);
    if (match?.[1]) return stripExtension(match[1].trim());
  } catch {
    // Unreadable metadata is not a reason to fail; fall through to the name.
  }

  // No usable metadata: drop a "— Certificate 1…" suffix if the signer's copy
  // carries one, so we do not end up with "X — Certificate 1 — Certificate 2".
  const base = stripExtension(sourceFileName);
  // `(?!\d)` rather than `\b`: signers append things like "_sign2", and `_` is a
  // word character, so `\b` would not fire after the "1". The lookahead still
  // stops this matching a hypothetical "Certificate 10".
  const withoutSuffix = base.replace(/\s*[—-]\s*Certificate\s*1(?!\d).*$/i, '').trim();
  return withoutSuffix || base;
}

function stripExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}

/**
 * Establish whether every source is a signature over the same document.
 *
 * Two kinds of evidence, strongest first:
 *
 * 1. **The notarized digest.** When the files are xNotary Certificate 1s they
 *    each embed an OpenTimestamps proof committing to the original document.
 *    Equal digests mean the signers signed certificates for the same document,
 *    which is precisely the claim Certificate 2 makes.
 * 2. **The base revision.** Otherwise, compare the bytes up to the first
 *    `%%EOF` — the document as it stood before anyone signed it. Signing only
 *    appends, so parallel copies share this prefix byte for byte.
 *
 * Anything else is reported as a difference rather than guessed at.
 */
export function checkAgreement(sources: readonly SignedSource[]): DocumentAgreement {
  if (sources.length <= 1) return { kind: 'single' };

  const digests = sources.map((s) => s.underlying?.digest ?? null);
  if (digests.every((d) => d !== null)) {
    const first = digests[0]!;
    const odd = sources.findIndex((_, i) => !bytesEqual(digests[i]!, first));
    return odd === -1
      ? { kind: 'agree', evidence: 'notarized-digest' }
      : {
          kind: 'differs',
          detail:
            `"${sources[odd]!.fileName}" is a certificate for a different document than ` +
            `"${sources[0]!.fileName}". These are separate signing rounds and cannot share one ` +
            `Certificate 2.`,
        };
  }

  const bases = sources.map((s) => baseRevision(s.bytes));
  const firstBase = bases[0]!;
  const odd = bases.findIndex((b) => !bytesEqual(b, firstBase));
  if (odd !== -1) {
    return {
      kind: 'differs',
      detail:
        `"${sources[odd]!.fileName}" does not start from the same document as ` +
        `"${sources[0]!.fileName}" — the bytes before the first signature differ. Signatures ` +
        `over different documents must not be listed on one certificate.`,
    };
  }
  return { kind: 'agree', evidence: 'base-revision' };
}

/**
 * The document as it stood before anyone signed: everything up to and including
 * the first `%%EOF`. Signing appends a revision rather than rewriting, so
 * parallel copies of one document share this prefix exactly.
 */
export function baseRevision(pdfBytes: Uint8Array): Uint8Array {
  const marker = new TextEncoder().encode('%%EOF');
  outer: for (let i = 0; i + marker.length <= pdfBytes.length; i++) {
    for (let j = 0; j < marker.length; j++) {
      if (pdfBytes[i + j] !== marker[j]) continue outer;
    }
    return pdfBytes.subarray(0, i + marker.length);
  }
  // No EOF marker at all: compare the whole file rather than pretend to know
  // where the first revision ended.
  return pdfBytes;
}

/**
 * What the certificate may say about a supplied timestamp, if anything.
 *
 * Only speaks for sources where the proof was actually located inside the
 * signed file. A proof that fits none of them establishes nothing about them —
 * it is still attached, so a reader can see what was offered, but the page
 * makes no claim. This is invariant 3 for the timestamp link.
 */
function timestampStatement(input: Certificate2Input): { when: string; detail: string } | null {
  const ts = input.timestamp;
  if (!ts) return null;

  const linked = ts.links.filter((l): l is TimestampLink => l !== null);
  if (linked.length === 0) return null;

  const status = ts.status;
  const when =
    status?.kind === 'confirmed'
      ? `Bitcoin block ${status.blockHeights.join(', ')} — ${utcStamp(status.blockTime)}`
      : status?.kind === 'pending'
        ? 'Accepted by an OpenTimestamps calendar, not yet in a Bitcoin block'
        : status?.kind === 'unverified' && status.blockHeights.length > 0
          ? `Attested to Bitcoin block ${status.blockHeights.join(', ')} — not independently checked`
          : 'Proof attached — not independently checked';

  const all = linked.length === ts.links.length;
  const which =
    linked[0]!.of === 1
      ? 'The document below'
      : `Revision ${linked[0]!.revision} of ${linked[0]!.of} of the document below`;

  return {
    when,
    detail:
      `${which} hashes to what the attached proof "proof.ots" commits to, so the document ` +
      `existed in this exact form before it was signed. The signatures below are over that ` +
      `document itself, not over a certificate about it.` +
      (all
        ? ''
        : ` This was established for ${linked.length} of ${ts.links.length} attached documents; ` +
          `nothing is claimed about the rest.`),
  };
}

/**
 * Where a supplied proof fits into a signed file.
 *
 * The point of the whole exercise: it says the bytes this proof timestamped are
 * a revision of the file these people signed — so the signatures are over the
 * document itself, not over a certificate about it.
 */
export interface TimestampLink {
  /** 1-based revision of the signed file whose bytes the proof anchors. */
  readonly revision: number;
  readonly of: number;
}

/** A `.ots`, or a Certificate 1 carrying one, supplied alongside the signatures. */
export interface TimestampProofRef {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

/** What a supplied proof establishes about the documents that were signed. */
export interface TimestampEvidence {
  /** The proof itself, so Certificate 2 can carry it forward. */
  readonly ots: Uint8Array;
  /** The digest the proof commits to. */
  readonly digest: Uint8Array;
  /** Only ever what was actually checked — `null` when nothing was. */
  readonly status: OtsStatus | null;
  /** Per source, in order: where the proof fits, or `null` if it does not. */
  readonly links: readonly (TimestampLink | null)[];
}

/** Pull the proof out of a `.ots` file or out of a Certificate 1 PDF. */
export async function readTimestampProof(
  ref: TimestampProofRef,
): Promise<{ ots: Uint8Array; digest: Uint8Array }> {
  const isPdf =
    ref.bytes.length > 5 && new TextDecoder().decode(ref.bytes.subarray(0, 5)) === '%PDF-';

  const ots = isPdf ? await extractOtsAttachment(ref.bytes).catch(() => null) : ref.bytes;
  if (!ots) {
    throw new Error(
      `"${ref.fileName}" carries no OpenTimestamps proof. Supply the .ots file, or the ` +
        `Certificate 1 that has one embedded.`,
    );
  }

  // `parseOts` throws on anything that is not a proof, which is the right
  // answer: a file we cannot read commits the document to nothing.
  return { ots, digest: digestOf(parseOts(ots)) };
}

/**
 * Find which revision of a signed file the proof timestamped.
 *
 * Deliberately a *search* rather than a calculation. `baseRevision` takes the
 * first `%%EOF`, which is exact for a Certificate 1 — pdf-lib writes one
 * revision — but an ordinary contract may already have been updated
 * incrementally before anyone timestamped it, and then the first `%%EOF` is not
 * the boundary. Here the digest is already known, so every candidate prefix can
 * simply be tested against it. A match is proof; no match returns `null` rather
 * than a guess.
 */
export async function findTimestampedRevision(
  pdfBytes: Uint8Array,
  expected: Uint8Array,
): Promise<TimestampLink | null> {
  const ends = revisionEnds(pdfBytes);
  for (let i = 0; i < ends.length; i++) {
    for (const length of ends[i]!) {
      if (bytesEqual(await sha256Bytes(pdfBytes.subarray(0, length)), expected)) {
        return { revision: i + 1, of: ends.length };
      }
    }
  }
  return null;
}

/**
 * Candidate end-of-revision lengths, in order.
 *
 * Each `%%EOF` yields several: writers end a file with `%%EOF`, `%%EOF\n` or
 * `%%EOF\r\n`, and the timestamp was taken over whichever of those the original
 * actually was. Testing all three costs three hashes and removes a whole class
 * of "the link should have been found but wasn't".
 */
function revisionEnds(pdfBytes: Uint8Array): number[][] {
  const marker = new TextEncoder().encode('%%EOF');
  const out: number[][] = [];

  outer: for (let i = 0; i + marker.length <= pdfBytes.length; i++) {
    for (let j = 0; j < marker.length; j++) {
      if (pdfBytes[i + j] !== marker[j]) continue outer;
    }
    const end = i + marker.length;
    out.push([end, end + 1, end + 2].filter((n) => n <= pdfBytes.length));
  }
  return out;
}

/** Reduce a parsed signature to the fields Certificate 2 may print. */
export function toSigner(
  sig: PadesSignature,
  totalSignatures: number,
  sourceFileName: string,
): Certificate2Signer {
  const timestamp = sig.signatureTimestamp;
  return {
    name: sig.signerName,
    sourceFileName,
    qtsp: sig.issuer.attrs.CN ?? sig.issuer.attrs.O ?? sig.issuer.text,
    selfSigned: sig.subject.text === sig.issuer.text,
    signedAt: timestamp?.time ?? sig.signingTime,
    timeSource: timestamp ? 'timestamp' : sig.signingTime ? 'claimed' : 'none',
    timestampAuthority: timestamp?.authority ?? null,
    timestampMatches: timestamp?.matchesSignature ?? false,
    documentIntegrity: sig.documentIntegrity,
    // Only meaningful when the document actually carries several signatures.
    revision: totalSignatures > 1 ? { index: sig.index, of: totalSignatures } : null,
    qualifiedClaim: sig.qualifiedClaim,
    warnings: sig.warnings,
  };
}

/**
 * Who, if anyone, vouched for the signer's name.
 *
 * A self-signed certificate asserts an identity on its own authority: the
 * holder chose the name themselves and no CA checked it. Printing "Certified by
 * Max Svoboda" for a certificate Max Svoboda issued to himself would imply an
 * assurance that does not exist, so say what is actually true instead.
 */
function authorityLine(signer: Certificate2Signer): string {
  return signer.selfSigned
    ? 'Self-signed certificate — no authority vouched for this name'
    : `Certified by ${signer.qtsp}`;
}

/** How the signing time should be described, given where it came from. */
function timeLine(signer: Certificate2Signer, detail: Detail = 'full'): string {
  if (!signer.signedAt) return 'No signing time is recorded in this signature';

  const when = utcStamp(signer.signedAt);
  if (signer.timeSource === 'claimed') {
    return `${when} — the signer's own claim, with no timestamp to corroborate it`;
  }
  if (!signer.timestampMatches) {
    return `${when} — from a timestamp that does NOT cover this signature`;
  }
  // TSA names run long and are what pushes an entry onto a second line, so they
  // are the first thing dropped when space is short.
  return detail === 'full'
    ? `${when} — timestamped by ${signer.timestampAuthority ?? 'an unnamed authority'}`
    : `${when} — timestamped`;
}

/**
 * The claims line, worded so it can never be read as a verdict. Exported
 * because the Attest screen must show the same thing the certificate prints:
 * the issuing authority alone reads as an assurance, and this is the sentence
 * that says what was and was not established.
 */
export function claimsLine(claim: QualifiedClaim): string {
  const asserted: string[] = [];
  if (claim.qcCompliance) asserted.push('qualified certificate');
  if (claim.qcTypeEsign) asserted.push('for electronic signature');
  if (claim.qcSSCD) asserted.push('key in a qualified device');
  if (claim.nonRepudiation) asserted.push('non-repudiation key usage');

  return asserted.length > 0
    ? `Certificate asserts: ${asserted.join('; ')} — not verified by xNotary`
    : 'Certificate asserts no qualified-signature statements';
}

function integrityLine(signer: Certificate2Signer): string {
  const parts: string[] = [
    signer.documentIntegrity
      ? 'Signed content intact'
      : 'SIGNED CONTENT DOES NOT MATCH — this signature does not verify',
  ];
  if (signer.revision && signer.revision.of > 1) {
    parts.push(`covers revision ${signer.revision.index} of ${signer.revision.of}`);
  }
  return parts.join(' · ');
}

/**
 * Vertical cost of one signer entry, at each level of detail. The layout drops
 * detail rather than dropping signers: a certificate that omitted a signatory
 * to save space would be a false statement about the document.
 */
type Detail = 'full' | 'compact';

export async function buildCertificate2(input: Certificate2Input): Promise<Uint8Array> {
  if (input.sources.length === 0) {
    throw new AgreementError('Certificate 2 needs at least one signed document to attest to.');
  }
  // Listing signers from several files together asserts they signed the same
  // document. Refuse rather than emit a false statement that looks true.
  const sources = await Promise.all(
    input.sources.map((r) => analyzeSignedDocument(r.fileName, r.bytes)),
  );
  const agreement = checkAgreement(sources);
  if (agreement.kind === 'differs') throw new AgreementError(agreement.detail);

  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);
  const ascii = (s: string) => drawable(s, fonts);

  pdf.setTitle(`xNotary Certificate 2 — ${sources[0]!.originalName}`);
  pdf.setSubject('Attestation by identified signatories');
  pdf.setProducer('xNotary');
  pdf.setCreator('xNotary (AGPL-3.0) — self-custodial notarization');
  pdf.setCreationDate(input.generatedAt);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  const pages = [page];
  const c = new Cursor(page, fonts, PAGE_H - MARGIN);

  /**
   * Continue on a fresh page. Only ever called when the next block genuinely
   * does not fit: content drawn past the bottom margin is still in the file but
   * invisible on the page, which for a certificate means a signatory silently
   * disappearing. A second page is the honest outcome.
   */
  const spill = () => {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pages.push(page);
    c.moveTo(page, PAGE_H - MARGIN);
  };

  page.drawText('Certificate 2', { x: MARGIN, y: c.y, size: 24, font: fonts.bold, color: INK });
  c.gap(20);
  page.drawText('Attestation by identified signatories', {
    x: MARGIN,
    y: c.y,
    size: 11,
    font: fonts.regular,
    color: MUTED,
  });
  c.gap(6);
  c.rule();

  const many = sources.length > 1;
  c.heading(many ? `Signed documents (${sources.length})` : 'Signed document');

  if (many) {
    // Each signer signed their own copy. Name every file and its digest so a
    // verifier can tell which attachment carries which signature. File names are
    // arbitrary length, so they get their own line rather than a label column
    // they would overrun.
    for (const source of sources) {
      c.paragraph(ascii(source.fileName), { size: 9.5 });
      c.paragraph(groupHex(toHex(source.digest)), {
        indent: 18,
        size: 8.5,
        font: fonts.mono,
        color: MUTED,
      });
      c.gap(5);
    }
    c.paragraph(
      agreement.kind === 'agree' && agreement.evidence === 'notarized-digest'
        ? 'These are separate copies signed in parallel. All of them carry the same ' +
            'OpenTimestamps proof, so every signature below is over the same notarized document.'
        : 'These are separate copies signed in parallel. They are byte-identical up to the ' +
            'first signature, so every signature below is over the same document.',
      { color: MUTED },
    );
    c.gap(4);
  } else {
    const only = sources[0]!;
    c.field('File name', ascii(only.fileName));
    c.field('File size', `${only.bytes.length.toLocaleString('en-US')} bytes`);
    c.field('SHA-256', groupHex(toHex(only.digest)), { mono: true, width: 330 });
  }

  if (input.underlying) {
    c.field('Notarized document', groupHex(toHex(input.underlying.digest)), {
      mono: true,
      width: 330,
    });
  }

  const linked = timestampStatement(input);
  if (linked) {
    c.field('Timestamped', linked.when, { width: 330 });
    c.gap(2);
    c.paragraph(linked.detail, { color: MUTED });
    c.gap(4);
  }
  c.rule();

  // ---- Signatories ------------------------------------------------------
  // Reserve what the closing sections need, then spend what is left on
  // signers at the highest detail that fits.
  const attachmentNames = [
    ...sources.map((s) => ascii(s.fileName)),
    ...(input.timestamp ? [PROOF_NAME] : []),
  ];
  const closingHeight = measureClosing(c, attachmentNames);
  // 26 for the rule that precedes the closing, 16 for the section heading.
  const budget = c.remaining - closingHeight - 26 - 16;
  const detail = chooseDetail(c, input.signers, budget, ascii);

  const count = input.signers.length;
  c.heading(`Signatories (${count}${input.withheldCount > 0 ? ` shown` : ''})`);

  if (count === 0) {
    c.paragraph(
      input.withheldCount > 0
        ? 'No signatory consented to be named on this certificate.'
        : 'No signatures were found in the attached document.',
      { color: MUTED },
    );
    c.gap(6);
  }

  for (const [i, signer] of input.signers.entries()) {
    const lines = entryLines(signer, i + 1, detail, ascii);
    if (c.remaining < entryHeight(c, lines)) spill();

    for (const line of lines) {
      c.paragraph(line.text, {
        size: line.size,
        indent: line.indent,
        font: line.bold ? fonts.bold : fonts.regular,
        color: line.bold ? INK : MUTED,
      });
      if (line.bold) c.gap(1);
    }
    c.gap(7);
  }

  if (input.withheldCount > 0) {
    const one = input.withheldCount === 1;
    c.paragraph(
      `${input.withheldCount} further signature${one ? ' is' : 's are'} present in the ` +
        `attached ${many ? 'documents' : 'document'} but ${one ? 'is' : 'are'} not listed here, ` +
        `because that signatory did not consent to being named. The ` +
        `signature${one ? '' : 's'} ${one ? 'itself remains' : 'themselves remain'} in the ` +
        `${many ? 'attachments' : 'attachment'} and can be inspected there.`,
      { color: MUTED, size: 8.5 },
    );
    c.gap(6);
  }

  if (c.remaining < closingHeight) spill();
  else c.rule();
  drawClosing(c, fonts, attachmentNames);

  for (const [i, p] of pages.entries()) {
    const footer =
      pages.length > 1
        ? `Generated locally by xNotary — open source (AGPL-3.0). Nothing was uploaded.  ` +
          `Page ${i + 1} of ${pages.length}.`
        : 'Generated locally by xNotary — open source (AGPL-3.0). Nothing was uploaded.';
    p.drawText(footer, {
      x: MARGIN,
      y: MARGIN - 18,
      size: 7.5,
      font: fonts.regular,
      color: MUTED,
    });
  }

  // The signed documents themselves. These are the payload; the page is
  // presentation. Attached verbatim so a validator sees exactly what was signed.
  for (const source of sources) {
    await pdf.attach(source.bytes, source.fileName, {
      mimeType: 'application/pdf',
      description: `A signed document this certificate describes (SHA-256 ${toHex(source.digest)})`,
      creationDate: input.generatedAt,
      modificationDate: input.generatedAt,
    });
  }

  // The proof travels with them, whether or not it could be linked: it is what
  // the timestamp claim rests on, and a reader who cannot re-check it has to
  // take this page's word for it — which is the thing this project does not ask
  // anyone to do.
  if (input.timestamp) {
    await pdf.attach(input.timestamp.ots, PROOF_NAME, {
      mimeType: 'application/octet-stream',
      description:
        `OpenTimestamps proof of the document that was signed ` +
        `(SHA-256 ${toHex(input.timestamp.digest)})`,
      creationDate: input.generatedAt,
      modificationDate: input.generatedAt,
    });
  }

  return pdf.save();
}

/**
 * One rendered line of a signatory entry.
 *
 * Measurement and drawing both read this list, so the height reserved for an
 * entry is by construction the height it occupies. When they were separate
 * functions they could drift, and a drifting estimate here means content drawn
 * below the bottom margin — present in the file, invisible on the page.
 */
interface EntryLine {
  readonly text: string;
  readonly size: number;
  readonly indent: number;
  readonly bold?: boolean;
}

function entryLines(
  signer: Certificate2Signer,
  position: number,
  detail: Detail,
  ascii: (s: string) => string,
): EntryLine[] {
  const lines: EntryLine[] = [
    { text: `${position}.  ${ascii(signer.name)}`, size: 11, indent: 0, bold: true },
    { text: ascii(authorityLine(signer)), size: 9, indent: 18 },
    { text: ascii(timeLine(signer, detail)), size: 9, indent: 18 },
  ];

  if (detail === 'full') {
    lines.push({ text: integrityLine(signer), size: 9, indent: 18 });
    lines.push({ text: claimsLine(signer.qualifiedClaim), size: 9, indent: 18 });
  } else if (!signer.documentIntegrity) {
    // Compact drops detail, never anything that would be alarming to omit.
    lines.push({ text: integrityLine(signer), size: 9, indent: 18 });
  }

  for (const warning of signer.warnings) {
    lines.push({ text: ascii(warning), size: 8.5, indent: 18 });
  }
  return lines;
}

function entryHeight(c: Cursor, lines: readonly EntryLine[]): number {
  const text = lines.reduce(
    (h, l) => h + c.measureParagraph(l.text, { size: l.size, indent: l.indent }),
    0,
  );
  // +1 for the gap after the bold name, +7 for the gap between entries.
  return text + 1 + 7;
}

/** One line of the closing sections. `mono` marks a command to be typed. */
interface ClosingLine {
  readonly text: string;
  readonly mono?: boolean;
}

/**
 * The closing sections, measured and drawn from one list.
 *
 * Someone reading this has the certificate and nothing else — no xNotary, and
 * quite possibly no idea that a PDF can carry files inside it. The attachments
 * are the whole basis of the verification, and they are invisible on the page,
 * so the instruction has to name them and say where to look. Not every viewer
 * exposes attachments at all, hence the command-line route as well.
 *
 * @param names attachment file names, already transliterated for the fonts
 */
function closingText(names: readonly string[]): {
  verify: ClosingLine[];
  disclaimer: string;
} {
  // The proof is an attachment too, but it is not a signed document — saying
  // "they are the signed documents" of a list containing proof.ots would be
  // wrong about the one file whose whole job is to be checkable.
  const hasProof = names[names.length - 1] === PROOF_NAME;
  const documents = hasProof ? names.slice(0, -1) : names;
  const many = names.length > 1;
  const manyDocs = documents.length > 1;
  const listed = names.map((n) => `"${n}"`).join(', ');

  return {
    verify: [
      {
        text:
          `1. Detach the attached ${many ? `${names.length} files` : 'file'} from this PDF: ` +
          `${listed}. The signed ${manyDocs ? 'documents are' : 'document is'} there byte for ` +
          `byte — this certificate never modified ${manyDocs ? 'them' : 'it'}` +
          (hasProof
            ? `, alongside the OpenTimestamps proof of what was signed. Check that with ` +
              `"ots verify".`
            : `.`),
      },
      {
        text:
          `${many ? 'They are' : 'It is'} inside this PDF, not on the page: open the paperclip ` +
          `or Attachments panel (Acrobat, Firefox, most readers). Chrome's built-in viewer does ` +
          `not show attachments; if yours does not either, run:`,
      },
      { text: `   pdfdetach -saveall "this-certificate.pdf"`, mono: true },
      {
        text:
          `2. Validate the signatures — xNotary makes no determination of its own. Run DSS, the ` +
          `EU's open-source reference implementation, on your own machine, so your document ` +
          `never leaves it:`,
      },
      { text: DSS_SOURCE_URL, mono: true },
      {
        text:
          `   or ask a trust provider for a validation service; in the EU only a qualified ` +
          `provider may give a qualified validation.`,
      },
    ],
    disclaimer: DISCLAIMER_2,
  };
}

function measureClosing(c: Cursor, names: readonly string[]): number {
  const { verify, disclaimer } = closingText(names);
  let h = 26 + 16; // rule + heading
  for (const line of verify) {
    h += c.measureParagraph(line.text, { size: line.mono ? 8.5 : 9 }) + 4;
  }
  h += 26 + 16; // rule + heading
  h += c.measureParagraph(disclaimer, { size: 9 });
  return h + 8;
}

function drawClosing(
  c: Cursor,
  fonts: Awaited<ReturnType<typeof loadFonts>>,
  names: readonly string[],
) {
  const { verify, disclaimer } = closingText(names);

  c.heading('How to verify this without xNotary');
  for (const line of verify) {
    c.paragraph(line.text, {
      size: line.mono ? 8.5 : 9,
      font: line.mono ? fonts.mono : fonts.regular,
    });
    c.gap(4);
  }

  c.rule();
  c.heading('What this certificate does not prove');
  c.paragraph(disclaimer, { color: MUTED });
}

/**
 * Pick the most detail that fits the space left for signatories.
 *
 * Signers are never dropped to make room — only the optional lines are, and
 * `buildCertificate2` spills to another page rather than overflow. An honest
 * second page beats an incomplete first one.
 */
function chooseDetail(
  c: Cursor,
  signers: readonly Certificate2Signer[],
  budget: number,
  ascii: (s: string) => string,
): Detail {
  const height = (detail: Detail) =>
    signers.reduce((h, s, i) => h + entryHeight(c, entryLines(s, i + 1, detail, ascii)), 0);
  return height('full') <= budget ? 'full' : 'compact';
}
