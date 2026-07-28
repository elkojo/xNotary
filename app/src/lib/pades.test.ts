/**
 * Certificate 2 is assembled from whatever `parsePades` reports, so a signature
 * attributed to the wrong person — or a valid signature this parser refuses to
 * read — becomes a false statement on a certificate. These tests pin the shapes
 * a real qualified signature can take that the M0 fixture does not cover.
 *
 * The M0 fixture (`src/spikes/pades.spike.test.ts`) is the easy case: one
 * certificate in the CMS, an issuerAndSerialNumber SignerInfo, ASCII names.
 * Fixtures here are built by `scripts/make-pades-fixtures.mjs` specifically to
 * be awkward. None of this replaces testing against genuine I.CA and Bank iD
 * documents; it makes those a confirmation rather than a discovery.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parsePades } from './pades';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));

/** Parse a fixture that is expected to yield exactly one readable signature. */
async function onlySignature(name: string) {
  const { signatures, errors } = await parsePades(fixture(name));
  expect(errors).toEqual([]);
  expect(signatures).toHaveLength(1);
  return signatures[0]!;
}

describe('signer certificate resolution', () => {
  // CMS lets a SignerInfo name the signer by key identifier instead of by
  // issuer and serial, and real QTSP signatures bundle the whole chain. The
  // combination used to be unreadable: the "just take the only certificate"
  // fallback cannot fire when several are bundled.
  it('resolves the signer when the SignerInfo names it by subjectKeyIdentifier', async () => {
    const sig = await onlySignature('chain-ski.pdf');

    expect(sig.signerName).toBe('Jan Novak');
    expect(sig.issuer.attrs.O).toBe('xNotary Test QTSP a.s.');
    expect(sig.documentIntegrity).toBe(true);
  });

  // Serial numbers are unique per issuer, not globally. This fixture bundles a
  // decoy certificate that shares the leaf's serial under a different issuer,
  // and places it first — matching on serial alone attributes the signature to
  // the wrong person.
  it('does not match a certificate on serial number alone', async () => {
    const sig = await onlySignature('serial-collision.pdf');

    expect(sig.signerName).toBe('Jan Novak');
    expect(sig.signerName).not.toBe('Someone Else');
    expect(sig.issuer.attrs.CN).toBe('xNotary Test Qualified CA 2/RSA 02/2026');
    expect(sig.documentIntegrity).toBe(true);
  });
});

describe('distinguished names', () => {
  it('reads Czech diacritics from a UTF8String subject', async () => {
    const sig = await onlySignature('diacritics-utf8.pdf');

    // Identity split across givenName/surname, with a CN that also carries the
    // certificate serial — the display name must prefer the split form.
    expect(sig.subject.attrs.GN).toBe('Jiří');
    expect(sig.subject.attrs.SN).toBe('Dvořák');
    expect(sig.signerName).toBe('Jiří Dvořák');
    expect(sig.subject.attrs.serialNumber).toBe('ICA - 10123456');
    expect(sig.subject.text).toContain('Jiří Dvořák');
  });

  it('reads Czech diacritics from a BMPString subject', async () => {
    const sig = await onlySignature('diacritics-bmp.pdf');

    expect(sig.subject.attrs.CN).toBe('Jiří Dvořák');
    expect(sig.signerName).toBe('Jiří Dvořák');
  });
});

describe('/Contents parsing', () => {
  // The signature placeholder is padded with NUL bytes, so the padding has to
  // be ignored — but stripping trailing zeroes also eats a real trailing zero
  // in the DER and truncates the last byte of the RSA signature.
  it('reads a CMS whose DER legitimately ends in 0x00', async () => {
    const sig = await onlySignature('der-trailing-zero.pdf');

    expect(sig.signerName).toBe('Jan Novak');
    expect(sig.documentIntegrity).toBe(true);
  });
});

describe('document coverage', () => {
  it('flags bytes appended after signing', async () => {
    const signed = fixture('chain-ski.pdf');
    const appended = new Uint8Array(signed.length + 32);
    appended.set(signed, 0);
    appended.set(new TextEncoder().encode('\n% appended after signing\n'), signed.length);

    const sig = (await parsePades(appended)).signatures[0]!;

    // The original revision is intact, so integrity still holds — but the
    // signature no longer covers the whole file, and that must be said.
    expect(sig.documentIntegrity).toBe(true);
    expect(sig.coversWholeDocument).toBe(false);
    expect(sig.warnings.join(' ')).toMatch(/appended after signing/);
  });
});

