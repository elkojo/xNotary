/**
 * Certificate 1 — proof of integrity and existence at a point in time.
 *
 * A design constraint from the brief drives everything here: Certificate 1 must
 * be verifiable by a third party with standard open tools, without xNotary
 * existing. So the PDF is a *human-readable wrapper* around two things that
 * carry all the actual proof:
 *
 *   1. the SHA-256 digest of the document, in text and as a QR code, and
 *   2. the `.ots` proof itself, embedded as a PDF file attachment.
 *
 * Someone who receives only this PDF can detach the `.ots`, run
 * `ots verify -f <document> certificate.ots`, and be done. The page text tells
 * them how.
 */
import {
  PDFDict,
  PDFDocument,
  PDFFont,
  PDFName,
  PDFPage,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
  rgb,
} from 'pdf-lib';
import QRCode from 'qrcode';

import { groupHex, toHex } from './hash';
import type { OtsStatus } from './ots';

export interface Certificate1Input {
  readonly fileName: string;
  readonly fileSize: number;
  readonly digest: Uint8Array;
  readonly ots: Uint8Array;
  readonly requestedAt: Date;
  readonly status: OtsStatus;
  /** Optional note the creator attached when stamping. */
  readonly note?: string;
}

const INK = rgb(0.06, 0.09, 0.16);
const MUTED = rgb(0.42, 0.45, 0.52);
const RULE = rgb(0.85, 0.87, 0.9);

const MARGIN = 56;
const PAGE_W = 595.28;
const PAGE_H = 841.89;

export const DISCLAIMER =
  'This certificate attests that the digest above existed at the attested time. ' +
  'It says nothing about who created the document, what it means, or whether ' +
  'anyone agreed to it. It is not an electronic signature and not a qualified ' +
  'electronic timestamp within the meaning of eIDAS.';

interface Fonts {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  readonly mono: PDFFont;
}

/** Minimal downward-flowing text cursor. */
class Cursor {
  y: number;
  constructor(
    private readonly page: PDFPage,
    private readonly fonts: Fonts,
    startY: number,
  ) {
    this.y = startY;
  }

  gap(px: number) {
    this.y -= px;
  }

  rule() {
    this.y -= 10;
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.75,
      color: RULE,
    });
    this.y -= 16;
  }

  heading(text: string) {
    this.page.drawText(text.toUpperCase(), {
      x: MARGIN,
      y: this.y,
      size: 8,
      font: this.fonts.bold,
      color: MUTED,
    });
    this.y -= 16;
  }

  /** Label in the left column, value in the right. Returns height consumed. */
  field(label: string, value: string, opts: { mono?: boolean; width?: number } = {}) {
    const font = opts.mono ? this.fonts.mono : this.fonts.regular;
    const size = opts.mono ? 8.5 : 10;
    const valueX = MARGIN + 118;
    const maxWidth = opts.width ?? PAGE_W - MARGIN - valueX;

    this.page.drawText(label, {
      x: MARGIN,
      y: this.y,
      size: 9,
      font: this.fonts.regular,
      color: MUTED,
    });

    const lines = wrap(value, font, size, maxWidth);
    for (const line of lines) {
      this.page.drawText(line, { x: valueX, y: this.y, size, font, color: INK });
      this.y -= size + 3.5;
    }
    this.y -= 7;
  }

  paragraph(text: string, opts: { size?: number; color?: typeof INK; font?: PDFFont } = {}) {
    const size = opts.size ?? 9;
    const font = opts.font ?? this.fonts.regular;
    for (const line of wrap(text, font, size, PAGE_W - 2 * MARGIN)) {
      this.page.drawText(line, { x: MARGIN, y: this.y, size, font, color: opts.color ?? INK });
      this.y -= size + 3.5;
    }
  }
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(' ')) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      // A single token wider than the column (a hex digest) is hard-split.
      let rest = word;
      while (font.widthOfTextAtSize(rest, size) > maxWidth) {
        let cut = rest.length;
        while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}

