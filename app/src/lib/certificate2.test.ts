/**
 * Certificate 2 states who put their name to a document, so the things pinned
 * here are the ones that would make it lie: naming someone who withheld
 * consent, silently dropping a signatory to save space, presenting a claim as a
 * verdict, or modifying the signed document it attests to.
 *
 * The one-page requirement is a real constraint, not a preference — a
 * single-sheet certificate is what gets printed, filed and handed over. It is
 * enforced here for realistic signatory counts.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  DISCLAIMER_2,
  VALIDATOR_URL,
  AgreementError,
  analyzeSignedDocument,
  analyzeSignedDocuments,
  baseRevision,
  buildCertificate2,
  checkAgreement,
  type Certificate2Signer,
} from './certificate2';
import { readEmbeddedFiles } from './certificate1';
import { bytesEqual, sha256Bytes, toHex } from './hash';
import { pdfText } from './pdf-text.test-helper';

const fixture = (name: string) =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))));

const GENERATED_AT = new Date('2026-07-28T12:00:00.000Z');

/** A synthetic signer, for the cases real fixtures cannot produce. */
function signer(over: Partial<Certificate2Signer> = {}): Certificate2Signer {
  return {
    name: 'Jana Dvořáková',
    sourceFileName: 'certificate-1-signed.pdf',
    qtsp: 'PostSignum Qualified CA 4',
    selfSigned: false,
    signedAt: new Date('2026-07-28T08:20:40.000Z'),
    timeSource: 'timestamp',
    timestampAuthority: 'DigiCert Timestamp Responder',
    timestampMatches: true,
    documentIntegrity: true,
    revision: null,
    qualifiedClaim: {
      qcCompliance: true,
      qcSSCD: false,
      qcTypeEsign: true,
      nonRepudiation: true,
    },
    warnings: [],
    ...over,
  };
}

async function build(over: Partial<Parameters<typeof buildCertificate2>[0]> = {}) {
  const source = fixture('cert1-countersigned.pdf');
  return buildCertificate2({
    sources: [{ fileName: 'certificate-1-signed.pdf', bytes: source }],
    signers: [signer()],
    withheldCount: 0,
    generatedAt: GENERATED_AT,
    ...over,
  });
}

describe('reading a signed document', () => {
  it('finds both signatures and the document they notarize', async () => {
    const draft = await analyzeSignedDocument(
      'cert1-countersigned.pdf',
      fixture('cert1-countersigned.pdf'),
    );

    expect(draft.errors).toEqual([]);
    expect(draft.signers.map((s) => s.name)).toEqual(['Max Svoboda', 'Jan Novak']);

    // It is a Certificate 1, so the digest of the originally notarized document
    // is recoverable from the embedded proof.
    expect(draft.underlying).not.toBeNull();
    expect(toHex(draft.underlying!.digest)).toBe(
      'e3748becd853b5cc7d80d277db47208ce54b298ee4350a61f12ddcebe1a04ae9',
    );
  });

  it('records where each signing time came from', async () => {
    const draft = await analyzeSignedDocument('x.pdf', fixture('cert1-countersigned.pdf'));

    for (const s of draft.signers) {
      expect(s.timeSource).toBe('timestamp');
      expect(s.timestampMatches).toBe(true);
      expect(s.signedAt).toBeInstanceOf(Date);
    }
  });

  it('marks each signature with the revision it covers', async () => {
    const draft = await analyzeSignedDocument('x.pdf', fixture('cert1-countersigned.pdf'));
    expect(draft.signers.map((s) => s.revision)).toEqual([
      { index: 1, of: 2 },
      { index: 2, of: 2 },
    ]);
  });

  it('reports no revision for a document with a single signature', async () => {
    const draft = await analyzeSignedDocument('x.pdf', fixture('cert1-signed-once.pdf'));
    expect(draft.signers).toHaveLength(1);
    expect(draft.signers[0]!.revision).toBeNull();
  });

  it('falls back to the claimed time when there is no timestamp', async () => {
    const draft = await analyzeSignedDocument('x.pdf', fixture('chain-ski.pdf'));
    expect(draft.signers[0]!.timeSource).toBe('claimed');
  });
});

