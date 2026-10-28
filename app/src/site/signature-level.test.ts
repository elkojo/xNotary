import { describe, expect, it } from 'vitest';
import { LEVELS, NOT_CHECKED, NO_CERTIFICATE, signatureLevel } from './signature-level';

describe('signatureLevel', () => {
  it('needs both statements for the top level', () => {
    expect(signatureLevel({ qualified: true, onQualifiedDevice: true })).toBe('qualified');
    expect(signatureLevel({ qualified: true, onQualifiedDevice: false })).toBe('qualified-certificate');
    expect(signatureLevel({ qualified: false, onQualifiedDevice: false })).toBe('certificate');
  });

  it('does not count a device without a qualified certificate', () => {
    expect(signatureLevel({ qualified: false, onQualifiedDevice: true })).toBe('certificate');
  });
});

describe('the wording', () => {
  const all = Object.values(LEVELS);

  it('says what the certificate says, never that anything was verified', () => {
    for (const level of all) {
      expect(level.line).toMatch(/^The certificate (says|does not say)/);
      expect(`${level.title} ${level.line} ${level.eu}`).not.toMatch(/verif|valid|confirm/i);
    }
    expect(NOT_CHECKED).toContain('not checked');
  });

  it('keeps the EU terms out of the headline and in the explanation', () => {
    for (const level of all) {
      expect(level.title).not.toMatch(/QES|AdES|eIDAS|EU\b/);
      expect(level.eu).toMatch(/^In the EU/);
    }
  });

  it('ranks the levels 3, 2, 1', () => {
    expect([LEVELS.qualified.rank, LEVELS['qualified-certificate'].rank, LEVELS.certificate.rank]).toEqual([3, 2, 1]);
  });
});

describe('no certificate', () => {
  it('sits below the three, as the absence of a signature rather than a kind of one', () => {
    expect(NO_CERTIFICATE.rank).toBe(0);
    expect(NO_CERTIFICATE.title).not.toMatch(/^Signature/);
  });

  it('claims nothing about anybody, and nothing was verified', () => {
    expect(NO_CERTIFICATE.line).toMatch(/nothing in it says who/);
    expect(`${NO_CERTIFICATE.title} ${NO_CERTIFICATE.line}`).not.toMatch(/verif|valid|confirm|qualified|electronic signature/i);
  });
});
