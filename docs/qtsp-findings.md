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
these as read-outs and link to an official validator for the actual determination.

**4. Single-certificate CMS is real.** The chain was not bundled, so the issuer-and-serial match
had to resolve on its own. It did. Note this cuts the other way from the fixtures built the week
before: `chain-ski.pdf` bundles the chain because other QTSPs do. Both shapes occur.

## What is still unverified

- **Multi-signature documents.** This document has one signature. Two or more signatures mean
  successive incremental updates, where each earlier signature covers only its own revision and
  `coversWholeDocument` is legitimately `false` for all but the last. `pades.ts` reports appended
  bytes as a warning, which would be *wrong wording* for that case. Needs a real two-signer PDF.
- **PAdES-LTA.** No DSS/VRI dictionaries or document timestamps here.
- **Bank iD.** A different QTSP with a different profile; nothing here speaks for it.
- **I.CA and eIdentity.** Likewise.

One real document closed three defects and left the list above. It is worth collecting more.