/**
 * Parallel signing — the brief's default — gives each signer their own copy, so
 * one signing round arrives as several files. Pooling them onto one certificate
 * asserts they signed the same document, which is a claim that has to be
 * established rather than assumed.
 *
 * `cert1-signed-once.pdf` and `cert1-parallel-b.pdf` are a genuine parallel
 * pair: one unsigned Certificate 1, signed twice independently — each signature
 * applied to the original, neither on top of the other. Both agreement paths
 * are exercised against them, including the `base-revision` fallback with the
 * OpenTimestamps evidence deliberately removed.
 */
describe('pooling several signed files', () => {
  const twoCopies = () =>
    analyzeSignedDocuments([
      { fileName: 'copy-a.pdf', bytes: fixture('cert1-signed-once.pdf') },
      { fileName: 'copy-b.pdf', bytes: fixture('cert1-countersigned.pdf') },
    ]);

  it('treats a lone file as needing no agreement', async () => {
    const draft = await analyzeSignedDocuments([
      { fileName: 'only.pdf', bytes: fixture('cert1-signed-once.pdf') },
    ]);
    expect(draft.agreement).toEqual({ kind: 'single' });
  });

  // The real parallel pair: two independent signing runs over one unsigned
  // Certificate 1. This is the brief's default signing mode.
  describe('a genuinely parallel pair', () => {
    const pair = () =>
      analyzeSignedDocuments([
        { fileName: 'signed-by-max.pdf', bytes: fixture('cert1-signed-once.pdf') },
        { fileName: 'signed-by-jan.pdf', bytes: fixture('cert1-parallel-b.pdf') },
      ]);

    it('carries one signature each, over the same unsigned certificate', async () => {
      const draft = await pair();

      expect(draft.errors).toEqual([]);
      expect(draft.sources.map((s) => s.signatures.length)).toEqual([1, 1]);
      expect(draft.signers.map((s) => [s.name, s.sourceFileName])).toEqual([
        ['Max Svoboda', 'signed-by-max.pdf'],
        ['Jan Novak', 'signed-by-jan.pdf'],
      ]);
      // Neither signer signed the other's copy, so neither covers a revision
      // of a multi-signature document.
      expect(draft.signers.every((s) => s.revision === null)).toBe(true);
      expect(draft.signers.every((s) => s.documentIntegrity)).toBe(true);
    });

    it('agrees via the OpenTimestamps proof both copies carry', async () => {
      expect((await pair()).agreement).toEqual({
        kind: 'agree',
        evidence: 'notarized-digest',
      });
    });

    // The fallback for signed documents that are not xNotary certificates. The
    // measured fact behind it: real signing appended a revision and left the
    // original 8,080 bytes untouched in both files.
    it('agrees on the base revision alone, without the proof', async () => {
      const { sources } = await pair();
      const withoutProof = sources.map((s) => ({ ...s, underlying: null }));

      expect(checkAgreement(withoutProof)).toEqual({
        kind: 'agree',
        evidence: 'base-revision',
      });
    });

    it('shares a base revision identical to the unsigned certificate', async () => {
      const a = baseRevision(fixture('cert1-signed-once.pdf'));
      const b = baseRevision(fixture('cert1-parallel-b.pdf'));

      expect(bytesEqual(a, b)).toBe(true);
      // Signing appends; it does not rewrite what came before.
      expect(a.length).toBe(8080);
    });

    it('builds one certificate naming both, with both copies attached', async () => {
      const draft = await pair();
      const built = await buildCertificate2({
        sources: draft.sources.map((s) => ({ fileName: s.fileName, bytes: s.bytes })),
        signers: draft.signers,
        withheldCount: 0,
        generatedAt: GENERATED_AT,
        underlying: draft.underlying ?? undefined,
      });

      const attached = await readEmbeddedFiles(built);
      expect(attached).toHaveLength(2);
      expect(bytesEqual(attached[0]!, fixture('cert1-signed-once.pdf'))).toBe(true);
      expect(bytesEqual(attached[1]!, fixture('cert1-parallel-b.pdf'))).toBe(true);

      const text = await pdfText(built);
      expect(text).toContain('Max Svoboda');
      expect(text).toContain('Jan Novak');
      expect(text).toMatch(/signed in parallel/);
      // Nobody countersigned anyone, so no revision wording belongs here.
      expect(text).not.toMatch(/covers revision/);
      expect((await PDFDocument.load(built)).getPageCount()).toBe(1);
    });

    it('refuses to pool a parallel copy with an unrelated signed document', async () => {
      const draft = await analyzeSignedDocuments([
        { fileName: 'signed-by-jan.pdf', bytes: fixture('cert1-parallel-b.pdf') },
        { fileName: 'unrelated.pdf', bytes: fixture('qtsp-shape.pdf') },
      ]);
      expect(draft.agreement.kind).toBe('differs');
    });
  });

  it('establishes agreement from the OpenTimestamps proof each copy carries', async () => {
    const draft = await twoCopies();
    expect(draft.agreement).toEqual({ kind: 'agree', evidence: 'notarized-digest' });
    expect(toHex(draft.underlying!.digest)).toBe(
      'e3748becd853b5cc7d80d277db47208ce54b298ee4350a61f12ddcebe1a04ae9',
    );
  });

  it('pools every signature and records which file each came from', async () => {
    const draft = await twoCopies();

    expect(draft.signers.map((s) => [s.name, s.sourceFileName])).toEqual([
      ['Max Svoboda', 'copy-a.pdf'],
      ['Max Svoboda', 'copy-b.pdf'],
      ['Jan Novak', 'copy-b.pdf'],
    ]);
  });

  it('refuses to pool signatures over different documents', async () => {
    const draft = await analyzeSignedDocuments([
      { fileName: 'certificate.pdf', bytes: fixture('cert1-signed-once.pdf') },
      { fileName: 'unrelated.pdf', bytes: fixture('chain-ski.pdf') },
    ]);

    expect(draft.agreement.kind).toBe('differs');
    // With no shared document there is nothing to name as the notarized one.
    expect(draft.underlying).toBeNull();
  });

  // The failure this guards against is silent: a certificate listing people who
  // signed different documents looks exactly like one where they did not.
  it('throws rather than build a certificate over documents that disagree', async () => {
    await expect(
      buildCertificate2({
        sources: [
          { fileName: 'certificate.pdf', bytes: fixture('cert1-signed-once.pdf') },
          { fileName: 'unrelated.pdf', bytes: fixture('chain-ski.pdf') },
        ],
        signers: [signer()],
        withheldCount: 0,
        generatedAt: GENERATED_AT,
      }),
    ).rejects.toBeInstanceOf(AgreementError);
  });

  it('refuses to build from no documents at all', async () => {
    await expect(
      buildCertificate2({
        sources: [],
        signers: [],
        withheldCount: 0,
        generatedAt: GENERATED_AT,
      }),
    ).rejects.toBeInstanceOf(AgreementError);
  });

  it('attaches every source and names them all on the page', async () => {
    const draft = await twoCopies();
    const built = await buildCertificate2({
      sources: draft.sources.map((s) => ({ fileName: s.fileName, bytes: s.bytes })),
      // One signature from each copy: the parallel case.
      signers: [draft.signers[0]!, draft.signers[2]!],
      withheldCount: 1,
      generatedAt: GENERATED_AT,
      underlying: draft.underlying ?? undefined,
    });

    const attached = await readEmbeddedFiles(built);
    expect(attached).toHaveLength(2);
    expect(bytesEqual(attached[0]!, fixture('cert1-signed-once.pdf'))).toBe(true);
    expect(bytesEqual(attached[1]!, fixture('cert1-countersigned.pdf'))).toBe(true);

    const text = await pdfText(built);
    expect(text).toContain('copy-a.pdf');
    expect(text).toContain('copy-b.pdf');
    expect(text).toContain('Max Svoboda');
    expect(text).toContain('Jan Novak');
    expect(text).toMatch(/signed in parallel/);
    expect((await PDFDocument.load(built)).getPageCount()).toBe(1);
  });
});

