# PAdES parser fixtures

Signed PDFs used by `src/lib/pades.test.ts`. All of them are **generated**, by
`scripts/make-pades-fixtures.mjs` — rebuild with:

```bash
npm run fixtures:pades
```

Every certificate here is self-generated for the test run and is trusted by
nobody. There is no real personal data and no private key in this directory; the
keys exist only inside the generator process.

**Never replace one of these with a genuinely signed document.** Real documents
carry personal data — of the signer and usually of others. When one teaches us
something, reproduce the structure here and record the measurement in
`docs/qtsp-findings.md`; that is how `qtsp-shape.pdf` came about. Real documents
brought in for testing belong at the repo root, which is gitignored.

## Why these exist

The M0 fixture in `src/spikes/fixtures/signed-sample.pdf` is a signed PDF in the
easiest possible shape: one certificate in the CMS, an `issuerAndSerialNumber`
SignerInfo, ASCII names. Real qualified signatures from Czech QTSPs are not that
tidy, and `pades.ts` decides whose name appears on Certificate 2 — so the
awkward shapes are built deliberately rather than discovered later.

| File | What it exercises |
|---|---|
| `chain-ski.pdf` | SignerInfo names the signer by `subjectKeyIdentifier`, with the full chain bundled. Both halves matter: the key-identifier form needs its own matching path, and a multi-certificate bundle means there is nothing to fall back on. |
| `serial-collision.pdf` | The bundle contains a decoy certificate sharing the signer's serial number under a *different* issuer, placed first. Serial numbers are unique per issuer, not globally. |
| `diacritics-utf8.pdf` | Czech diacritics as `UTF8String`, identity split across `givenName`/`surname`, with a `CN` that also carries the certificate serial. |
| `diacritics-bmp.pdf` | The same identity encoded as `BMPString`, as older Czech certificates do. |
| `der-trailing-zero.pdf` | A CMS whose DER genuinely ends in a `0x00` byte. Writers pad `/Contents` with NUL bytes, so stripping trailing zeroes to remove the padding also truncates roughly one signature in 256. The generator searches signing times until it finds one. |
| `qtsp-shape.pdf` | The structure of a **real** PostSignum qualified signature, measured feature by feature: SHA-512, ESS `signing-certificate` v1, no `signingTime` attribute at all, a single certificate in the CMS, an RFC 3161 token from a third-party TSA, and QCStatements without QcSSCD. See `docs/qtsp-findings.md`. |
| `timestamp-foreign.pdf` | The same, except the TSA timestamped unrelated bytes. A well-formed token proves a time only if its message imprint covers *this* signature. |

## What they do not cover

Real multi-signature PDFs append a new revision rather than rewriting the file.
Producing a genuine second revision needs `@signpdf/placeholder-plain`, which is
not a dependency here, so `pades.test.ts` covers only the security-relevant
half — detecting bytes appended after signing. True multi-revision parsing stays
open until real signed documents are available; see `docs/next-session.md`.

These fixtures also say nothing about whether a signature is a *qualified*
electronic signature. That needs EUTL validation, which the MVP delegates to an
external validator — `pades.ts` reports claims, never verdicts.