/** `reason` values come from varied sources; make them safe to splice mid-paragraph. */
function endSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function statusLine(status: OtsStatus): { text: string; detail: string } {
  switch (status.kind) {
    case 'confirmed':
      return {
        text: `Anchored in Bitcoin block ${status.blockHeights.join(', ')}`,
        detail:
          `Attested time ${status.blockTime.toISOString()} ` +
          `(confirmed via ${status.confirmedBy.join(', ')}). The document existed no later ` +
          `than this block.`,
      };
    case 'pending':
      return {
        text: 'Pending — awaiting a Bitcoin block',
        detail:
          `The calendars ${status.calendars.join(', ')} have accepted the digest and ` +
          `committed to including it in a Bitcoin transaction. This normally completes ` +
          `within a few hours. Re-open this certificate in xNotary afterwards to upgrade ` +
          `the attached proof, then re-issue the certificate.`,
      };
    case 'unverified':
      // `blockHeights` is empty when the anchor is not a Bitcoin one, so the
      // heading must not assert a Bitcoin block that this proof may not have.
      return {
        text: status.blockHeights.length
          ? `Attested to Bitcoin block ${status.blockHeights.join(', ')} — not independently checked`
          : 'Attested, but not independently checked',
        detail:
          `The device that issued this certificate did not confirm the attestation itself: ` +
          `${endSentence(status.reason)} Verify it yourself with the instructions below before ` +
          `relying on the time above.`,
      };
  }
}

export async function buildCertificate1(input: Certificate1Input): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };

  pdf.setTitle(`xNotary Certificate 1 — ${input.fileName}`);
  pdf.setSubject('Proof of integrity and existence at a point in time');
  pdf.setProducer('xNotary');
  pdf.setCreator('xNotary (AGPL-3.0) — self-custodial notarization');
  pdf.setCreationDate(input.requestedAt);

  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const c = new Cursor(page, fonts, PAGE_H - MARGIN);

  page.drawText('Certificate 1', { x: MARGIN, y: c.y, size: 24, font: fonts.bold, color: INK });
  c.gap(20);
  page.drawText('Proof of integrity and existence at a point in time', {
    x: MARGIN,
    y: c.y,
    size: 11,
    font: fonts.regular,
    color: MUTED,
  });
  c.gap(6);
  c.rule();

  const digestHex = toHex(input.digest);

  c.heading('Document');
  c.field('File name', input.fileName);
  c.field('File size', `${input.fileSize.toLocaleString('en-US')} bytes`);
  if (input.note) c.field('Note', input.note);
  c.field('SHA-256', groupHex(digestHex), { mono: true, width: 300 });

  // QR of the digest, so the hash can be moved to another device by camera.
  const qrDataUrl = await QRCode.toDataURL(digestHex, {
    errorCorrectionLevel: 'M',
    margin: 0,
    scale: 6,
    color: { dark: '#0f172a', light: '#ffffff' },
  });
  const qr = await pdf.embedPng(qrDataUrl);
  const qrSize = 96;
  page.drawImage(qr, { x: PAGE_W - MARGIN - qrSize, y: c.y + 24, width: qrSize, height: qrSize });
  page.drawText('SHA-256 of the document', {
    x: PAGE_W - MARGIN - qrSize,
    y: c.y + 12,
    size: 6.5,
    font: fonts.regular,
    color: MUTED,
  });

  c.rule();

  const status = statusLine(input.status);
  c.heading('Timestamp');
  c.field('Requested', input.requestedAt.toISOString());
  c.field('Status', status.text);
  c.field('Network', 'Bitcoin, via OpenTimestamps');
  c.gap(2);
  c.paragraph(status.detail, { color: MUTED });
  c.rule();

  c.heading('How to verify this without xNotary');
  c.paragraph(
    '1. Detach the attached file "proof.ots" from this PDF. Any PDF reader that shows ' +
      'attachments can do this (in Acrobat and most readers: the paperclip / Attachments panel).',
  );
  c.gap(4);
  c.paragraph(
    '2. Install the reference OpenTimestamps client:  pip install opentimestamps-client',
    { font: fonts.mono, size: 8.5 },
  );
  c.gap(4);
  c.paragraph('3. Run, in the folder holding the original document:');
  c.gap(4);
  c.paragraph(`   ots verify -f "${input.fileName}" proof.ots`, { font: fonts.mono, size: 8.5 });
  c.gap(4);
  c.paragraph(
    'The client independently recomputes the digest, walks the proof down to a Bitcoin ' +
      'block header and reports the block time. It queries the Bitcoin network directly — ' +
      'neither xNotary nor any xNotary server is involved.',
    { color: MUTED },
  );
  c.gap(6);
  c.paragraph(
    `4. To check the digest alone: sha256sum "${input.fileName}" must print ${digestHex}`,
    { color: MUTED },
  );

  c.rule();
  c.heading('What this certificate does not prove');
  c.paragraph(DISCLAIMER, { color: MUTED });

  // Footer.
  page.drawText(
    'Generated locally by xNotary — open source (AGPL-3.0). The document never left the device.',
    { x: MARGIN, y: MARGIN - 18, size: 7.5, font: fonts.regular, color: MUTED },
  );

  // The proof itself. This is the payload; everything above is presentation.
  await pdf.attach(input.ots, 'proof.ots', {
    mimeType: 'application/vnd.opentimestamps.ots',
    description: `OpenTimestamps proof for ${input.fileName} (SHA-256 ${digestHex})`,
    creationDate: input.requestedAt,
    modificationDate: input.requestedAt,
  });

  return pdf.save();
}

