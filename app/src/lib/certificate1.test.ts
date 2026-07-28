/**
 * Certificate 1 must be a self-contained proof: whoever receives the PDF must
 * be able to get the `.ots` back out of it. These tests pin that property,
 * because it is the difference between an independently verifiable certificate
 * and a picture of one.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  DOC_VALUE_WIDTH,
  QR_SIZE,
  VALUE_COLUMN_X,
  buildCertificate1,
  extractOtsAttachment,
} from './certificate1';
import { MARGIN, PAGE_W } from './pdf-layout';
import { sha256Bytes, toHex } from './hash';
import { pdfText } from './pdf-text.test-helper';
import type { OtsStatus } from './ots';

const referenceOts = new Uint8Array(
  readFileSync(fileURLToPath(new URL('../spikes/fixtures/reference.ots', import.meta.url))),
);

const CONFIRMED: OtsStatus = {
  kind: 'confirmed',
  blockTime: new Date('2015-05-28T15:41:18.000Z'),
  blockHeights: [358391],
  confirmedBy: ['blockstream'],
};

const PENDING: OtsStatus = {
  kind: 'pending',
  calendars: ['https://alice.btc.calendar.opentimestamps.org/'],
};

async function build(status: OtsStatus, overrides: Partial<Parameters<typeof buildCertificate1>[0]> = {}) {
  const digest = await sha256Bytes(new TextEncoder().encode('Hello World!\n'));
  return buildCertificate1({
    fileName: 'lease-agreement.pdf',
    fileSize: 128_934,
    digest,
    ots: referenceOts,
    requestedAt: new Date('2026-07-27T12:00:00.000Z'),
    status,
    ...overrides,
  });
}

describe('Certificate 1', () => {
  it('produces a valid PDF', async () => {
    const pdf = await build(CONFIRMED);
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });

  it('embeds the .ots proof byte-for-byte and can read it back', async () => {
    const pdf = await build(CONFIRMED);
    const recovered = await extractOtsAttachment(pdf);

    expect(recovered).not.toBeNull();
    expect(toHex(recovered!)).toBe(toHex(referenceOts));
  });

  it('prints the digest so it can be checked by eye or by sha256sum', async () => {
    const pdf = await build(CONFIRMED);
    const text = await pdfText(pdf);
    expect(text).toContain('03ba 204e');
    expect(text).toContain('lease-agreement.pdf');
  });

  it('states the attested block time when confirmed', async () => {
    const pdf = await build(CONFIRMED);
    const text = await pdfText(pdf);
    expect(text).toContain('358391');
    expect(text).toMatch(/Anchored in Bitcoin block/);
  });

  it('does not claim an anchor while the proof is still pending', async () => {
    const pdf = await build(PENDING);
    const text = await pdfText(pdf);
    expect(text).toMatch(/Pending/);
    expect(text).not.toMatch(/Anchored in Bitcoin block/);
  });

  it('tells the reader how to get the proof out of the PDF', async () => {
    const text = (await pdfText(await build(CONFIRMED))).replace(/\s+/g, ' ');

    expect(text).toContain('"proof.ots"');
    expect(text).toMatch(/paperclip or Attachments panel/);
    expect(text).toMatch(/Chrome's built-in viewer does not show attachments/);
    expect(text).toContain('pdfdetach -saveall');
  });

  it('returns null for a PDF with no proof attached', async () => {
    const notACertificate = new TextEncoder().encode('%PDF-1.7\nnothing here\n%%EOF');
    expect(await extractOtsAttachment(notACertificate)).toBeNull();
  });

  it('handles a long file name without corrupting the layout', async () => {
    const pdf = await build(CONFIRMED, {
      fileName: `${'very-long-name-'.repeat(12)}.pdf`,
      note: 'A note that is also quite long, to make sure wrapping does not throw.',
    });
    expect(await extractOtsAttachment(pdf)).not.toBeNull();
  });
});

/**
 * The standard PDF fonts are WinAnsi-encoded. Czech splits across that boundary:
 * "á é í ó ú ý š ž" are in CP1252, "ř ě č ů ť ň ď" are not — so a document
 * called "dílo.pdf" built fine while "balíčky.pdf" threw
 * `WinAnsi cannot encode "č"`, which looks arbitrary to whoever hit it.
 */
