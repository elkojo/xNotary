import { readFileSync } from 'node:fs';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { DOWNLOAD_MB, PDF_EXPORT_OPTIONS, hasComments, keepsLayout, layoutStage } from './libreoffice';

const inflate = async (b: Uint8Array) => new Uint8Array(inflateRawSync(b));

/** A minimal ZIP: one local header + data per entry, a central directory, an end record. */
function zip(entries: Record<string, string>, method: 0 | 8 = 8): Uint8Array {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = enc.encode(name);
    const raw = enc.encode(text);
    const data = method === 8 ? new Uint8Array(deflateRawSync(raw)) : raw;
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + centralSize + 22);
  let at = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

describe('keepsLayout', () => {
  it('is offered for Word and OpenDocument only', () => {
    expect(keepsLayout('docx')).toBe(true);
    expect(keepsLayout('odt')).toBe(true);
    expect(keepsLayout('markdown')).toBe(false);
    expect(keepsLayout(null)).toBe(false);
  });
});

describe('PDF export options', () => {
  it('ask for PDF/A-2b and leave comments out', () => {
    expect(JSON.parse(PDF_EXPORT_OPTIONS)).toEqual({
      SelectPdfVersion: { type: 'long', value: '2' },
      ExportNotes: { type: 'boolean', value: 'false' },
    });
  });
});

describe('hasComments', () => {
  it('finds a Word comment, compressed or stored', async () => {
    const files = { 'word/document.xml': '<w:document/>', 'word/comments.xml': '<w:comments><w:comment w:id="0">x</w:comment></w:comments>' };
    expect(await hasComments(zip(files), 'docx', inflate)).toBe(true);
    expect(await hasComments(zip(files, 0), 'docx', inflate)).toBe(true);
  });

  it('says no for a Word document without comments, or with an empty comments part', async () => {
    expect(await hasComments(zip({ 'word/document.xml': '<w:document/>' }), 'docx', inflate)).toBe(false);
    expect(await hasComments(zip({ 'word/comments.xml': '<w:comments/>' }), 'docx', inflate)).toBe(false);
  });

  it('finds an OpenDocument annotation in content.xml', async () => {
    const odt = zip({ mimetype: 'application/vnd.oasis.opendocument.text', 'content.xml': '<office:text><text:p><office:annotation/></text:p></office:text>' });
    expect(await hasComments(odt, 'odt', inflate)).toBe(true);
    expect(await hasComments(zip({ 'content.xml': '<office:text/>' }), 'odt', inflate)).toBe(false);
  });

  it('says no, rather than throwing, for bytes that are not a ZIP', async () => {
    expect(await hasComments(new TextEncoder().encode('not a zip at all, just text'), 'docx', inflate)).toBe(false);
  });
});

describe('layoutStage', () => {
  it('shows the download in bytes: the one stage that is measured', () => {
    expect(layoutStage({ percent: 37, message: 'Downloading the layout converter, once', loaded: 28e6, total: 76e6 })).toEqual({
      label: 'Downloading the layout converter, once',
      loaded: 28e6,
      total: 76e6,
    });
  });

  it('names LibreOffice’s own stages in plain words, without their percentage', () => {
    expect(layoutStage({ percent: 50, message: 'Preparing to download WebAssembly...' })).toEqual({
      label: 'Starting LibreOffice',
      loaded: null,
      total: null,
    });
    expect(layoutStage({ percent: 70, message: 'Saving...' }).label).toBe('Laying out the PDF');
    expect(layoutStage({ percent: 30, message: 'Loading document...' }).label).toBe('Opening the document');
    expect(layoutStage({ percent: 95, message: 'Reading output...' }).label).toBe('Finishing');
    expect(layoutStage({ percent: 70, message: 'Ready' }).label).toBe('Starting LibreOffice');
  });

  it('says "Working" for a message it does not know, never the raw text', () => {
    expect(layoutStage({ percent: 10, message: 'Frobnicating the zorbs...' }).label).toBe('Working');
  });
});

describe('DOWNLOAD_MB', () => {
  it('is what the progress will count to, from the parts the build ships', () => {
    const bytes = ['soffice.wasm', 'soffice.data']
      .map((n) => JSON.parse(readFileSync(new URL(`../../public/vendor/libreoffice/${n}.parts.json`, import.meta.url), 'utf8')).bytes as number)
      .reduce((a, b) => a + b);
    expect(DOWNLOAD_MB).toBe(Math.round(bytes / 1024 / 1024));
  });
});