// This block mirrors a genuine PostSignum-signed PDF, measured feature by
// feature; see `docs/qtsp-findings.md`. The real document is not committed —
// it carries personal data — so `qtsp-shape.pdf` reproduces its shape instead.
describe('the shape a real qualified signature has', () => {
  it('parses a PostSignum-shaped signature without complaint', async () => {
    const sig = await onlySignature('qtsp-shape.pdf');

    expect(sig.documentIntegrity).toBe(true);
    expect(sig.coversWholeDocument).toBe(true);
    expect(sig.digestAlgorithm).toBe('SHA-512');
    expect(sig.signerName).toBe('Milan Novák');
    // A single certificate in the CMS: the chain is not bundled, so the
    // issuer-and-serial match has to succeed on its own.
    expect(sig.warnings).toEqual([]);
  });

  // The baseline profile asks for signing-certificate v2, but PostSignum emits
  // the RFC 2634 v1 attribute. Warning about a genuine qualified signature
  // would train users to ignore warnings.
  it('accepts ESS signing-certificate v1 as binding', async () => {
    const sig = await onlySignature('qtsp-shape.pdf');
    expect(sig.warnings.join(' ')).not.toMatch(/signing-certificate/);
  });

  // Real QTSP output carries no signingTime attribute when a token is present.
  // If Certificate 2 read only that field it would show no signing time at all.
  it('recovers the signing time from the RFC 3161 token when there is no signingTime', async () => {
    const sig = await onlySignature('qtsp-shape.pdf');

    expect(sig.signingTime).toBeNull();
    expect(sig.signatureTimestamp).not.toBeNull();
    expect(sig.signatureTimestamp!.time).toBeInstanceOf(Date);
    expect(sig.signatureTimestamp!.authority).toMatch(/Timestamp Responder/);
    expect(sig.signatureTimestamp!.warning).toBeNull();
  });

  // A token proves a time only if its imprint covers this signature's bytes.
  // One lifted from another document is still a well-formed token.
  it('reports whether the token was issued over this signature', async () => {
    expect((await onlySignature('qtsp-shape.pdf')).signatureTimestamp!.matchesSignature).toBe(true);
    expect(
      (await onlySignature('timestamp-foreign.pdf')).signatureTimestamp!.matchesSignature,
    ).toBe(false);
  });

  it('reports no timestamp for a signature that carries none', async () => {
    expect((await onlySignature('chain-ski.pdf')).signatureTimestamp).toBeNull();
  });
});

describe('qualified claims', () => {
  it('reports the ETSI QCStatements as claims on every qualified fixture', async () => {
    for (const name of ['chain-ski.pdf', 'diacritics-utf8.pdf', 'der-trailing-zero.pdf']) {
      const { qualifiedClaim } = await onlySignature(name);
      expect(qualifiedClaim).toEqual({
        qcCompliance: true,
        qcSSCD: true,
        qcTypeEsign: true,
        nonRepudiation: true,
      });
    }
  });

  // The decoy in serial-collision.pdf carries no QCStatements and no
  // nonRepudiation key usage. If certificate resolution ever regresses to
  // picking it, the claims collapse — an independent signal from the name.
  it('reads the claims from the resolved signer, not from a decoy in the bundle', async () => {
    const { qualifiedClaim } = await onlySignature('serial-collision.pdf');
    expect(qualifiedClaim.qcCompliance).toBe(true);
    expect(qualifiedClaim.nonRepudiation).toBe(true);
  });

  // Measured on a real PostSignum certificate: genuinely qualified, asserts
  // QcCompliance and QcType=esign, and does *not* assert QcSSCD. Absence of
  // QcSSCD must be reported as absence, not inferred into "not qualified" —
  // that call needs EUTL validation this module deliberately does not do.
  it('reports a missing QcSSCD without downgrading the other claims', async () => {
    const { qualifiedClaim } = await onlySignature('qtsp-shape.pdf');
    expect(qualifiedClaim).toEqual({
      qcCompliance: true,
      qcSSCD: false,
      qcTypeEsign: true,
      nonRepudiation: true,
    });
  });
});
