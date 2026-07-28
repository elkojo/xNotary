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
| Tests | 125 offline, all passing; type-check clean |
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
- **Layout spills to page 2 rather than dropping a signatory.** Five signatories fit on one page;
  beyond that it spills. Detail is sacrificed, people are not. The threshold dropped from six when
  the attachment guidance was added — deliberately: a reader who cannot find the attachments
  cannot verify anything at all, so the guidance is worth more than a sixth slot.

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

1. ~~**A genuine parallel fixture.**~~ **Done.** `cert1-signed-once.pdf` and
   `cert1-parallel-b.pdf` are a real pair: one unsigned Certificate 1, signed twice
   independently. Both agreement paths are now tested against real files, including
   `base-revision` with the OpenTimestamps evidence stripped.

   The measured fact it established: both signing runs left the original **8,080 bytes
   untouched** and appended a revision, so the base revisions are byte-identical. That is the
   assumption `checkAgreement` rests on, and it now has evidence rather than reasoning behind it.

   **If you ever need another such fixture, do not reach for `@signpdf/placeholder-plain`.** It
   was tried and reverted: it drags in `pdfkit`, `crypto-js` and ~1,560 lines of lockfile, adding
   **four critical** dev-dependency advisories, to generate one test fixture. A real signing run
   is cheaper and gives better evidence — sign the *unsigned* Certificate 1 twice, each signature
   applied to the original rather than to the other's output.
2. ~~**Library integration.**~~ **Decided: never store Certificate 2.** It is issued for download
   and nothing keeps a copy — not a server (there is none), not IndexedDB, not the tab once it is
   closed. The screen says so and tells the user to save it.

   This is a product decision, not a technical one: retaining nothing is what xNotary is *for*.
   A service that never holds a document cannot leak it, be compelled to produce it, or lose it.
   Certificate 2 costs nothing to discard because it is reproducible from the signed files at any
   time, which is why the warning can honestly say nothing is lost.

   Certificate 1 remains the deliberate exception, in the user's own browser storage on their own
   device, and only because a pending Bitcoin timestamp has to be upgraded to confirmed later —
   a lifecycle Certificate 2 does not have. Do not "unify" the two by adding a Certificate 2
   library; that would be consistency at the cost of the thing being sold.
3. **E2E coverage** — `npm run e2e` drives Flow A only.
4. **The underlying OTS status is not shown.** `Certificate2Input.underlying` carries an optional
   `otsStatus` that nothing populates yet; the certificate names the notarized document's digest
   but does not say whether that timestamp is confirmed.

### 3. Remove the pre-release warnings — **do this at M3, not before**

Two warnings say this build has had no security review and no legal review. They are accurate
today and must come out the moment they stop being:

1. `app/src/App.svelte` — the `.prerelease` notice above the tabs.
2. `README.md` — the "⚠️ Pre-release" block at the top.

Both carry a comment pointing here. Remove them **only** once the security review and the Czech
eIDAS counsel review are actually done — not when the code merely feels finished. A warning that
outlives its accuracy trains people to ignore the next one; a warning removed early is worse
still.

Deliberately **not** printed on the certificates themselves. A certificate is meant to outlive
this period and to verify without xNotary existing (invariant 4), so attaching a claim about the
tool's maturity to it would age into confusion — a reader in 2028 could not tell whether it meant
the proof was suspect. It isn't: the digest, the OpenTimestamps proof and the PAdES parsing are
the same code that ships at 1.0. Each certificate already states its own limits precisely.

### 4. M3 — Release

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
- **Dev-toolchain advisories for the M3 security review.** `npm audit --omit=dev` reports **0**
  — nothing vulnerable ships. `npm audit` reports 7 dev-only, of which two matter: Vite (path
  traversal in optimized-deps `.map` handling, dev server only) and `@vitest/mocker` via vitest.
  Both follow from the pinned Vite 5 / Node 18 floor, so clearing them means raising Node first.
  Worth stating explicitly in the review rather than leaving the raw `npm audit` number to alarm
  a reader.

## Post-MVP backlog, in priority order

0. **Embed a Unicode font in the PDFs.** Today non-WinAnsi characters are transliterated —
   "balíčky" is drawn as "balícky" — which is honest but lossy, and the certificate has to say so.
   The complete fix is `@pdf-lib/fontkit` plus a TTF with Czech coverage. Deferred because it is a
   new dependency (4.3 MB unpacked) plus a font asset on an offline-first PWA, to render metadata
   that is not part of the cryptographic claim. Worth doing once bundle size is being looked at
   anyway.

1. Qualified RFC 3161 timestamp (e.g. I.CA) + PAdES-LTA/LTV embedding.
2. Full in-browser QES validation against EUTL trusted lists.
3. Flow B sharing: Nostr identities, client-side encryption, Blossom storage, NIP-44/NIP-59.
4. nsite/Nostr hosting alongside GitHub Pages.
5. Bank iD Sign gateway (self-hostable) and EUDI wallet (eIDAS 2.0) adapter.
6. "Sign the original document" mode, pending counsel input.