describe('baseRevision', () => {
  // Signing appends a revision rather than rewriting, so copies of one document
  // signed independently share every byte up to the first %%EOF.
  it('returns the bytes up to and including the first %%EOF', () => {
    const pdf = new TextEncoder().encode('%PDF-1.7\nbody\n%%EOF\nappended revision\n%%EOF\n');
    expect(new TextDecoder().decode(baseRevision(pdf))).toBe('%PDF-1.7\nbody\n%%EOF');
  });

  it('agrees across the signed and countersigned copies of one certificate', () => {
    // The countersigned file is the signed-once file plus another revision.
    expect(
      bytesEqual(
        baseRevision(fixture('cert1-signed-once.pdf')),
        baseRevision(fixture('cert1-countersigned.pdf')),
      ),
    ).toBe(true);
  });

  it('falls back to the whole file when there is no EOF marker', () => {
    const bytes = new TextEncoder().encode('not a pdf at all');
    expect(bytesEqual(baseRevision(bytes), bytes)).toBe(true);
  });
});

describe('the signed document is never modified', () => {
  it('embeds it byte-for-byte as an attachment', async () => {
    const source = fixture('cert1-countersigned.pdf');
    const cert2 = await build();

    // Attaching, rather than appending a page, is what keeps the last
    // signature's ByteRange covering the whole signed file.
    const loaded = await PDFDocument.load(cert2);
    expect(loaded.getPageCount()).toBeGreaterThan(0);

    const attached = await readEmbeddedFiles(cert2);
    expect(attached).toHaveLength(1);
    expect(bytesEqual(attached[0]!, source)).toBe(true);
  });

  it('prints the digest of exactly what it attached', async () => {
    const cert2 = await build();
    const digest = toHex(await sha256Bytes(fixture('cert1-countersigned.pdf')));
    const text = await pdfText(cert2);

    // Grouped four characters at a time on the page.
    expect(text.replace(/\s+/g, '')).toContain(digest);
  });
});

