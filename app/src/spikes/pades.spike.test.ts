/**
 * M0 risk spike — PAdES parsing and signer-identity extraction.
 *
 * Questions this spike must answer:
 *   1. Can we find the signature(s) in a signed PDF and reconstruct exactly the
 *      bytes they cover, from browser-safe code?
 *   2. Can we verify document integrity, i.e. detect a tampered PDF?
 *   3. Can we extract signer name, issuing QTSP and signing time?
 *   4. Can we read the ETSI QCStatements that mark a certificate as qualified?
 *
 * Unlike the OTS spike this one is fully offline, so it also runs in CI as a
 * regression test for `src/lib/pades.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parsePades } from '../lib/pades';

const signedPdf = () =>
  new Uint8Array(readFileSync(fileURLToPath(new URL('./fixtures/signed-sample.pdf', import.meta.url))));

describe('M0 · PAdES', () => {
  it('Q1 — finds the signature and the bytes it covers', async () => {
    const { signatures, errors } = await parsePades(signedPdf());
    expect(errors).toEqual([]);
    expect(signatures).toHaveLength(1);

    const sig = signatures[0]!;
    expect(sig.byteRange).toHaveLength(4);
    expect(sig.coversWholeDocument).toBe(true);
    expect(sig.digestAlgorithm).toBe('SHA-256');
  });

  it('Q2 — confirms integrity of an untouched PDF', async () => {
    const { signatures } = await parsePades(signedPdf());
    expect(signatures[0]!.documentIntegrity).toBe(true);
  });

  it('Q2b — detects a tampered PDF', async () => {
    const pdf = signedPdf();
    // Flip a byte inside the signed range but outside the /Contents hole.
    pdf[200] ^= 0xff;

    const { signatures } = await parsePades(pdf);
    expect(signatures[0]!.documentIntegrity).toBe(false);
  });

  it('Q3 — extracts signer name, issuing QTSP and signing time', async () => {
    const { signatures } = await parsePades(signedPdf());
    const sig = signatures[0]!;

    expect(sig.signerName).toBe('Jan Novak');
    expect(sig.subject.attrs.serialNumber).toBe('ICA - 10123456');
    expect(sig.subject.attrs.C).toBe('CZ');

    // The issuer is what Certificate 2 shows as the QTSP.
    expect(sig.issuer.attrs.CN).toBe('xNotary Test Qualified CA 2/RSA 02/2026');
    expect(sig.issuer.attrs.O).toBe('xNotary Test QTSP a.s.');

    expect(sig.signingTime).toBeInstanceOf(Date);
    expect(sig.signingTime!.getTime()).toBeGreaterThan(Date.now() - 365 * 24 * 3600 * 1000);

    console.log({
      signer: sig.signerName,
      qtsp: sig.issuer.text,
      signedAt: sig.signingTime?.toISOString(),
      warnings: sig.warnings,
    });
  });

  it('Q4 — reads the ETSI QCStatements from the signing certificate', async () => {
    const { signatures } = await parsePades(signedPdf());
    const claim = signatures[0]!.qualifiedClaim;

    expect(claim.qcCompliance).toBe(true);
    expect(claim.qcSSCD).toBe(true);
    expect(claim.qcTypeEsign).toBe(true);
    expect(claim.nonRepudiation).toBe(true);
  });

  it('reports no signatures for an unsigned PDF instead of throwing', async () => {
    const { signatures, errors } = await parsePades(
      new TextEncoder().encode('%PDF-1.7\nnot really a pdf\n%%EOF\n'),
    );
    expect(signatures).toEqual([]);
    expect(errors).toEqual([]);
  });
});
