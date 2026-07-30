/**
 * Test helper: pull the visible text out of a generated PDF.
 *
 * Two things stand between the bytes and the words. pdf-lib flate-compresses
 * content streams on save, so they have to be inflated first. And since the
 * certificates embed subsets of Liberation rather than standard fonts, the
 * text-showing operators address *glyphs*, not characters. Every viewer
 * resolves that through each font's ToUnicode CMap, and so does this.
 *
 * The CMaps are per font and cannot be merged: pdf-lib numbers each subset's
 * glyphs in the order it first draws them, so code 0x0003 is a different
 * character in the regular face than in the mono one. So this tracks which
 * font `Tf` selected and decodes with that one.
 *
 * Only good enough for the simple pages this app produces.
 */
import { PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

/** Glyph code -> the character(s) it stands for, from a ToUnicode CMap. */
type CMap = Map<number, string>;

export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: false });
  let text = '';

  for (const page of pdf.getPages()) {
    const cmaps = fontCMaps(pdf, page.node.Resources());
    for (const stream of contentStreams(pdf, page.node)) {
      text += readPage(stream, cmaps);
    }
  }
  return text;
}

const latin1 = new TextDecoder('latin1');

function inflate(obj: unknown): string | null {
  if (!(obj instanceof PDFRawStream)) return null;
  try {
    return latin1.decode(decodePDFRawStream(obj).decode());
  } catch {
    return null;
  }
}

function contentStreams(pdf: PDFDocument, node: { Contents(): unknown }): string[] {
  const contents = node.Contents();
  const refs = Array.isArray((contents as { asArray?: unknown })?.asArray)
    ? []
    : [contents];
  // `Contents` is either one stream or an array of them.
  const list =
    typeof (contents as { asArray?: () => unknown[] })?.asArray === 'function'
      ? (contents as { asArray: () => unknown[] }).asArray()
      : refs;

  const out: string[] = [];
  for (const entry of list) {
    const resolved = pdf.context.lookup(entry as never);
    const raw = inflate(resolved);
    if (raw !== null) out.push(raw);
  }
  return out;
}

/** Resource name (`F1`) -> that font's ToUnicode mapping. */
function fontCMaps(pdf: PDFDocument, resources: PDFDict | undefined): Map<string, CMap> {
  const out = new Map<string, CMap>();
  const fonts = resources?.lookup(PDFName.of('Font'), PDFDict);
  if (!fonts) return out;

  for (const [name, ref] of fonts.entries()) {
    const font = pdf.context.lookup(ref, PDFDict);
    const toUnicode = font?.get(PDFName.of('ToUnicode'));
    const raw = inflate(toUnicode && pdf.context.lookup(toUnicode));
    if (raw === null) continue;

    const cmap: CMap = new Map();
    readCMap(raw, cmap);
    out.set(name.asString().replace(/^\//, ''), cmap);
  }
  return out;
}

/**
 * Walk the operators, remembering the font `Tf` selected.
 *
 * pdf-lib emits text as hex strings, `<0003…> Tj`, but literal `(…) Tj` is
 * accepted too so this survives a pdf-lib change.
 */
function readPage(raw: string, cmaps: Map<string, CMap>): string {
  let current: CMap | undefined;
  let text = '';

  const token = /\/([^\s/<>[\]()]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f\s]*)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g;
  for (const m of raw.matchAll(token)) {
    if (m[1] !== undefined) {
      current = cmaps.get(m[1]);
    } else if (m[2] !== undefined) {
      text += `${decodeHexString(m[2], current)}\n`;
    } else if (m[3] !== undefined) {
      text += `${m[3].replace(/\\([()\\])/g, '$1')}\n`;
    }
  }
  return text;
}

/**
 * Composite fonts address glyphs with two-byte codes. Without a CMap — a page
 * drawn in a standard font — a code is its own character.
 */
function decodeHexString(hex: string, cmap: CMap | undefined): string {
  const clean = hex.replace(/\s+/g, '');
  let out = '';

  if (!cmap) {
    for (let i = 0; i + 1 < clean.length; i += 2) {
      out += String.fromCharCode(Number.parseInt(clean.slice(i, i + 2), 16));
    }
    return out;
  }

  for (let i = 0; i + 3 < clean.length; i += 4) {
    const code = Number.parseInt(clean.slice(i, i + 4), 16);
    if (Number.isNaN(code)) break;
    out += cmap.get(code) ?? '';
  }
  return out;
}

/** Parse the `bfchar` and `bfrange` sections of a ToUnicode CMap. */
function readCMap(raw: string, into: CMap) {
  for (const block of raw.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const pair of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      into.set(Number.parseInt(pair[1]!, 16), utf16BeToString(pair[2]!));
    }
  }
  for (const block of raw.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const row of block[1]!.matchAll(
      /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g,
    )) {
      const from = Number.parseInt(row[1]!, 16);
      const to = Number.parseInt(row[2]!, 16);
      const start = Number.parseInt(row[3]!, 16);
      for (let i = 0; i <= to - from; i++) into.set(from + i, String.fromCodePoint(start + i));
    }
  }
}

function utf16BeToString(hex: string): string {
  let out = '';
  for (let i = 0; i + 3 < hex.length; i += 4) {
    out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 4), 16));
  }
  return out;
}