/**
 * Recover the embedded `.ots` from a Certificate 1 PDF, so a signer can verify
 * a document against a certificate they were sent as a single file.
 */
export async function extractOtsAttachment(pdfBytes: Uint8Array): Promise<Uint8Array | null> {
  // Preferred path: walk the embedded-file name tree properly. PDF attachment
  // streams are flate-compressed, so they must be decoded rather than scanned.
  try {
    const fromTree = await readEmbeddedFiles(pdfBytes);
    for (const bytes of fromTree) {
      if (startsWith(bytes, OTS_MAGIC)) return bytes;
    }
  } catch {
    // Fall through — a malformed PDF should not stop us from trying the scan.
  }

  // Fallback: some producers store attachments uncompressed, and a `.ots` file
  // renamed to `.pdf` should still work rather than being rejected on a
  // technicality.
  return findOtsInRawPdf(pdfBytes);
}

/** Decode every embedded file stream in a PDF. */
async function readEmbeddedFiles(pdfBytes: Uint8Array): Promise<Uint8Array[]> {
  const pdf = await PDFDocument.load(pdfBytes, {
    throwOnInvalidObject: false,
    updateMetadata: false,
  });

  const out: Uint8Array[] = [];
  // The /EF entry of a filespec points at the actual stream. Rather than
  // navigating /Names → /EmbeddedFiles (which may be a nested name tree), sweep
  // the object map for filespecs — there are only a handful of objects here.
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const ef = obj.lookupMaybe(PDFName.of('EF'), PDFDict);
    if (!ef) continue;

    const streamRef = ef.get(PDFName.of('F')) ?? ef.get(PDFName.of('UF'));
    const stream = streamRef ? pdf.context.lookup(streamRef) : undefined;
    if (stream instanceof PDFRawStream) {
      out.push(decodePDFRawStream(stream).decode());
    }
  }
  return out;
}

function startsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix[i]) return false;
  return true;
}

const OTS_MAGIC = new Uint8Array([
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73, 0x00,
  0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94,
]);

/**
 * Locate an uncompressed `.ots` stream inside a PDF by its magic header.
 *
 * We attach the proof uncompressed-in-practice (pdf-lib stores attachments as
 * raw streams), so a byte scan is reliable and avoids pulling in a full PDF
 * object parser just for this.
 */
function findOtsInRawPdf(pdf: Uint8Array): Uint8Array | null {
  const start = indexOfBytes(pdf, OTS_MAGIC);
  if (start === -1) return null;

  // The stream ends at the next `endstream` keyword.
  const end = indexOfBytes(pdf, new TextEncoder().encode('endstream'), start);
  if (end === -1) return null;

  let stop = end;
  // Trim the EOL that precedes `endstream`.
  while (stop > start && (pdf[stop - 1] === 0x0a || pdf[stop - 1] === 0x0d)) stop--;
  return pdf.subarray(start, stop);
}

function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
