/**
 * Certificate 1 must be a self-contained proof: whoever receives the PDF must
 * be able to get the `.ots` back out of it. These tests pin that property,
 * because it is the difference between an independently verifiable certificate
 * and a picture of one.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { buildCertificate1, extractOtsAttachment } from './certificate1';
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
