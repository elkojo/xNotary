# What a real qualified signature actually looks like

Measured on 2026-07-28 against a genuine PDF signed with a **PostSignum Qualified CA 4**
certificate (Česká pošta, s.p.). Until then `pades.ts` had only ever seen fixtures we wrote
ourselves, which is a bad way to learn what real inputs contain.

**The document itself is not in this repository and must not be.** It is a homeowners'
association record and carries personal data. `/​*.pdf` at the repo root is gitignored for this
reason. What it taught us lives on as `app/src/lib/fixtures/qtsp-shape.pdf`, which reproduces the
same structure with generated keys — see `app/src/lib/fixtures/README.md`.

## Measured structure

| | |
|---|---|
| SubFilter | `ETSI.CAdES.detached` |
| Digest | **SHA-512** (`sha512WithRSAEncryption`) |
| Certificates in the CMS | **1** — the chain is *not* bundled |
| SignerInfo `sid` | `issuerAndSerialNumber` |
| Signed attributes | contentType, messageDigest, **signing-certificate v1**, CMS algorithm protection |
| `signingTime` attribute | **absent** |
| Unsigned attributes | RFC 3161 signature-time-stamp-token |
| TSA | DigiCert SHA512 RSA4096 Timestamp Responder — a third party, not the QTSP |
| Revisions | 2 (`%%EOF` × 2) — the signature was added as an incremental update |
| DSS / VRI | absent — not PAdES-LTA |
| QCStatements | QcCompliance, QcPDS, QcType=esign — **no QcSSCD** |
| Certificate policy | PostSignum's own OID, not ETSI QCP-n-qscd |

## What that changed

**1. `signingTime` is optional, and real QTSP output omits it.** This is the significant one.
The signing time came only from the RFC 3161 token in the unsigned attributes. Certificate 2
would have shown no signing time at all for this signature. `pades.ts` now parses the token, and
`PadesSignature.signatureTimestamp` is the preferred source with `signingTime` as fallback.

The token is also *better* evidence than `signingTime` ever was: `signingTime` is the signer's own
clock, self-asserted and unverifiable, whereas the token is a third party's assertion
cryptographically bound to the signature bytes. So `signatureTimestamp.matchesSignature` records
whether the token's message imprint really is the hash of this signature — a token copied from
another document is still a well-formed token, and must not be reported as this signature's time.

Nothing here validates the TSA itself. Whether the responder is trusted, whether its certificate
was valid at `genTime`, and whether the token's own signature verifies are all EUTL/validator
questions the MVP delegates outward. The type says so.

**2. `signing-certificate` v1 is still in use.** EN 319 142 baseline asks for v2, and we warned
"not a PAdES-B baseline signature" when v2 was missing. PostSignum emits the RFC 2634 v1
attribute, so a perfectly good qualified signature drew a warning. Warning about correct
signatures teaches users to ignore warnings, which is worse than not warning at all. Both forms
now count as binding.

**3. A qualified certificate need not assert QcSSCD.** This certificate says, in its own policy
text, that it is a qualified certificate for electronic signature under Regulation (EU) 910/2014
— and carries no QcSSCD statement. Had we treated QcSSCD as a requirement, we would have
downgraded a real qualified signature.

This is exactly why `QualifiedClaim` reports claims rather than verdicts. `qcSSCD: false` means
*the certificate does not assert it*, not *the key was not in a QSCD*. Certificate 2 must present
these as read-outs and name who can make the actual determination.

**4. Single-certificate CMS is real.** The chain was not bundled, so the issuer-and-serial match
had to resolve on its own. It did. Note this cuts the other way from the fixtures built the week
before: `chain-ski.pdf` bundles the chain because other QTSPs do. Both shapes occur.

---

# A real Certificate 1, signed and countersigned

