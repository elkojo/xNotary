# xNotary

**Self-custodial notarization.** Hash any file locally, timestamp it on Bitcoin, then attest the
electronic signatures made over it — qualified ones included. You sign with your own tools;
xNotary reads the signed file and names who signed. No accounts, no database, no backend — and no
copy of your documents anywhere but your own device.

> ### ⚠️ Public beta — not for real use yet
>
> **This build has not had a security review, and its wording has not been reviewed by a
> lawyer.** The Czech eIDAS counsel review is a release milestone and has not happened.
>
> What it produces is nonetheless real: the digests are genuinely anchored in Bitcoin and the
> certificates verify with the reference OpenTimestamps client, with or without this app. So
> treat the *software* as unfinished rather than the output as fake — and don't rely on it for
> anything that matters.

> **Status.** Certificate 1 and Certificate 2 both work end to end, and the interface has been
> rebuilt around them (`v0.4.1`). Remaining before release: **security review**, **Czech eIDAS
> counsel review**, and an onboarding pass. Neither review is a code task, and both gate the
> "public beta" label coming off. See [Milestones](#milestones) and the
> [post-MVP roadmap](#post-mvp-roadmap).

**Try it:** <https://xnotary.digital> — which forwards to the site itself at
<https://elkojo.github.io/xNotary/>, where it is hosted and where its storage lives. Or run it
locally, see [Getting started](#getting-started). Nothing you do there is uploaded.

---

## What it produces

**Certificate 1 — integrity + existence.** A PDF proving that *this exact file* existed no
later than a particular Bitcoin block. The file is hashed in your browser; only the 32-byte
SHA-256 digest is ever sent, to public [OpenTimestamps](https://opentimestamps.org) calendar
servers.

**Certificate 2 — attestation.** A one-page A4 certificate naming the people who signed, each with
their issuing authority and when they signed, with the signed documents embedded inside it, byte
for byte. Any PAdES signature is read the same way, wherever it was issued; eIDAS is the framework
this documentation uses as its worked example, not a requirement.

**Sign the contract, not the certificate.** Have everyone sign the document itself, then hand
Certificate 2 both the signed file and the `.ots` (or the Certificate 1 carrying it). xNotary finds
which revision of the signed file the proof timestamps — a search against the known digest, so a
match is proof rather than an assumption — and the certificate then states that the signatures are
over the document itself, with the proof attached alongside it. If no revision matches, it says so
and claims nothing. Signing the Certificate 1 still works; it just attests to the certificate
rather than to the contract.

Nobody is named without ticking a box for them first, and signatures whose signer withheld
consent are disclosed as a count rather than silently dropped. Signing in sequence (one file,
several signatures) and in parallel (one copy per signer) are both accepted; in the parallel case
xNotary first establishes that the copies really are signatures over the same document, and
refuses to combine them if they are not.

It reports what each signing certificate *claims* and sends the reader to a validator for the
framework the signature was issued under: [DSS](https://github.com/esig/dss), the EU's
open-source reference implementation, run on their own machine — or a validation service from a
trust provider, which in the EU is the only kind that can give a *qualified* validation. It never
decides a signature's legal status for itself: that needs a trust list, and xNotary checks none.

It deliberately does not link the Commission's hosted DSS instance. That page titles itself "DSS
Demonstration WebApp": it is a showcase for the library, not an operated validation service, and
sending a document to it is an upload xNotary has no business recommending.

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

## Why Bitcoin, and not another chain

Two alternatives have been investigated and **rejected**: Litecoin, and Bitcoin SV. The question
recurs, so the findings are recorded here. Everything below was re-measured on **2026-09-06**;
the commands are in the history if you want to repeat them.

The test both had to pass is not "is this a real chain" — it is principle 4. A certificate must
be verifiable with standard open tools **without this project existing**. Neither candidate can
be, and the reasons are different in each case.

### Litecoin

**There is no calendar to stamp against.** The public Litecoin OpenTimestamps calendars are not
down, they are gone — `ltc.calendar.eternitywall.com` and `ltc.calendar.catallaxy.com` have no
DNS record at all, as does `litecoin.calendar.opentimestamps.org`, while every Bitcoin calendar
answers normally with permissive CORS. Stamping needs a calendar, and the only way to get one is
to run it: a server, plus a funded wallet paying fees indefinitely. That is principle 2 gone, and
with it the "no xNotary backend" statement on every screen.

**Nobody could verify the result.** `LitecoinBlockHeaderAttestation` does exist in the reference
Python client (tag `06869a0d73d71b45`) — but its `verify_against_blockheader()` raises
`NotImplementedError`, pending a maintained Litecoin library that never arrived. So the very
command printed on every Certificate 1 fails on a Litecoin-anchored proof. The client also treats
those attestations as second-class and prunes them: `cmds.py` calls
`discard_suboptimal(timestamp, LitecoinBlockHeaderAttestation)`.

Nor could xNotary check one. Every verifier in the OpenTimestamps library we ship opens with
`if ("bitcoin" !== leaf.type) return undefined` — it parses Litecoin leaves and verifies none of
them. We would have to write that verifier ourselves.

**Litecoin's security is not the objection.** It is merge-mined with Dogecoin (~3.3 PH/s scrypt)
and is a real chain with real work behind it; it carries less economic weight than Bitcoin, but
that is a matter of degree. The objection is that nothing in the ecosystem will check the proof,
and the browser side was never the hard part — `litecoinspace.org` serves a mempool-style API
with permissive CORS.

### Bitcoin SV

**OpenTimestamps has no BSV attestation type at all** — not in the specification, not in the
reference client, not in any library. There is nothing to extend, so it would mean one of two
things, and both fail principle 4 by construction:

1. **Define a private attestation tag.** Every other OTS client then reads `UnknownAttestation`,
   an opaque blob, and `ots verify` reports that it does not know what this is. The certificate
   becomes checkable *only by xNotary* — precisely what principle 4 exists to prevent.
2. **Abandon OpenTimestamps for BSV** and write a bespoke `OP_RETURN` scheme. That is a second
   proof format, a second verification path, a wallet and fees — a backend, and a format with no
   independent tooling behind it.

**And the security gap decides it anyway.** BSV is SHA-256, the same algorithm as Bitcoin, so the
comparison is like-for-like rather than a matter of interpretation. Derived from live difficulty
on 2026-09-06:

| Chain | Difficulty | Hashrate | Share of Bitcoin |
|---|---|---|---|
| Bitcoin | 1.27 × 10¹⁴ | ~912 EH/s | — |
| Bitcoin SV | 2.91 × 10¹⁰ | ~208 PH/s | **0.023%** (1 in 4,377) |

Any miner holding 0.023% of Bitcoin's hashpower matches BSV's entire network. That is not a
theoretical worry: BSV was 51%-attacked repeatedly in 2021, including a **~14-block
reorganisation** in August — its fifth attack in three months — with double-spends across
exchanges and several delistings.

For a timestamping product that is the whole argument. A timestamp is worth exactly what it costs
to rewrite the block containing it, and a fourteen-block reorg means a timestamp that read
*confirmed* stopped being true. Offering that in a menu beside Bitcoin would ask users to make a
judgement they have no basis for, and would imply the two options are comparable.

### What about letting the user choose?

A chain selector was considered and dropped. Beyond the above, it would make every certificate's
meaning depend on a setting: `OtsStatus` means one thing today, the verify screen's wording means
one thing, and Certificate 2's agreement check compares notarized digests across proofs. Per-chain
semantics would multiply each of those, and every one of them is a place where "never claim more
than was verified" can quietly go wrong.

An OTS proof *can* carry several attestations, so in principle a second chain could be added
**alongside** Bitcoin rather than instead of it, leaving `ots verify` working through the Bitcoin
path. That remains true, and it is still not a plan: it needs a calendar that does not exist and
a verifier nobody has written, for a redundancy that the next section provides better.

## The stronger move: a second kind of authority

If the goal is not depending on a single source of truth, the answer is not a second blockchain —
it is a second *kind* of authority. That means a **qualified RFC 3161 timestamp** from a trust
service provider, alongside the Bitcoin anchor rather than in place of it. It is the first item on
the [post-MVP roadmap](#post-mvp-roadmap) for that reason.

The two are complementary in a way that two blockchains are not:

| | Bitcoin anchor | Qualified RFC 3161 timestamp |
|---|---|---|
| Trust model | Trustless — no provider anywhere | A named, audited, supervised provider |
| Legal standing | Evidence, weighed like any other | In the EU, carries a presumption of accuracy |
| Cost to forge | The cost of rewriting Bitcoin history | Compromising a supervised trust service |
| Availability | Pending for hours until a block lands | Immediate |
| Verification | `ots verify`, no account, forever | Standard RFC 3161 tooling, any PAdES validator |

Bitcoin gives independence from every institution; a qualified timestamp gives standing with the
institutions that matter in law. They fail in unrelated ways, which is what redundancy is
supposed to mean. Two chains fail the same way — a rewritten history — and only differ in how
much it costs to do.

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
| `npm test` | Offline test suite (144 tests), including the PAdES regression suite |
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
  certificate2.ts Certificate 2: signer attestation, agreement checks, timestamp link
  pades.ts        PAdES signature parsing and signer-identity extraction (M2)
  library.ts      the local certificate store (IndexedDB)
src/views/        Home · Timestamp · Signatures · Verify · My certificates · How it works
                  (route ids are still home/notarize/attest/verify/library/help)
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
- [ ] **M3 — Release.** GitHub Pages deploy ✅ · public repo ✅ · licensing and third-party
      notices ✅ · Unicode font embedding, so names in Czech, Greek and Cyrillic print correctly
      ✅ · interface rebuild and copy pass ✅ · onboarding · **security review** ·
      **Czech eIDAS counsel review**.

Both reviews are what stand between this and dropping the "public beta" label. Neither is a code
task, and the label stays until they are actually done — a warning that outlives its accuracy
trains people to ignore the next one.

### Also done since M2

- **The interface was rebuilt** (`v0.4.0`/`v0.4.1`): a landing page, and the four working screens
  as guided flows — Timestamp, Signatures, Verify, My certificates — with the maturity notice
  behind the *Public beta* control rather than displayed on every screen.
- **Signing the contract itself**, not just its Certificate 1, with the timestamp link found by
  searching every revision against the digest the proof already commits to.
- **Parallel signing**, with agreement between the copies established before any signatures are
  pooled onto one certificate.
- **Real qualified-signature evidence**: `pades.ts` has been measured against genuine PostSignum
  output rather than only synthetic fixtures. See [docs/qtsp-findings.md](docs/qtsp-findings.md).
- **The one LGPL dependency is linked, not bundled**, so anyone can substitute their own build.
  See [docs/relinking.md](docs/relinking.md).
- **Every build links the exact commit it was made from**, which is what AGPL § 13 asks of
  whoever runs it as a service.

## Post-MVP roadmap

In priority order. Nothing here is started; each entry says what it needs, and what blocks it.

1. **Qualified RFC 3161 timestamp, and PAdES-LTA/LTV.** A timestamp from a trust service provider
   alongside the Bitcoin anchor — see
   [the section above](#the-stronger-move-a-second-kind-of-authority) for why this outranks
   everything else here. Needs a provider (I.CA and eIdentity both issue them) and the token
   embedded, so long-term validation data travels with the document. It is also what closes the
   "not an accredited timestamp" gap below.
2. **In-browser validation against the EU Trusted Lists.** Would let xNotary say whether a
   signature *is* a QES rather than reporting what its certificate claims. **Blocked as normally
   done**: measured 2026-07-30, the EU list of trusted lists returns HTTP 200 with *no*
   `Access-Control-Allow-Origin`, so it would need a proxy, and a proxy is a backend. The only
   route that keeps principle 2 is a dated build-time snapshot of the lists — two catches are
   recorded in [docs/qtsp-findings.md](docs/qtsp-findings.md). Note that under eIDAS Art 33 only
   a qualified provider may give a *qualified* validation, so xNotary can never be that, whatever
   it implements.
3. **Flow B — sharing without a server.** Nostr identities, client-side encryption, Blossom
   storage, NIP-44/NIP-59. The point is passing a document and its certificate between parties
   without either of them, or us, running infrastructure.
4. **nsite / Nostr hosting alongside GitHub Pages.** Removes the last centralised dependency in
   the delivery path: the page itself.
5. **Bank iD Sign gateway (self-hostable) and an EUDI wallet adapter** (eIDAS 2.0). Note that
   Bank iD SIGN does *not* produce a qualified signature — bank-supplied identity plus Bank iD's
   own qualified *seal* yields an advanced signature. xNotary reads it and says so; it never
   upgrades one.
6. **A ready-to-sign bundle.** Embed `proof.ots` into the contract itself via a PDF incremental
   update, so signers receive one file rather than two. Needs a hand-written incremental-update
   writer — pdf-lib rewrites whole files and cannot append — and it means handing counterparties
   a contract xNotary modified, however faithfully. Deliberately not started for that reason.

### Engineering items

Smaller, and none of them blocked:

- **Export/import for the certificate library.** IndexedDB is scoped to the origin, which makes
  this a hard prerequisite for ever moving xNotary to its own domain: without it, every existing
  user would arrive at an empty library. (`xnotary.digital` currently *forwards* to the Pages
  site precisely to avoid that.)
- **A dedicated origin, once export/import exists.** A security upgrade rather than branding:
  today xNotary shares an origin with every other project on the same Pages account, and any of
  them can read its IndexedDB. `BASE_PATH` already parameterises the build.
- **Unify the two ways Certificate 2 reports a timestamp.** `Certificate2Input.underlying`
  carries an `otsStatus` that nothing populates, while `Certificate2Input.timestamp` is
  populated. Two ways of saying "this was timestamped" on one page will drift.
- **End-to-end coverage beyond Flow A.** `npm run e2e` drives Timestamp and Verify through a real
  browser; the Signatures flow has unit tests only.
- **One full `ots verify` against a real Bitcoin node.** The reference client will not trust a
  block explorer, so this has never been completed end to end. The proof parses and commits to
  the right digest, and the Bitcoin attestation has been confirmed against two explorers — but a
  single run against a node would close it properly.
- **Trademark registration** (CZ or EUIPO) and a trademark policy. The AGPL lets anyone run a
  fork as a competing service; it does not let them call it xNotary. For a trust product the name
  is the asset.

### One thing that must be rewritten before it ships

Paid services around the app — archiving, printed certificates, physical delivery — are the
intended business model, and the first of them makes **principle 3 false on the day it ships**
unless it is reworded first: *the app* retains nothing and needs no server; an optional archive
holds only what a user explicitly sends it. Physical delivery also makes the operator a data
controller (document name, digest, signer names), which needs a retention policy, a vendor DPA,
and privacy copy that is actually true. Cheap to do before launch and expensive after.

## What this is not

- **Not a signature.** Certificate 1 proves a file existed at a time. It says nothing about who
  made it or what it means.
- **Not an accredited timestamp.** The Bitcoin anchor is strong evidence, and needs no trusted
  provider anywhere in the world — but it is not a timestamp from an accredited trust service,
  which in the EU means a qualified electronic timestamp under eIDAS. Adding one is the
  [first post-MVP item](#post-mvp-roadmap), and it is the right complement to the Bitcoin anchor
  rather than a replacement for it — see
  [the stronger move](#the-stronger-move-a-second-kind-of-authority).
- **Not an officially verified ("notarized") signature.** The name says notarization; that means
  hash-and-timestamp plus attestation, not the act of an official. Where a law requires a
  signature verified by an official, an electronic signature substitutes only on that
  jurisdiction's terms — which xNotary neither checks nor certifies. In Czechia, § 6(2) of Act
  12/2020 Sb. grants the right only where it can be verified *from population-register data* that
  the qualified certificate belongs to the signer, and § 6(3) excludes some cases outright. That
  register check is not something a page running in a browser can do. See the
  [DIA methodology](https://www.dia.gov.cz/cs/legislativa/eidas-sluzby-vytvarejici-duveru-a-elektronicka-identifikace/informace-pro-uzivatele/pravo-na-nahrazeni-uredne-overeneho-podpisu-dle-ss-6-odst-2-zakona-c-12-2020-sb).
- **Not legal advice.** Certificate 2 records that identified people signed something, and states
  which: the document itself where the proof establishes that link, otherwise its Certificate 1 —
  which is not the same thing. Czech eIDAS counsel review is planned before public launch.
- **Not backed up.** Self-custody cuts both ways: clear your browser data and your library is
  gone. Export your certificates.

## License

[AGPL-3.0-or-later](LICENSE). If you run a modified version as a network service, you must offer
its source to users.

Contributions are taken under the [DCO](CONTRIBUTING.md) — sign your commits off with
`git commit -s`. There is no CLA and no copyright assignment: xNotary is meant to stay open
source, and paid services around it (archiving, printed certificates, delivery) do not require
taking the code proprietary.

Every deployed build links the exact commit it was made from, on the "How it works" screen. That
is what AGPL § 13 asks of anyone running it as a service, this project included.

Third-party code that reaches the browser is listed with its licences in `THIRD-PARTY.txt`,
generated at build time from the modules actually present in the bundle. One of them — the
OpenTimestamps client — is LGPL-3.0-or-later; it is linked as a separate module rather than
bundled, so anyone can replace it with their own build. See
[docs/relinking.md](docs/relinking.md).
