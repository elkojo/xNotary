# Where things stand — handoff

**Last updated:** 2026-07-28 · on `main`

M0 and M1 are done and verified. `pades.ts` has been hardened against the awkward shapes real
qualified signatures take. M2 (Certificate 2) has not been started.

## State

| | |
|---|---|
| Flow A — Certificate 1 | Working end to end, verified in a real browser against dev and production builds |
| Verify-integrity screen | Working, including tamper rejection |
| Certificate library | Working, with pending → confirmed upgrade |
| PAdES parsing | Hardened; verified against one real PostSignum signature (`docs/qtsp-findings.md`) |
| Certificate 2 | **Not started** |
| Tests | 45 offline, all passing; type-check clean |
| Repo on GitHub | **Not created** — local only, nothing pushed |

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

**Still open, and genuinely needing more real documents:**

1. **Multi-signature documents** — the one real sample has a single signature. Two or more mean
   successive incremental updates, where every signature but the last legitimately does *not*
   cover the whole file. `pades.ts` currently calls that "bytes appended after signing", which
   would be alarming and wrong wording for a second signer. **This is the next real-document
   priority**, and it blocks getting Certificate 2's wording right.
2. **Bank iD** — a different QTSP with a different profile. Nothing measured so far speaks for it.
3. **I.CA / eIdentity** — likewise.
4. **PAdES-LTA** with DSS/VRI dictionaries and archive timestamps. The PostSignum sample is
   PAdES-T only.

Never commit a real document — they carry personal data, usually of people other than the
signer. `/*.pdf` at the repo root is gitignored so testing against one is safe. Reproduce what it
teaches as a generated fixture and record the measurement in `docs/qtsp-findings.md`.

### 2. M2 — Certificate 2

Per the brief: signed-PDF ingestion → parse each PAdES signature → **consent checkbox before a
signer's data is included** (GDPR: name, QTSP, signature time only) → assemble Certificate 2 =
Certificate 1 + collected signatures + summary page. Parallel signing is the default; sequential
countersigning is a configurable option. On-demand assembly — generate at any time with whatever
signatures exist, listing who signed; no expiry, no complete/incomplete state.

Link out to an official validator (EU DSS demo validator, czech.gov) for authoritative QES
validation. Do **not** attempt an in-browser qualified/not-qualified verdict — that is post-MVP.

### 3. M3 — Release

GitHub Pages deploy, PWA polish, onboarding/help, disclaimers, security review.

## Open items

- **GitHub repo not created.** `gh` is authenticated as `elkojo`. One command:
  `gh repo create elkojo/xNotary --public --source=. --remote=origin --push`.
  **Decide public vs private first** — the brief wants public AGPL, but the security review and
  eIDAS counsel review are both scheduled for M3, and Certificate 2 doesn't exist yet. Private
  now, public at M3, costs nothing.
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
