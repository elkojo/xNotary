# xNotary — Project Start Prompt (R01 — MVP)

> Trimmed MVP revision of `xNotary_Project_Prompt.md`. All former open issues are resolved below. Deferred scope is listed at the end so nothing is lost.

---

## Mission

Build the **xNotary MVP**: an open-source, self-custodial notarization app. A user selects any file (document, photo, PDF, etc.); it is hashed locally and timestamped on Bitcoin via **OpenTimestamps**, producing **Certificate 1** (proof of integrity + existence at a point in time). One or more identified persons then apply their own **qualified electronic signatures (eIDAS QES)** to Certificate 1; the app assembles **Certificate 2** (proof that identified persons attested to Certificate 1). Self-custodial, multi-signer, free and open-source.

## Core principles

1. **Self-custody.** Files never leave the user's device. The app processes everything client-side; only the hash goes to OTS calendar servers.
2. **No backend.** Pure client-side static SPA. No accounts, no database, no server state.
3. **Open verification.** Certificates 1 and 2 must be independently verifiable with open, standard tools (OpenTimestamps client, standard PDF signature validation) without this platform existing.
4. **Open source.** Public GitHub repo, **AGPL-3.0**.

## User flows

### Flow A — Certificate 1 (integrity + timestamp)
1. Creator selects a file in the browser; SHA-256 computed locally.
2. Hash submitted to OpenTimestamps calendar servers → `.ots` proof (initially "pending"; app upgrades it once anchored in a Bitcoin block — handle pending→confirmed lifecycle in UI).
3. App generates **Certificate 1 as a PDF**: file name, SHA-256, request time, OTS proof (embedded attachment + QR code), independent-verification instructions.
4. Certificate 1 + `.ots` saved to the creator's device (local certificate library in `localStorage`/OPFS).

### Sharing (out-of-band, MVP)
- No in-app sharing. The creator sends the original document + Certificate 1 to signers by any channel they choose (email, drive, USB).
- The app provides a **"Verify integrity"** screen: signer drops the document + Certificate 1, app recomputes the hash and confirms the match and the OTS proof.

### Flow C — Qualified signatures → Certificate 2
- Model: **Bring Your Own Signature (BYOS)** — no registered signing backend, no per-signature platform fees.
  1. Signer verifies document ↔ Certificate 1 in-app.
  2. Signer applies their own eIDAS QES to the Certificate 1 PDF locally, using tools they already have: qualified certificate from a Czech QTSP (**I.CA, PostSignum, eIdentity**) or BankID-based signing via their bank's interface.
  3. Signer returns the signed PDF to the creator (out-of-band).
  4. Creator loads all signed copies into the app, which assembles **Certificate 2**.
- **MVP verification depth:** the app parses each PAdES signature, checks document integrity, and extracts signer name / issuing QTSP / signing time. For authoritative QES validation it links out to an official validator (EU DSS demo validator, czech.gov signature validator). Full in-browser EUTL chain validation is post-MVP.
- **Certificate 2** = Certificate 1 + all collected qualified signatures + a summary page listing each signer's name, QTSP, and signature time.
- Signing modes: **parallel/independent** (default — each signer signs Certificate 1) and **sequential countersigning** as a configurable option.

## Resolved decisions (formerly "open issues")

1. **Legal weight — attestation only.** Certificate 2 proves identified persons attested to Certificate 1; it is *not* a signature of the underlying document. Clear in-app + on-certificate disclaimer. Czech eIDAS lawyer review before public launch, not before MVP.
2. **Timestamp status — OTS only.** No qualified (RFC 3161 / TSA) timestamp in MVP; documented as a limitation. First post-MVP milestone.
3. **GDPR — minimal identity data.** Certificate 2 shows name, issuing QTSP, and signature timestamp only. Consent checkbox before a signer's data is included. Full certificate details remain inside the PAdES signature itself.
4. **Partial signing — on-demand assembly.** Certificate 2 can be generated at any time with the signatures collected so far; it lists who signed. No expiry or complete/incomplete state.
5. **Long-term validity — deferred.** No PAdES-LTA/LTV embedding in MVP; signers' own tools often add LTV. Documented limitation; first post-MVP milestone together with TSA.
6. **Key loss — n/a in MVP.** No Nostr keys (sharing layer cut). App reminds users to back up certificates + `.ots` files.
7. **Blossom persistence — n/a in MVP.** No Blossom storage.
8. **Signer onboarding.** In-app help page explaining how to obtain a qualified certificate (I.CA et al.) and how to sign a PDF with it.

## Hosting & distribution (MVP)

- Static SPA on **GitHub Pages**; CI via GitHub Actions (test → build → deploy on tag).
- Code stays fully static/backend-free so the planned **nsite (Nostr/Blossom)** deployment lands post-MVP without rework.

## Stack (adjust with justification)

- TypeScript SPA: **Svelte or React + Vite**, PWA (offline verification must work).
- Libs: `opentimestamps` (JS client), `pdf-lib`/`pdfmake` (certificate generation), `@peculiar/x509` + PKI.js (signature parsing/extraction).
- Highest-risk components — prototype first (M0): OTS create/upgrade/verify in browser; PAdES parsing + signer-identity extraction.

## Milestones

- **M0 — Risk spike:** OTS lifecycle in browser; PAdES parse + identity extraction from a real I.CA/BankID-signed PDF.
- **M1 — Certificate 1:** hash → OTS → PDF certificate → local library; "Verify integrity" screen.
- **M2 — Certificate 2:** signed-PDF ingestion, signature parsing, consent step, multi-signer assembly (parallel + sequential), summary page, external-validator links.
- **M3 — Release:** GitHub Pages deploy, PWA polish, onboarding/help pages, disclaimers, AGPL license, public repo, security review.

## Deferred post-MVP (in priority order)

1. Qualified timestamp (RFC 3161 TSA, e.g., I.CA) + **PAdES-LTA/LTV** embedding.
2. Full in-browser QES validation against **EUTL** trusted lists.
3. **Flow B sharing:** Nostr identities, client-side encryption, Blossom blob storage, NIP-44/NIP-59 key exchange.
4. **nsite/Nostr hosting** alongside GitHub Pages.
5. **BankID Sign gateway** plug-in (self-hostable) and **EUDI wallet (eIDAS 2.0)** adapter.
6. "Sign the original document" mode for contract use-cases (pending lawyer input).

## Deliverables for the first session with the coding agent

1. Repo scaffold (`app/`, `docs/`), AGPL-3.0, README with this vision, CI skeleton.
2. M0 spike results with go/no-go notes on OTS-in-browser and PAdES parsing (fallback: WASM verification lib or downloadable CLI).
3. Working Flow A end-to-end.