describe('consent', () => {
  it('names only the signers it was given', async () => {
    const cert2 = await build({
      signers: [signer({ name: 'Consenting Signer' })],
      withheldCount: 1,
    });
    const text = await pdfText(cert2);

    expect(text).toContain('Consenting Signer');
    expect(text).not.toContain('Max Svoboda');
    expect(text).not.toContain('Jan Novak');
  });

  it('discloses that a withheld signature exists without naming it', async () => {
    const text = await pdfText(await build({ withheldCount: 1 }));
    expect(text).toMatch(/1 further signature is present/);
    expect(text).toMatch(/did not consent/);
  });

  it('says so plainly when nobody consented', async () => {
    const text = await pdfText(await build({ signers: [], withheldCount: 2 }));
    expect(text).toMatch(/No signatory consented/);
  });

  it('distinguishes no consent from no signatures', async () => {
    const text = await pdfText(await build({ signers: [], withheldCount: 0 }));
    expect(text).toMatch(/No signatures were found/);
  });
});

describe('claims are never presented as verdicts', () => {
  it('marks the certificate assertions as unverified by xNotary', async () => {
    const text = await pdfText(await build());
    expect(text).toMatch(/Certificate asserts:.*not verified by xNotary/s);
  });

  it('never calls a signature qualified on its own authority', async () => {
    const flat = (await pdfText(await build())).replace(/\s+/g, ' ');

    // The phrase may appear on the page, but only where it is attributed to the
    // external validator or explicitly disclaimed — never as xNotary's finding.
    const sentences = flat.split(/(?<=\.)\s+/).filter((s) => /qualified electronic signature/i.test(s));
    expect(sentences.length).toBeGreaterThan(0);
    for (const sentence of sentences) {
      expect(sentence).toMatch(/validator|does not|cannot|not xNotary/i);
    }

    expect(flat).toContain(DISCLAIMER_2.replace(/\s+/g, ' ').slice(0, 80));
  });

  it('sends the reader to the official validator', async () => {
    const text = await pdfText(await build());
    expect(text).toContain(VALIDATOR_URL);
  });

  it('reports a certificate that asserts nothing as asserting nothing', async () => {
    const text = await pdfText(
      await build({
        signers: [
          signer({
            qualifiedClaim: {
              qcCompliance: false,
              qcSSCD: false,
              qcTypeEsign: false,
              nonRepudiation: false,
            },
          }),
        ],
      }),
    );
    expect(text).toMatch(/asserts no qualified-signature statements/);
  });

  it('states plainly when a signature does not verify', async () => {
    const text = await pdfText(await build({ signers: [signer({ documentIntegrity: false })] }));
    expect(text).toMatch(/DOES NOT MATCH/);
  });

  it('flags a timestamp that does not cover the signature', async () => {
    const text = await pdfText(
      await build({ signers: [signer({ timestampMatches: false })] }),
    );
    expect(text).toMatch(/does NOT cover this signature/i);
  });

  it('does not dress up a self-claimed time as a timestamp', async () => {
    const text = await pdfText(
      await build({
        signers: [signer({ timeSource: 'claimed', timestampAuthority: null })],
      }),
    );
    expect(text).toMatch(/signer's own claim/);
  });
});

describe('self-signed certificates', () => {
  // Both signers in the real fixture issued their own certificates. Saying
  // "Certified by Max Svoboda" about a certificate Max Svoboda signed himself
  // would imply an assurance nobody gave.
  it('detects a self-issued certificate', async () => {
    const draft = await analyzeSignedDocument('x.pdf', fixture('cert1-countersigned.pdf'));
    expect(draft.signers.map((s) => s.selfSigned)).toEqual([true, true]);
  });

  it('does not claim an authority certified a self-signed name', async () => {
    const text = await pdfText(
      await build({ signers: [signer({ name: 'Solo Signer', selfSigned: true })] }),
    );
    expect(text).toMatch(/Self-signed certificate . no authority vouched/);
    expect(text).not.toMatch(/Certified by/);
  });

  it('names the issuing authority when there is one', async () => {
    const text = await pdfText(await build({ signers: [signer({ selfSigned: false })] }));
    expect(text).toMatch(/Certified by PostSignum Qualified CA 4/);
  });
});

describe('one A4 page', () => {
  it.each([1, 2, 3, 4, 5, 6])('fits %i signatories on a single page', async (n) => {
    const signers = Array.from({ length: n }, (_, i) =>
      signer({ name: `Signatory Number ${i + 1}` }),
    );
    const doc = await PDFDocument.load(await build({ signers }));

    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  // Detail is what gets sacrificed for space, never a signatory: a certificate
  // that omitted someone to fit would misstate who signed.
  it('keeps every signatory named even when detail must be dropped', async () => {
    const signers = Array.from({ length: 9 }, (_, i) =>
      signer({ name: `Signatory Number ${i + 1}` }),
    );
    const text = await pdfText(await build({ signers }));

    for (let i = 1; i <= 9; i++) expect(text).toContain(`Signatory Number ${i}`);
  });

  // Regression: entries used to keep flowing past the bottom margin. The text
  // stayed in the content stream — so extracting it still found every name —
  // while the last few signatories were drawn off the visible page. Presence in
  // the file is not presence on the certificate, so assert the page count grew.
  it.each([
    [9, 2],
    [20, 2],
    [40, 4],
  ])('spills %i signatories onto %i pages rather than off the page', async (n, pages) => {
    const signers = Array.from({ length: n }, (_, i) =>
      signer({ name: `Signatory Number ${i + 1}` }),
    );
    const built = await build({ signers });

    expect((await PDFDocument.load(built)).getPageCount()).toBe(pages);

    const text = await pdfText(built);
    for (let i = 1; i <= n; i++) expect(text).toContain(`Signatory Number ${i}`);
  });

  it('still warns about a broken signature in compact mode', async () => {
    const signers = Array.from({ length: 9 }, (_, i) =>
      signer({ name: `Signatory Number ${i + 1}`, documentIntegrity: i === 4 }),
    );
    const text = await pdfText(await build({ signers }));
    expect(text).toMatch(/DOES NOT MATCH/);
  });
});

describe('end to end from a real countersigned certificate', () => {
  it('builds a one-page certificate naming both real signers', async () => {
    const draft = await analyzeSignedDocuments([
      { fileName: 'cert1-countersigned.pdf', bytes: fixture('cert1-countersigned.pdf') },
    ]);

    const cert2 = await buildCertificate2({
      sources: draft.sources.map((s) => ({ fileName: s.fileName, bytes: s.bytes })),
      signers: draft.signers,
      withheldCount: 0,
      generatedAt: GENERATED_AT,
      underlying: draft.underlying ?? undefined,
    });

    const doc = await PDFDocument.load(cert2);
    expect(doc.getPageCount()).toBe(1);

    const text = await pdfText(cert2);
    expect(text).toContain('Max Svoboda');
    expect(text).toContain('Jan Novak');
    expect(text).toMatch(/covers revision 1 of 2/);
    expect(text).toMatch(/covers revision 2 of 2/);
  });
});

describe('names outside WinAnsi', () => {
  it('does not abort on a signer name the standard fonts cannot encode', async () => {
    // pdf-lib's standard fonts throw on unencodable characters; a Czech or
    // Greek name must not take the whole certificate down.
    const cert2 = await build({ signers: [signer({ name: 'Ισμήνη Παπαδοπούλου' })] });
    expect((await PDFDocument.load(cert2)).getPageCount()).toBe(1);
  });
});