Measured the same day, on the product's own output: a Certificate 1 issued by xNotary, signed by
one party and then countersigned by a second. Unlike the PostSignum document above, both signing
certificates are self-signed throwaways with invented identities, so these files carry no personal
data and **are** committed — as `cert1-signed-once.pdf` and `cert1-countersigned.pdf`.

| | signed once | countersigned |
|---|---|---|
| Size | 64,608 bytes | 87,576 bytes |
| Signatures | 1 | 2 |
| Revisions (`%%EOF`) | 2 | 3 |
| Signature 1 ByteRange | `[0 11094 30034 34574]` → covers 64,608 | **unchanged** → covers 64,608 of 87,576 |
| Signature 2 ByteRange | — | `[0 68347 87167 409]` → covers 87,576 |

## Invariant 4 survives signing

The embedded `.ots` still extracts from both files, **byte-identical** to the proof in the
unsigned certificate, and still commits to the source document's digest
(`e3748bec…04ae9`). This was the open risk: signing appends a revision, and had it disturbed the
`/EF` structure, Certificate 1 would have stopped standing on its own at the moment it starts
being useful. It does not. Pinned in `certificate1.test.ts`.

The first signature is also bit-for-bit untouched by countersigning — same ByteRange, same
timestamp, imprint still matching. Countersigning appends; it does not rewrite.

## What it changed: coverage is not a per-signature question

Signature 1 covers 64,608 bytes of an 87,576-byte file, and `pades.ts` said:

> Signature covers bytes 0–64608 of a 87576-byte file; 22968 byte(s) were appended after signing.

That is ordinary countersigning described as if it were tampering. Every countersigned document
would have raised it, on every signature but the last — and a tool that cries wolf on the normal
case teaches people to ignore it, which is worse than saying nothing.

The fix is structural rather than cosmetic: whether falling short of the end of the file is benign
cannot be known from one signature alone, so the judgement moved out of `parseOne` into a
cross-signature pass in `parsePades`. `PadesSignature.supersededBy` now names the signature that
covers this one's revision, and the warning fires only when *nothing* covers the trailing bytes —
the genuinely suspicious case, where content was added after everybody had signed.

For Certificate 2 this is the difference between "Max Svoboda signed revision 1 of 2" and an
alarm. The first is true and useful; the second was neither.

## Why qualified status is not checked in the app

Measured 30 Jul 2026: `https://ec.europa.eu/tools/lotl/eu-lotl.xml` returns 200 and 465 KB, with
**no `Access-Control-Allow-Origin` header**. The browser therefore cannot fetch the EU List of
Trusted Lists from the Pages origin, and the usual remedy — a proxy — is a backend, which
invariant 2 forbids. This is the same shape of finding as `catallaxy` in the calendar list.

The only route that keeps the no-backend model is to bundle a **dated snapshot** of the LOTL and
the national trust lists at build time, and report a verdict qualified by that date. Two caveats
before anyone starts: a strict ETSI TS 119 615 determination needs the trust list status as it
stood at *signing* time, not at snapshot time; and the national lists are large, so the snapshot
would have to be trimmed to service digital identities and status history, which has not been
measured. Until then the determination belongs to the external validator, and the wording
throughout the app and on the certificate says so.

## What is still unverified

- **A qualified countersignature.** The countersigned fixture uses self-signed certificates. A
  document signed by two *qualified* certificates has still not been seen.
- **PAdES-LTA.** No DSS/VRI dictionaries or document timestamps in anything measured so far.
- **Bank iD SIGN.** Not a QTSP signature at all: the bank supplies the identity and the document
  is sealed with Bank iD's own qualified *seal*, so the signer gets an advanced signature
  (*zaručený elektronický podpis*), not a QES. Expect no QcCompliance on a personal certificate
  and possibly no personal certificate at all — worth measuring precisely because the shape
  should differ from everything here.
- **I.CA and eIdentity.** Likewise.

Two real artifacts closed four defects between them. It is worth collecting more.
