/**
 * Shared page furniture for the certificates.
 *
 * Both certificates are single A4 pages of plain text with no images beyond a
 * QR code, so this is deliberately a downward-flowing cursor rather than a
 * layout engine. The one thing it does carefully is *measure* before drawing,
 * because Certificate 2 has to decide how much detail it can afford per signer
 * to keep everything on one page.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

export const INK = rgb(0.06, 0.09, 0.16);
export const MUTED = rgb(0.42, 0.45, 0.52);
export const RULE = rgb(0.85, 0.87, 0.9);

export const MARGIN = 56;
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;

export interface Fonts {
  readonly regular: PDFFont;
  readonly bold: PDFFont;
  readonly mono: PDFFont;
}

export async function loadFonts(pdf: PDFDocument): Promise<Fonts> {
  return {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };
}

/** Minimal downward-flowing text cursor. */
export class Cursor {
  y: number;
  private page: PDFPage;

  constructor(
    page: PDFPage,
    private readonly fonts: Fonts,
    startY: number,
  ) {
    this.page = page;
    this.y = startY;
  }

  /** Continue drawing on another page, e.g. after a spill. */
  moveTo(page: PDFPage, startY: number) {
    this.page = page;
    this.y = startY;
  }

  /** Vertical space left before the bottom margin. */
  get remaining(): number {
    return this.y - MARGIN;
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

  /** Label in the left column, value in the right. */
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

    for (const line of wrap(value, font, size, maxWidth)) {
      this.page.drawText(line, { x: valueX, y: this.y, size, font, color: INK });
      this.y -= size + 3.5;
    }
    this.y -= 7;
  }

  paragraph(
    text: string,
    opts: { size?: number; color?: typeof INK; font?: PDFFont; indent?: number } = {},
  ) {
    const size = opts.size ?? 9;
    const font = opts.font ?? this.fonts.regular;
    const x = MARGIN + (opts.indent ?? 0);
    for (const line of wrap(text, font, size, PAGE_W - MARGIN - x)) {
      this.page.drawText(line, { x, y: this.y, size, font, color: opts.color ?? INK });
      this.y -= size + 3.5;
    }
  }

  /** Height `paragraph` would consume, without drawing anything. */
  measureParagraph(
    text: string,
    opts: { size?: number; font?: PDFFont; indent?: number } = {},
  ): number {
    const size = opts.size ?? 9;
    const font = opts.font ?? this.fonts.regular;
    const x = MARGIN + (opts.indent ?? 0);
    return wrap(text, font, size, PAGE_W - MARGIN - x).length * (size + 3.5);
  }

  text(
    value: string,
    opts: { size?: number; color?: typeof INK; font?: PDFFont; indent?: number } = {},
  ) {
    const size = opts.size ?? 9;
    this.page.drawText(value, {
      x: MARGIN + (opts.indent ?? 0),
      y: this.y,
      size,
      font: opts.font ?? this.fonts.regular,
      color: opts.color ?? INK,
    });
    this.y -= size + 3.5;
  }
}

export function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
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

/** Make text from a varied source safe to splice mid-paragraph. */
export function endSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * pdf-lib's standard fonts are WinAnsi-encoded and throw on anything outside
 * it. Signer names come from certificates and routinely contain characters
 * WinAnsi lacks, so they are transliterated rather than allowed to abort the
 * whole certificate.
 */
export function toWinAnsi(text: string, font: PDFFont): string {
  const out: string[] = [];
  for (const ch of text) {
    try {
      font.widthOfTextAtSize(ch, 10);
      out.push(ch);
    } catch {
      // Strip the combining marks off e.g. "ř" and keep the base letter.
      const folded = ch.normalize('NFD').replace(/\p{Diacritic}/gu, '');
      let usable = '';
      for (const c of folded) {
        try {
          font.widthOfTextAtSize(c, 10);
          usable += c;
        } catch {
          /* drop */
        }
      }
      out.push(usable || '?');
    }
  }
  return out.join('');
}