// The QR sits beside the Document rows, and the value column used to run under
// it: the digest — the one thing on the page that actually binds — overlapped by
// 31pt and was partly unreadable on every certificate.
describe('the Document block does not collide with the QR', () => {
  it('leaves the value column clear of the QR', () => {
    const valueEnd = VALUE_COLUMN_X + DOC_VALUE_WIDTH;
    const qrLeft = PAGE_W - MARGIN - QR_SIZE;

    expect(valueEnd).toBeLessThanOrEqual(qrLeft);
    // And not so narrow that the digest needs a third line.
    expect(qrLeft - valueEnd).toBeLessThan(40);
  });
});

describe('file names the standard fonts cannot render', () => {
  const NAMES = [
    'Smlouva o dílo.pdf',
    'Příloha č. 1.pdf',
    'CryptoNight 2026 - partnerské balíčky.pdf',
    'Žluťoučký kůň úpěl ďábelské ódy.pdf',
    'Ισμήνη.pdf',
    '合同.pdf',
  ];

  it.each(NAMES)('builds a certificate for %s', async (fileName) => {
    const pdf = await build(CONFIRMED, { fileName });
    expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe('%PDF-');
    expect(await extractOtsAttachment(pdf)).not.toBeNull();
  });

  it('builds a certificate when the note has diacritics', async () => {
    const pdf = await build(CONFIRMED, { note: 'Účetní závěrka za rok 2026 — příloha č. 3' });
    expect(await extractOtsAttachment(pdf)).not.toBeNull();
  });

  // The printed commands are how someone verifies without xNotary. A
  // transliterated name inside one is a command that fails with "file not
  // found" — worse than not printing a name at all, because it looks right.
  it('never prints a name in a command that would not work when typed', async () => {
    const text = await pdfText(await build(CONFIRMED, { fileName: 'Příloha č. 1.pdf' }));

    expect(text).not.toContain('Priloha');
    expect(text).toContain('ots verify -f "<your document>" proof.ots');
    expect(text).toContain('sha256sum "<your document>"');
  });

  it('quotes the exact name when it survives encoding', async () => {
    const text = await pdfText(await build(CONFIRMED, { fileName: 'Smlouva o dílo.pdf' }));

    expect(text).toContain('ots verify -f "Smlouva o dílo.pdf" proof.ots');
    expect(text).not.toContain('<your document>');
  });

  it('says the displayed name was changed, and where the real one is', async () => {
    const text = await pdfText(await build(CONFIRMED, { fileName: 'balíčky.pdf' }));

    expect(text).toMatch(/shown without accents/);
    expect(text).toMatch(/stored unaltered/);
  });

  it('does not add that note when nothing was changed', async () => {
    const text = await pdfText(await build(CONFIRMED, { fileName: 'contract.pdf' }));
    expect(text).not.toMatch(/shown without accents/);
  });

  // Drawn text is constrained; PDF strings are not. The exact name has to
  // survive somewhere, because Certificate 2 reads it back from the title.
  it('keeps the exact name in the PDF title, accents and all', async () => {
    const fileName = 'CryptoNight 2026 - partnerské balíčky.pdf';
    const pdf = await build(CONFIRMED, { fileName });

    const { PDFDocument } = await import('pdf-lib');
    const loaded = await PDFDocument.load(pdf, { updateMetadata: false });
    expect(loaded.getTitle()).toBe(`xNotary Certificate 1 — ${fileName}`);
  });
});

/**
 * Invariant 4: Certificate 1 must verify without xNotary. Signing appends a new
 * revision to the PDF, and if that disturbed the embedded proof the certificate
 * would stop standing on its own at exactly the moment it starts being useful.
 *
 * These fixtures are a real Certificate 1 that was really signed — once, then
 * countersigned, and separately signed again by a second party in parallel — so
 * this is measured behaviour, not a simulation of it.
 */
describe('Certificate 1 after it has been signed', () => {
  const fixture = (name: string) =>
    new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));

  const SOURCE_DIGEST = 'e3748becd853b5cc7d80d277db47208ce54b298ee4350a61f12ddcebe1a04ae9';

  it('the source document still hashes to what the certificate was issued for', async () => {
    expect(toHex(await sha256Bytes(fixture('cert1-source-document.pdf')))).toBe(SOURCE_DIGEST);
  });

  it.each(['cert1-signed-once.pdf', 'cert1-countersigned.pdf', 'cert1-parallel-b.pdf'])(
    'still yields the embedded proof from %s',
    async (name) => {
      const ots = await extractOtsAttachment(fixture(name));

      expect(ots).not.toBeNull();
      // Byte-identical to the proof in the unsigned certificate: signing appends
      // a revision, it does not rewrite what came before.
      expect(toHex(ots!)).toBe(toHex((await extractOtsAttachment(fixture('cert1-signed-once.pdf')))!));
    },
  );
});
