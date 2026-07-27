/**
 * Test helper: pull the visible text out of a generated PDF.
 *
 * pdf-lib flate-compresses content streams on save, so assertions about what a
 * certificate actually *says* have to decode them first. Only good enough for
 * the simple, single-font pages this app produces.
 */
import { PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';

export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: false });
  const decoder = new TextDecoder('latin1');
  let text = '';

  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    let raw: string;
    try {
      raw = decoder.decode(decodePDFRawStream(obj).decode());
    } catch {
      continue;
    }
    // pdf-lib emits text-showing operators as hex strings, `<48656C…> Tj`,
    // but accept literal strings too so this survives a pdf-lib change.
    for (const m of raw.matchAll(/<([0-9A-Fa-f\s]*)>\s*Tj/g)) {
      const hex = m[1]!.replace(/\s+/g, '');
      let line = '';
      for (let i = 0; i + 1 < hex.length; i += 2) {
        line += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16));
      }
      text += `${line}\n`;
    }
    for (const m of raw.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)) {
      text += `${m[1]!.replace(/\\([()\\])/g, '$1')}\n`;
    }
  }
  return text;
}
