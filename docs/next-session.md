# Where things stand — handoff

**Last updated:** 2026-07-28 · on `main`

M0 and M1 are done and verified. `pades.ts` has been hardened against the awkward shapes real
qualified signatures take, and measured against genuine PostSignum output. M2 has a working first
cut: Certificate 2 is generated from a signed PDF behind a per-signature consent gate.

## State

| | |
|---|---|
| Flow A — Certificate 1 | Working end to end, verified in a real browser against dev and production builds |
| Verify-integrity screen | Working, including tamper rejection |
| Certificate library | Working, with pending → confirmed upgrade |
| PAdES parsing | Hardened; verified against one real PostSignum signature (`docs/qtsp-findings.md`) |
| Certificate 2 | First cut working — `Attest` tab, consent gate, one-page A4, document attached |
| Tests | 96 offline, all passing; type-check clean |
| Repo on GitHub | `elkojo/xNotary`, **private**, `main` pushed; CI runs on push |

## Decisions already made — don't relitigate

- **Bitcoin, not Litecoin.** Investigated and rejected; reasoning in `README.md`
  ("Why Bitcoin, and not Litecoin"). Short version: no Litecoin calendar exists any more, and
  the reference `ots` client cannot verify Litecoin attestations at all.
- **`@vitrified/typescript-opentimestamps`**, not `javascript-opentimestamps`. See
  `docs/m0-spike.md`.
- **Calendar list pinned** to alice/bob/finney; catallaxy serves no CORS header.
- **Svelte 5 + Vite 5**, hand-written service worker (Node 18 constraint).
- **BYOS** — xNotary never holds or brokers signing keys.

## Next up

### 1. Get real signed-PDF fixtures — highest residual risk, do this first

Obtain one real **I.CA** (or PostSignum/eIdentity) signed PDF and one **Bank iD**–signed PDF and
add them as fixtures. This is a data-availability problem, not a technical unknown — it needs a
request to a QTSP or a signing run, so start it early.

Four risks were identified when `pades.ts` had only the single M0 fixture behind it. Three have
since been closed with generated fixtures that reproduce the shape deliberately
(`src/lib/fixtures/`, driven by `scripts/make-pades-fixtures.mjs`):

- ~~`SignerInfo` using `subjectKeyIdentifier` with a chain-bundled CMS~~ — was a hard parse
  failure on every such signature; now resolved by key identifier, with a SHA-1-of-public-key
  fallback for certificates lacking the extension.
- ~~Matching a certificate on serial number alone~~ — serials are unique per issuer, so a
  bundled chain could attribute a signature to the wrong party. Now matches issuer *and* serial.
- ~~Czech diacritics in DN values, identity split across `givenName`/`surname`~~ — verified
  working for both `UTF8String` and `BMPString`; no code change was needed.

Also fixed along the way: stripping the `/Contents` NUL padding truncated any CMS whose DER
legitimately ended in `0x00`, roughly one signature in 256.

**One real document has since been measured** — a PostSignum-signed PDF. It closed three more
gaps and is written up in `docs/qtsp-findings.md`; the short version is that real QTSP output
carries *no* `signingTime` attribute, so the signing time now comes from the RFC 3161 token,
which `pades.ts` parses and checks against the signature bytes.

**A real Certificate 1 has also been signed and countersigned** and is committed as a fixture —
both signers used self-signed throwaway certificates, so it carries no personal data. It settled
the two questions that were blocking M2:

- **Invariant 4 survives signing.** The embedded `.ots` still extracts byte-identically from the
  signed and countersigned certificates and still commits to the source digest.
- **Countersigning is not tampering.** Coverage moved out of `parseOne` into a cross-signature
  pass; `supersededBy` names the signature covering an earlier revision, and the appended-bytes
  warning now fires only when nothing covers the trailing bytes.

**Still open, and genuinely needing more real documents:**

1. **A qualified countersignature** — the committed countersigned fixture uses self-signed
   certificates, so two *qualified* signatures on one document remain unseen.
2. **Bank iD** — a different QTSP with a different profile. Nothing measured so far speaks for it.
3. **I.CA / eIdentity** — likewise.
4. **PAdES-LTA** with DSS/VRI dictionaries and archive timestamps. Everything measured is
   PAdES-T at most.

Never commit a real document — they carry personal data, usually of people other than the
signer. `/*.pdf` at the repo root is gitignored so testing against one is safe. Reproduce what it
teaches as a generated fixture and record the measurement in `docs/qtsp-findings.md`.

