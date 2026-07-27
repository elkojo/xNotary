# Where things stand — handoff

**Last updated:** 2026-07-27 · **Commit:** `41fe5f0` (initial) on `main` · working tree clean

M0 and M1 are done and verified. M2 (Certificate 2) has not been started.

## State

| | |
|---|---|
| Flow A — Certificate 1 | Working end to end, verified in a real browser against dev and production builds |
| Verify-integrity screen | Working, including tamper rejection |
| Certificate library | Working, with pending → confirmed upgrade |
| Certificate 2 | **Not started** |
| Tests | 31 offline, all passing; type-check clean |
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

`src/lib/pades.ts` works, but has only ever been tested against a **synthetic** certificate
chain. Before building M2 on it, obtain one real **I.CA** (or PostSignum/eIdentity) signed PDF
and one **Bank iD**–signed PDF, and add them as fixtures.

This is a data-availability problem, not a technical unknown. What could differ on real inputs,
most likely first:

1. Czech diacritics in DN values — `BMPString`/`UTF8String` handling; identity possibly split
   across `givenName`/`surname` rather than `CN`.
2. Incremental-update revisions — real multi-signature PDFs append rather than rewrite.
   `coversWholeDocument` detects appended bytes but multi-revision flow is untested.
3. PAdES-LTA documents with DSS/VRI dictionaries and archive timestamps.
4. `SignerInfo` using `subjectKeyIdentifier` — `matchSignerCert` currently falls back to "the
   only certificate", which would fail on a multi-cert CMS.

Scrub any personal data before committing a fixture, or keep it out of the repo and document
how to regenerate.

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
