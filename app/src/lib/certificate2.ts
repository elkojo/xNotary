/**
 * Certificate 2 — attestation by identified signatories.
 *
 * Certificate 1 says a document existed. Certificate 2 says who put their name
 * to it. It is assembled from a *signed* PDF — normally a Certificate 1 that
 * has been signed by one or more people with eIDAS signatures.
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
 *    is a valid qualified electronic signature — that needs the EU Trusted
 *    Lists. The page prints what the certificates assert and sends the reader
 *    to an official validator for the determination.
 *
 * 3. **Only consented signers appear.** `signers` is whatever the caller passes;
 *    the consent decision belongs to the UI. Signers who withheld consent are
 *    counted, never named — a certificate that quietly omitted them would
 *    misrepresent the document.
 */
import { PDFDocument } from 'pdf-lib';

import { extractOtsAttachment } from './certificate1';
import { groupHex, sha256Bytes, toHex } from './hash';
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
  toWinAnsi,
} from './pdf-layout';

/** Where the EU-level determination actually happens. */
export const VALIDATOR_URL = 'https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/validation';

export const DISCLAIMER_2 =
  'This certificate lists the signatures found in the attached document and what their ' +
  'certificates claim. It is not a validation result: xNotary does not check the signing ' +
  'certificates against the EU Trusted Lists, so it cannot and does not state that any ' +
  'signature is a qualified electronic signature. Use the official validator above for that. ' +
  'Nothing here attests to what the document means or to the authority of any signatory.';

/** One signature, reduced to the fields Certificate 2 is allowed to print. */
export interface Certificate2Signer {
  /** As read from the signing certificate's subject. */
  readonly name: string;
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
  /** File name of the signed document being attested. */
  readonly sourceFileName: string;
  /** The signed document, embedded verbatim. Never modified. */
  readonly sourceBytes: Uint8Array;
  /** Signers who consented to appear. Order is the document's signature order. */
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
}

/**
 * What a signed PDF contains, before any consent decision has been made.
 *
 * The UI shows this, collects a consent choice per signature, and only then
 * calls `buildCertificate2` with the subset that consented.
 */
export interface Certificate2Draft {
  readonly sourceFileName: string;
  readonly sourceBytes: Uint8Array;
  readonly sourceDigest: Uint8Array;
  /** Every signature found, consented or not. */
  readonly signatures: readonly PadesSignature[];
  /** Per-signature view reduced to what Certificate 2 may print. */
  readonly signers: readonly Certificate2Signer[];
  /** Parse failures — signatures that could not be read at all. */
  readonly errors: readonly string[];
  /** Present when the signed document is an xNotary Certificate 1. */
  readonly underlying: { readonly digest: Uint8Array } | null;
}

/** Read a signed PDF and reduce it to what Certificate 2 is allowed to show. */
export async function analyzeSignedDocument(
  fileName: string,
  pdfBytes: Uint8Array,
): Promise<Certificate2Draft> {
  const { signatures, errors } = await parsePades(pdfBytes);

  // If this is a Certificate 1, recover the digest of the document it notarized
  // so Certificate 2 can name the whole chain.
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
    sourceFileName: fileName,
    sourceBytes: pdfBytes,
    sourceDigest: await sha256Bytes(pdfBytes),
    signatures,
    signers: signatures.map((s) => toSigner(s, signatures.length)),
    errors,
    underlying,
  };
}

/** Reduce a parsed signature to the fields Certificate 2 may print. */
export function toSigner(sig: PadesSignature, totalSignatures: number): Certificate2Signer {
  const timestamp = sig.signatureTimestamp;
  return {
    name: sig.signerName,
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

  const when = signer.signedAt.toISOString();
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

/** The claims line, worded so it can never be read as a verdict. */
function claimsLine(claim: QualifiedClaim): string {
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
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);
  const ascii = (s: string) => toWinAnsi(s, fonts.regular);

  pdf.setTitle(`xNotary Certificate 2 — ${input.sourceFileName}`);
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

  const sourceDigest = toHex(await sha256Bytes(input.sourceBytes));

  c.heading('Signed document');
  c.field('File name', ascii(input.sourceFileName));
  c.field('File size', `${input.sourceBytes.length.toLocaleString('en-US')} bytes`);
  c.field('SHA-256', groupHex(sourceDigest), { mono: true, width: 330 });
  if (input.underlying) {
    c.field('Notarized document', groupHex(toHex(input.underlying.digest)), {
      mono: true,
      width: 330,
    });
  }
  c.rule();

  // ---- Signatories ------------------------------------------------------
  // Reserve what the closing sections need, then spend what is left on
  // signers at the highest detail that fits.
  const closingHeight = measureClosing(c, input);
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
    c.paragraph(
      `${input.withheldCount} further signature${input.withheldCount === 1 ? ' is' : 's are'} ` +
        `present in the attached document but ${input.withheldCount === 1 ? 'is' : 'are'} not ` +
        `listed here, because that signatory did not consent to being named. The signature ` +
        `${input.withheldCount === 1 ? 'itself remains' : 'themselves remain'} in the ` +
        `attachment and can be inspected there.`,
      { color: MUTED, size: 8.5 },
    );
    c.gap(6);
  }

  if (c.remaining < closingHeight) spill();
  else c.rule();
  drawClosing(c, fonts, input);

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

  // The signed document itself. This is the payload; the page is presentation.
  await pdf.attach(input.sourceBytes, input.sourceFileName, {
    mimeType: 'application/pdf',
    description: `The signed document this certificate describes (SHA-256 ${sourceDigest})`,
    creationDate: input.generatedAt,
    modificationDate: input.generatedAt,
  });

  return pdf.save();
}

/** Text of the closing sections, so it can be measured and drawn identically. */
function closingText(input: Certificate2Input): { verify: string[]; disclaimer: string } {
  return {
    verify: [
      `1. Detach the attached file "${input.sourceFileName}" from this PDF. It is the signed ` +
        `document, byte for byte — this certificate never modified it.`,
      `2. Upload it to the EU DSS validator for an authoritative result:`,
      VALIDATOR_URL,
      `3. The validator checks each signing certificate against the EU Trusted Lists and ` +
        `reports whether the signature is a qualified electronic signature. That determination ` +
        `is its own, not xNotary's.`,
    ],
    disclaimer: DISCLAIMER_2,
  };
}

function measureClosing(c: Cursor, input: Certificate2Input): number {
  const { verify, disclaimer } = closingText(input);
  let h = 26 + 16; // rule + heading
  for (const line of verify) h += c.measureParagraph(line, { size: 9 }) + 4;
  h += 26 + 16; // rule + heading
  h += c.measureParagraph(disclaimer, { size: 9 });
  return h + 8;
}

function drawClosing(c: Cursor, fonts: Awaited<ReturnType<typeof loadFonts>>, input: Certificate2Input) {
  const { verify, disclaimer } = closingText(input);

  c.heading('How to verify this without xNotary');
  for (const line of verify) {
    c.paragraph(line, { size: 9, font: line === VALIDATOR_URL ? fonts.mono : fonts.regular });
    c.gap(4);
  }

  c.rule();
  c.heading('What this certificate does not prove');
  c.paragraph(disclaimer, { color: MUTED });
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
