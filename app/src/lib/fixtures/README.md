# PAdES parser fixtures

Signed PDFs used by `src/lib/pades.test.ts` and `src/lib/certificate2.test.ts`.

Most are **generated** by `scripts/make-pades-fixtures.mjs` — rebuild with:

```bash
npm run fixtures:pades
```

The `cert1-*.pdf` files are the exception and are *not* regenerated; see
[below](#the-four-that-are-not-generated).

No certificate here belongs to a real person, and there is no private key in
this directory: the generated ones exist only inside the generator process, and
the `cert1-*.pdf` signers used disposable self-signed certificates.

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

(`cert1-*.pdf` are described below — they are not generated.)

## The four that are *not* generated

`cert1-source-document.pdf`, `cert1-signed-once.pdf`, `cert1-countersigned.pdf`
and `cert1-parallel-b.pdf` are the exception, and `make-pades-fixtures.mjs` does
not produce them. They are a real xNotary Certificate 1, really signed, because
a genuine appended signature revision cannot be built offline here — that needs
`@signpdf/placeholder-plain`, which is deliberately **not** a dependency (it
drags in `pdfkit` and `crypto-js` and four critical advisories; see
`docs/next-session.md`).

They cover both signing modes:

- **Sequential** — `cert1-signed-once.pdf` then `cert1-countersigned.pdf`, the
  second built on the first, two signatures across three revisions.
- **Parallel** — `cert1-signed-once.pdf` and `cert1-parallel-b.pdf`, each one
  signature applied independently to the *same unsigned* certificate. Their base
  revisions are byte-identical at 8,080 bytes, matching the unsigned original
  exactly: real signing appends and leaves what came before untouched, which is
  what the `base-revision` agreement check relies on.

`cert1-signed-once.pdf` serves in both, and that is not a shortcut — it really
is both the first link of the sequential chain and one half of the parallel
pair.

They are safe to keep in the repository, and that is a property to preserve if
they are ever regenerated:

- Both signing certificates are **self-signed and disposable**, created minutes
  before signing, with invented identities (`Max Svoboda` of `LongRiver.cz`,
  `Jan Novak` of `Novak Enterprise`). Neither is a qualified certificate and
  neither belongs to a real person.
- The notarized document is a throwaway sample whose own text says so.

Because the certificates are self-signed, these fixtures say nothing about QTSP
identity handling — `qtsp-shape.pdf` covers that. What they cover is structure:
signatures across appended revisions in both signing modes, and an embedded
attachment that has to survive them.

They also pin **invariant 4** in `certificate1.test.ts`: the `.ots` still
extracts, byte-identical, from every signed copy. If signing ever stopped
preserving it, Certificate 1 would cease to stand on its own at the exact moment
it starts being used.

## What they still do not cover

- **PAdES-LTA** — DSS/VRI dictionaries and archive timestamps.
- **Qualified signatures on a multi-party document** — every `cert1-*.pdf`
  signer uses a self-signed certificate, so a document signed by two *qualified*
  certificates is still unseen, in either mode.
- **Bank iD, I.CA, eIdentity** profiles.

These fixtures also say nothing about whether a signature is a *qualified*
electronic signature. That needs EUTL validation, which the MVP delegates to an
external validator — `pades.ts` reports claims, never verdicts.
