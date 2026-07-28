# xNotary

**Self-custodial notarization.** Hash any file locally, timestamp it on Bitcoin, then collect
qualified electronic signatures over the result. No accounts, no database, no backend — and no
copy of your documents anywhere but your own device.

> ### ⚠️ Pre-release — not for real use yet
>
> **This build has not had a security review, and its wording has not been reviewed by a
> lawyer.** The Czech eIDAS counsel review is a release milestone and has not happened.
>
> What it produces is nonetheless real: the digests are genuinely anchored in Bitcoin and the
> certificates verify with the reference OpenTimestamps client, with or without this app. So
> treat the *software* as unfinished rather than the output as fake — and don't rely on it for
> anything that matters.

> **Status.** Certificate 1 and Certificate 2 both work end to end. Remaining before release:
> security review, legal review, onboarding and disclaimer pass. See [Milestones](#milestones).

**Try it:** <https://elkojo.github.io/xNotary/> — or run it locally, see
[Getting started](#getting-started). Nothing you do there is uploaded.

---

## What it produces

**Certificate 1 — integrity + existence.** A PDF proving that *this exact file* existed no
later than a particular Bitcoin block. The file is hashed in your browser; only the 32-byte
SHA-256 digest is ever sent, to public [OpenTimestamps](https://opentimestamps.org) calendar
servers.

**Certificate 2 — attestation.** A one-page A4 certificate naming the people who signed a
Certificate 1 with their eIDAS signatures — each with their issuing authority and when they
signed — with the signed documents embedded inside it, byte for byte.

Nobody is named without ticking a box for them first, and signatures whose signer withheld
consent are disclosed as a count rather than silently dropped. Signing in sequence (one file,
several signatures) and in parallel (one copy per signer) are both accepted; in the parallel case
xNotary first establishes that the copies really are signatures over the same document, and
refuses to combine them if they are not.

It reports what each signing certificate *claims* and links to the
[EU DSS validator](https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/validation) for
the authoritative determination. It never decides for itself whether a signature is a qualified
electronic signature — that needs the EU Trusted Lists.

## Principles

These are constraints, not aspirations. Each one is enforced somewhere in the code:

1. **Self-custody.** Files never leave your device. Hashing is client-side; only the digest goes
   to calendar servers.
2. **No backend.** A pure static SPA. No accounts, no database, no server state. *(Proven
   against real browser CORS behaviour — see [docs/m0-spike.md](docs/m0-spike.md).)*
3. **Nothing is retained.** xNotary keeps no copy of anything, anywhere — not your documents, not
   your certificates. There is no server to keep them on. Certificate 2 is built in the tab and
   handed to you to save; close the tab and it is gone. That is not a limitation to work around,
   it is the product: a notarization service that cannot leak, subpoena or lose what it never
   held. Certificate 1 is the one thing kept, in your own browser's storage on your own device,
   and only because its Bitcoin timestamp has to be upgraded from pending to confirmed later.
   You can delete it whenever you like.
4. **Open verification.** Certificates must be verifiable with standard open tools **without
   this project existing**. The `.ots` proof is embedded in every Certificate 1 PDF, and the PDF
   prints the `ots verify` command needed to check it.
5. **Open source.** AGPL-3.0.

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
- [x] **M2 — Certificate 2.** Signed-PDF ingestion, per-signature consent step, multi-signer
      assembly (parallel + sequential, with agreement checked before pooling), one-page summary,
      external-validator links.
- [ ] **M3 — Release.** GitHub Pages deploy ✅ · public repo ✅ · PWA polish · onboarding ·
      disclaimer pass · **security review** · **Czech eIDAS counsel review**.

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