### 2. M2 — Certificate 2 — **first cut done**

`src/lib/certificate2.ts` + the **Attest** tab. Signed-PDF ingestion → per-signature consent gate
(every box starts unticked) → a one-page A4 certificate naming only those who consented, with the
signed document embedded as an attachment. On-demand: no expiry, no complete/incomplete state.
Links out to the EU DSS validator; makes no qualified/not-qualified verdict of its own.

Design decisions worth not relitigating:

- **It attaches the signed PDF, it does not append a page to it.** Appending would push the last
  signature's ByteRange short of the file end — the "bytes nobody signed" condition. Attaching
  keeps the signed bytes bit-identical, which is also what the EU validator needs.
- **Withheld signers are counted, never named.** Silently omitting them would misrepresent the
  document; naming them would defeat the consent gate.
- **Self-signed certificates say so.** "Certified by X" for a certificate X issued to itself
  implies an assurance nobody gave.
- **Layout spills to page 2 rather than dropping a signatory.** Full detail fits ~6 signers on one
  page, compact ~7; beyond that it spills. Detail is sacrificed, people are not.

**Parallel signing is now supported.** The Attest tab accepts several signed PDFs — one signing
round, one file per signer — pools their signatures and attaches every file. Sequential
countersigning (one file, several signatures) works as before; no mode switch is needed, because
the shape of the input already says which it is.

Before pooling, `checkAgreement` establishes that the files really are signatures over the same
document: equal notarized digests from the embedded OpenTimestamps proofs, or failing that a
byte-identical base revision (everything up to the first `%%EOF`, since signing appends). If they
disagree, `buildCertificate2` throws `AgreementError` and the UI refuses. Listing people who
signed different documents would produce a false certificate indistinguishable from a true one.

Still to do on Certificate 2:

1. **A genuine parallel fixture.** The `notarized-digest` agreement path is tested with two real
   signed copies of one Certificate 1, and `base-revision` is tested at the unit level — but no
   fixture is a true parallel pair (one base, two files with one signature each), because that
   needs two independent signing runs. Producing one is a five-minute job for someone with a
   signing setup: take the *unsigned* Certificate 1, sign it twice separately.
2. **Library integration.** Deliberately not done — and probably should not be. The brief
   specifies on-demand assembly with no stored state, and Certificate 2 is a *view* of the signed
   PDFs rather than an artifact with its own identity. Storing the signed PDFs might make sense;
   storing the certificate reintroduces the state the design avoids. Decide before implementing.
3. **E2E coverage** — `npm run e2e` drives Flow A only.
4. **The underlying OTS status is not shown.** `Certificate2Input.underlying` carries an optional
   `otsStatus` that nothing populates yet; the certificate names the notarized document's digest
   but does not say whether that timestamp is confirmed.

### 3. M3 — Release

GitHub Pages deploy, PWA polish, onboarding/help, disclaimers, security review.

## Open items

- **GitHub repo not created.** `gh` is authenticated as `elkojo`. One command:
  `gh repo create elkojo/xNotary --public --source=. --remote=origin --push`.
  **Decide public vs private first** — the brief wants public AGPL, but the security review and
  eIDAS counsel review are both scheduled for M3. Private now, public at M3, costs nothing.
- **GitHub Pages needs enabling once** in Settings → Pages → Source: *GitHub Actions*, or
  `deploy.yml` will fail. It only fires on `v*` tags, so nothing deploys on a plain push.
- **Full `ots verify` never completed end to end.** The reference client requires a local
  Bitcoin node and won't trust a block explorer. The proof parses and commits to the right
  digest, and the Bitcoin attestation was confirmed against two explorers — but one run against
  a real node before M3 would close this properly.
- **Legal review** by Czech eIDAS counsel before public launch (not before MVP).

## Post-MVP backlog, in priority order

1. Qualified RFC 3161 timestamp (e.g. I.CA) + PAdES-LTA/LTV embedding.
2. Full in-browser QES validation against EUTL trusted lists.
3. Flow B sharing: Nostr identities, client-side encryption, Blossom storage, NIP-44/NIP-59.
4. nsite/Nostr hosting alongside GitHub Pages.
5. Bank iD Sign gateway (self-hostable) and EUDI wallet (eIDAS 2.0) adapter.
6. "Sign the original document" mode, pending counsel input.
