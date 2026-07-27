# xNotary

**Self-custodial notarization.** Hash any file locally, timestamp it on Bitcoin, then collect
qualified electronic signatures over the result. No accounts, no database, no backend — and no
copy of your documents anywhere but your own device.

> **Status: MVP in progress.** Flow A (Certificate 1) works end to end. Certificate 2 —
> collecting eIDAS qualified signatures — is the next milestone. See [Milestones](#milestones).

---

## What it produces

**Certificate 1 — integrity + existence.** A PDF proving that *this exact file* existed no
later than a particular Bitcoin block. The file is hashed in your browser; only the 32-byte
SHA-256 digest is ever sent, to public [OpenTimestamps](https://opentimestamps.org) calendar
servers.

**Certificate 2 — attestation.** *(next milestone)* Certificate 1 plus the qualified electronic
signatures (eIDAS QES) of one or more identified people, with a summary page naming each signer,
their QTSP, and when they signed.

## Principles

These are constraints, not aspirations. Each one is enforced somewhere in the code:

1. **Self-custody.** Files never leave your device. Hashing is client-side; only the digest goes
   to calendar servers.
2. **No backend.** A pure static SPA. No accounts, no database, no server state. *(Proven
   against real browser CORS behaviour — see [docs/m0-spike.md](docs/m0-spike.md).)*
3. **Open verification.** Certificates must be verifiable with standard open tools **without
   this project existing**. The `.ots` proof is embedded in every Certificate 1 PDF, and the PDF
   prints the `ots verify` command needed to check it.
4. **Open source.** AGPL-3.0.

## Verifying without xNotary

This is the point of the whole design, so it is worth stating plainly. Given a Certificate 1
PDF and the original document, anyone can check it with no reference to this project:

```bash
pip install opentimestamps-client
# detach proof.ots from the certificate PDF (any reader's attachments panel)
ots verify -f your-document.pdf proof.ots
```

The reference client recomputes the digest itself and queries Bitcoin directly.

## Why Bitcoin, and not Litecoin

Anchoring to Litecoin instead was investigated and **rejected**. The findings, since the
question recurs:

**There is no Litecoin calendar to stamp against.** The public Litecoin OpenTimestamps
calendars no longer exist — `ltc.calendar.eternitywall.com` and
`litecoin.calendar.opentimestamps.org` do not resolve at all (NXDOMAIN), while the Bitcoin
calendars answer normally. All four defaults in the reference client are Bitcoin, and
`ots stamp` offers `--btc-wallet` with no Litecoin equivalent. Stamping requires a calendar, and
the only way to get one would be to run it ourselves — a server plus a funded wallet paying fees
indefinitely. That contradicts principle 2 (no backend).

**Nobody could verify the result.** The reference client verifies exactly two attestation
classes: `BitcoinBlockHeaderAttestation` and `PendingAttestation`. Litecoin exists in that
codebase only as a deserializable type and a `--discard ltc` filter; there is no Litecoin
verification path. A Litecoin-anchored certificate could therefore not be checked by the very
command printed on every Certificate 1 — which would gut principle 3.

**It would weaken the only claim the product makes.** A timestamp is worth what it costs to
rewrite the history behind it. Hashrate is not comparable across SHA-256 and scrypt, so the
meaningful measure is economic weight: Bitcoin's market capitalisation is on the order of
$1.3 trillion against Litecoin's ~$3.6 billion — roughly 0.3%. For a notarization tool whose
entire output is "this provably existed at time T", that is a direct downgrade of the thing
being sold, before considering which chain a court is more likely to find familiar.

In fairness, Litecoin's faster blocks (~164s against ~613s) would tighten timestamp granularity
— but OpenTimestamps calendar batching (~1 hour) dominates the pending window, so little of that
would be visible in practice.

**If multi-chain redundancy is wanted**, the correct form is post-MVP and additive: an OTS proof
can carry several attestations, so Litecoin could be added *alongside* Bitcoin, never as a
replacement, keeping `ots verify` working through the Bitcoin path.

The in-browser side would have been the easy part: our verifiers are pluggable and
`litecoinspace.org` serves a mempool-style API with permissive CORS. That was never the
obstacle.

## Getting started

Requires Node 18.17+.

```bash
cd app
npm install
npm run dev      # http://localhost:5173
```

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Offline test suite (22 tests), including the PAdES regression suite |
| `npm run check` | Type-check Svelte + TypeScript |
| `npm run build` | Type-check, then production build to `app/dist` |
| `npm run spike:ots` | M0 spike against **live** OpenTimestamps calendars |
| `npm run spike:cors` | Real-browser CORS proof (needs `npm run dev` running) |
| `npm run e2e` | Drives Flow A through the UI in headless Chrome |
| `npm run fixtures:pades` | Regenerate the signed-PDF test fixture |

The last three need a Chrome binary at `/usr/bin/google-chrome`.

## Architecture

Everything lives in `app/src`. There is no server-side anything.

```
src/lib/          the parts that would still matter if the UI were thrown away
  hash.ts         local SHA-256, chunked for large files
  ots.ts          OpenTimestamps: stamp / upgrade / status, and the calendar list
  certificate1.ts Certificate 1 PDF generation + .ots attachment extraction
  pades.ts        PAdES signature parsing and signer-identity extraction (M2)
  library.ts      the local certificate store (IndexedDB)
src/views/        Notarize · Verify integrity · My certificates · How it works
src/spikes/       M0 risk spikes and their fixtures
scripts/          fixture generation and browser-driven checks
```

Key technical decisions and the evidence behind them are in
**[docs/m0-spike.md](docs/m0-spike.md)** — including why the obvious OpenTimestamps JS client
was rejected, and the CORS finding that decides whether "no backend" is possible at all.

Stack: Svelte 5 + Vite 5 + TypeScript, offline-first via a hand-written service worker.

## Milestones

- [x] **M0 — Risk spike.** OTS lifecycle in-browser; PAdES parse + identity extraction. **GO on
      both.**
- [x] **M1 — Certificate 1.** Hash → OTS → PDF certificate → local library; "Verify integrity"
      screen; pending→confirmed upgrade lifecycle.
- [ ] **M2 — Certificate 2.** Signed-PDF ingestion, consent step, multi-signer assembly
      (parallel + sequential), summary page, external-validator links.
- [ ] **M3 — Release.** GitHub Pages deploy, PWA polish, onboarding, disclaimers, public repo,
      security review.

Deferred post-MVP, in priority order: qualified RFC 3161 timestamp + PAdES-LTA/LTV · full
in-browser EUTL validation · Nostr/Blossom sharing (Flow B) · nsite hosting · Bank iD Sign
gateway and EUDI wallet adapters · "sign the original document" mode.

## What this is not

- **Not a signature.** Certificate 1 proves a file existed at a time. It says nothing about who
  made it or what it means.
- **Not a qualified timestamp.** The Bitcoin anchor is strong evidence but is not a qualified
  electronic timestamp under eIDAS. That is the first post-MVP milestone.
- **Not legal advice.** Certificate 2 will prove that identified people attested *to
  Certificate 1* — which is not the same as signing the underlying document. Czech eIDAS counsel
  review is planned before public launch.
- **Not backed up.** Self-custody cuts both ways: clear your browser data and your library is
  gone. Export your certificates.

## License

[AGPL-3.0-or-later](LICENSE). If you run a modified version as a network service, you must offer
its source to users.
