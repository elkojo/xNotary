# Where things stand — handoff

**Last updated:** 2026-09-06 (end of session) · `main` · interface rebuilt; not yet tagged or deployed

M0, M1 and M2 are done. Both certificates work end to end, the app is public and live, and
`pades.ts` has been measured against real qualified signatures rather than only synthetic ones.
A nine-comment review round has since been answered in full — see *What the review changed* below.
What is left before a real release is not code: two reviews, and documents only a human can obtain.

## State

| | |
|---|---|
| Live app | <https://elkojo.github.io/xNotary/> — `v0.3.1` deployed; `main` is ahead of it. Public address is <https://xnotary.digital>, which **forwards** here: GitHub Pages stays the host, so the origin — and the IndexedDB library scoped to it — does not move |
| Repo | <https://github.com/elkojo/xNotary> — **public**, AGPL-3.0, 8 releases, all marked pre-release |
| Flow A — Certificate 1 | Working end to end, verified in a real browser against dev, production *and* the deployed site |
| Verify-integrity screen | Working, including tamper rejection |
| Certificate library | Working, with pending → confirmed upgrade |
| PAdES parsing | Hardened; measured against real PostSignum output (`docs/qtsp-findings.md`) |
| Certificate 2 | Working — `Signatures` tab, consent gate, one-page A4, sequential *and* parallel signing, and attestation over the *document itself* |
| Certificate rendering | Liberation subsets embedded; Czech, Greek and Cyrillic names render correctly |
| Tests | 144 offline, all passing; type-check clean; `npm run e2e` passes Flow A through the new interface |
| Licensing | Notices shipped and generated from the real bundle; the one LGPL dependency is linked, not bundled; every build links the source it was built from |

**Deploying:** bump `version` in `app/package.json` to match → commit → push → tag `v*`. The tag
fires `deploy.yml`; a plain push does not. Nothing in the app reads that version field, so keeping
it in step is a discipline rather than a mechanism — it drifted from `0.1.0` to `v0.3.0` before
anyone noticed. The
`github-pages` environment has a `v*` tag policy so tags are allowed to deploy — do not remove it.
After deploying, `gh release create` publishes the release notes; that step is manual.

## If you are picking this up cold

Read this file, then `CLAUDE.md` (loaded automatically) for the invariants and gotchas, then
`docs/qtsp-findings.md` for what real qualified signatures actually contain — that one exists
because reasoning about the spec was repeatedly wrong and measurement was repeatedly right.

Then `cd app && npm test` (144, offline, ~9s). Green means the tree is sound.

**Nothing is half-finished in the code.** No in-progress branch, no failing test, no partial
feature. The one outstanding chore is that the rebuilt interface is committed but **not versioned
or tagged**, so it is not on the live site yet — see *What this session changed (2026-09-06)*.
Otherwise pick any item under *Next up*; none blocks another.

The pattern worth keeping, because it caught things tests did not: for anything that produces a
document or a page, **render it and look at it**. Overflowing text off the bottom of a page, a
digest hidden behind a QR code, and "Certified by <the signer themselves>" all passed their tests.
It kept earning its keep in the review round: rendering the certificates is how the mangled Czech
names were confirmed rather than guessed at, and a screenshot of the Help page found four
passages still claiming Certificate 1 was the thing people sign, hours after that stopped being
true. `pdftoppm -png cert.pdf out` for a PDF; for a page, drive headless Chrome over CDP the way
`scripts/e2e-flow-a.mjs` does and call `Page.captureScreenshot`.

Second pattern, same origin: **prose length is a layout input.** The one-page A4 fit broke three
separate times during the review round purely from wording changes. Any edit to `DISCLAIMER_2` or
the printed verification steps needs `npm test` — the page-count assertions are what catch it.

## What the review changed (2026-07-30)

Nine comments from a reviewer reading the live app. Two changed behaviour; the rest narrowed what
the app is allowed to claim. All are shipped in `v0.3.0`. The pattern worth carrying forward: the
comments that found real defects came from someone using the app on their own documents, not from
reading the code.

1. **Fonts were a P0, not a nicety.** Certificates printed "Rehor Cízek" for Řehoř Čížek — the
   standard PDF fonts are WinAnsi-encoded and Czech straddles that boundary. Now embeds Liberation
   subsets (Latin, Greek, Cyrillic), metric-compatible with Helvetica so the measured one-page
   layout did not move. **Read `app/src/lib/fonts/README.md` before touching any of it**: it
   records three failure modes that each cost an hour and none of which is discoverable from the
   error message.
2. **Signing the contract itself.** `Attest` now takes the `.ots` (or the Certificate 1 carrying
   it) alongside the signed files. `findTimestampedRevision` searches every `%%EOF` prefix for the
   digest the proof commits to; a match means Certificate 2 can state the signatures are over the
   document, and no match means it states nothing while still attaching the proof. Do not
   "simplify" this to `baseRevision` — that takes the *first* `%%EOF`, which is wrong for a
   contract already updated incrementally before it was timestamped.
3. **Bank iD SIGN is not a QES** — bank-supplied identity plus Bank iD's own qualified *seal*,
   yielding an advanced signature. It was listed among the QTSPs, which was simply wrong, and this
   file said so too.
4. **eIDAS is the example, not the frame.** Every user-facing statement now holds outside the EU.
   Pinned by a test in `certificate2.test.ts`, because the certificate travels furthest.
5. **The Commission's DSS instance titles itself "DSS Demonstration WebApp."** Calling it the
   official validator claimed an assurance nobody gave, and pointed users at uploading their
   document to a third party. Replaced by DSS-run-locally and qualified validation services.
6. **§ 6(2) of Act 12/2020 Sb. is not something xNotary can satisfy** — it needs verification from
   population-register data that the certificate belongs to the signer. Nothing claimed it, but
   "notarization" invites the inference, so the app now says so explicitly.
7. **Times** are UTC-and-labelled on certificates, local-and-zone-named on screen (`src/lib/time.ts`).

Two decisions were *raised and deliberately not taken*, both needing a human:

- **Contracted qualified validation.** Only a QTSP may provide qualified validation under eIDAS
  Art 33, so xNotary can never be one. Doing it means a contract, money, credentials (→ a backend,
  invariant 2) and the document leaving the device (invariant 1). Today's design — name the
  routes, let the user choose who sees the document — is the only one that keeps both invariants.
- **In-browser EUTL validation** is blocked as normally done: measured 2026-07-30, the EU list of
  trusted lists returns 200 with **no `Access-Control-Allow-Origin`**, so a proxy would be needed
  and that is a backend. The only no-backend route is a dated build-time snapshot; see
  `docs/qtsp-findings.md` for the two catches before anyone starts.

## What this session changed (2026-08-26)

Licensing and wording. No product behaviour moved; the test count is unchanged at 140.

1. **The README's lead sentence was wrong about the product.** "Collect qualified electronic
   signatures" describes a signature-request workflow — send, chase, gather — which xNotary does
   not have and cannot have without a backend. Signing happens in the user's own tool; this app
   reads an already-signed PDF. It also made "qualified" the frame, contradicting the README ten
   lines further down and claiming something no trust-list check backs. Fixed there and in the PWA
   manifest.

2. **The one LGPL dependency is now linked rather than bundled.**
   `@vitrified/typescript-opentimestamps` is LGPL-3.0-or-later and is the only copyleft code that
   reaches the browser; everything else is MIT or BSD. Serving a static SPA *is* conveying it, so
   LGPL § 4 applies exactly as it would to a downloadable binary. `vite.config.ts` keeps it
   external, builds it alone into `vendor/opentimestamps.js` — unhashed, unminified,
   `treeShaking: false` — and imports it by URL, so a user can substitute their own build. Full
   reasoning, the honest caveat about § 4(d)(0) and ES modules, and what the alternatives cost:
   **`docs/relinking.md`**. Verified against the production build under both base paths, and
   `npm run e2e` passes Flow A through the externally linked module.

3. **`THIRD-PARTY.txt` is generated at build time from the modules actually in the bundle**, not
   from `package.json`, so it cannot drift from what shipped. Reachable from the Help screen along
   with the relinking note. There were no third-party notices at all before this.

4. **Every build stamps its own revision and links that commit** (AGPL § 13 — whoever runs this as
   a service owes users the source of *that* version, not a link to the project). A build made
   from uncommitted changes prints `-dirty` and links nothing, because pointing at a commit the
   bundle does not match is worse than admitting there is none. `deploy.yml` now checks out with
   `fetch-depth: 0` so the stamp reads a tag rather than a bare SHA.

5. **`CONTRIBUTING.md` — DCO, no CLA.** See *Decisions already made*.

6. **`esbuild` moved into devDependencies.** It builds the vendored library; relying on it
   implicitly as Vite's own dependency would break under a stricter installer.

## What this session changed (2026-09-06)

The interface was rebuilt to the design in `20260830_xnotarypreview.html`, which sits at the repo
root and is **untracked** — commit it if the design source is worth keeping, because nothing else
records what was being matched. **No product behaviour was removed or added**, with the exceptions
noted below; the same lib code sits behind every screen. Two real bugs surfaced while checking the
result, both older than this session.

### The visual system

Dark landing (`--bg #07130f`, lime accent) for the face of the product; light "paper" for every
working screen. Fixed appearance, not `prefers-color-scheme`: the two surfaces carry meaning here
(you are reading about it / you are working on a document), and inverting one breaks that. All of
it is in `src/app.css`; the views carry almost no CSS of their own now.

The mock is desktop-only (`min-width: 1180px`). That was not adopted — the layout is responsive,
and every screen was checked at 1280 and 390 with a horizontal-overflow assertion, not by eye.

Screens are now `Home · Timestamp · Signatures · Verify · My certificates · How it works`.
**Route ids did not change** (`home/notarize/attest/verify/library/help`, in `src/nav.ts`), because
`#/notarize` and `#/attest` are in bookmarks and in the installed PWA's start URL.

### What the mock claimed that the app must not

The mock is a design document, not a specification, and several screens described a different
product. Taken as layout, refused as copy:

- **The whole "Sign" flow** — signer emails, "Send signing links", reminders, per-signer "Waiting"
  status. That is a signature-collection service and cannot exist without a backend (invariant 2).
  The tab is the existing **Attest** flow restyled into the mock's three-step shell: bring the
  signed files → who may be named → certificate. The consent gate is untouched. The screen says
  outright that xNotary sends no invitations and holds no key, because the visual language of the
  mock invites the opposite assumption.
- **"2 valid signatures"** on the verify result, and "recorded signature status" — invariant 5.
  `pades.ts` reports claims; it cannot say a signature is valid.
- **"Timestamp confirmed"** on the screen immediately after stamping. It is `pending` for hours;
  the success step says so and the copy is conditional on the real status.
- **"xNotary records the proof"** in How it works. It does not; the calendars and Bitcoin do.
- **A `.xnotary` certificate container** with short ids. Certificate 1 stays a PDF with the `.ots`
  embedded — invariant 4 is the whole point.
- **"Public beta"** in the top bar, which is softer than the truth. It reads **Pre-release**, and
  the full notice is a band directly under the top bar on every screen, landing included.
- **"Import certificate"** in the library toolbar. There is no import; a control that does nothing
  is worse than an absent one. (Export already exists per record.) Left out deliberately — if
  export/import is ever built, the toolbar has a place for it.

The landing's direction copy — remote multiparty agreements, contracts between authorised software
agents — was kept, with wording that states plainly it is intent rather than capability. The same
paragraph appears on How it works.

### Two bugs found by rendering it and looking at it

Neither was introduced here; both were reached by driving the real build in a real browser.

1. **`localStamp` threw on every call.** It asked `toLocaleString` for `dateStyle` + `timeStyle`
   *and* `timeZoneName`. ECMA-402 forbids combining the style shorthands with any individual
   component, and the result is a **TypeError**, not an ignored option — reproducible in Node too.
   It threw inside the certificate list's render, so Svelte abandoned that branch and the library
   sat behind a permanent "Loading…" with the records already in memory. Spelled the components out;
   `src/lib/time.test.ts` is new and pins it. This is why the count moved 140 → 144.

   Worth noting how it hid: nothing in `npm test` calls `localStamp`, the failure was silent in the
   UI (a stuck spinner, not an error), and the digest, proof and certificate were all correct. It
   took a CDP probe reading `Runtime.exceptionThrown` to see it at all.

2. **The library's `loading` flag was reset on every reload**, so an upgrade or a delete blanked
   the whole list while IndexedDB was re-read. It is now `loaded`, one-way, and the list is no
   longer gated on `navigator.storage.estimate()` — which is slow in some browsers and is only
   needed for a number at the foot of the page.

### Also

- `index.html` still described the product as "collect qualified electronic signatures" — the same
  wrong-product line fixed in the README and the manifest on 2026-08-26, missed here. Corrected.
- Favicon and both PWA icons are the new mark; `theme_color`/`background_color` follow the palette.
- `scripts/e2e-flow-a.mjs` was updated for the new interface: it now asserts the landing renders,
  navigates by `.nav-link`, and asserts the review step shows the digest *before* anything is sent.
  Three of its text assertions had to change with the copy. One is worth remembering: `innerText`
  reflects rendered text, so the uppercased status pill reads `PENDING ANCHOR` — match it
  case-insensitively.

### Left for whoever picks this up

- **The version was not bumped and nothing was tagged**, so this is not deployed. Follow *Deploying*
  above when you want it live.
- The domain is a **forward**, so nothing in the build changed for it. If it is ever made a real
  custom domain (a `CNAME` in `public/`, `BASE_PATH=/`), that is an **origin change** and every
  existing user's library goes empty — ship export/import first. See *Open items*.
- The mock's library table has a **Signatures** column. There is nothing to put in it: the library
  holds Certificate 1s, which have no signers. It shows **Size** instead.

## Decisions already made — don't relitigate

- **Bitcoin, not Litecoin.** Investigated and rejected; reasoning in `README.md`
  ("Why Bitcoin, and not Litecoin"). Short version: no Litecoin calendar exists any more, and
  the reference `ots` client cannot verify Litecoin attestations at all.
- **`@vitrified/typescript-opentimestamps`**, not `javascript-opentimestamps`. See
  `docs/m0-spike.md`.
- **Calendar list pinned** to alice/bob/finney; catallaxy serves no CORS header.
- **Svelte 5 + Vite 5**, hand-written service worker (Node 18 constraint).
- **BYOS** — xNotary never holds or brokers signing keys.
- **The code stays open source; the money is in services around it** — archive, printed
  certificates, physical delivery. This settles several questions at once: no CLA is needed (see
  below), the AGPL stays, and anything proprietary must live behind the network boundary, because
  a modified hosted SPA is itself AGPL and its source must be offered to users.
- **Contributions under the DCO, not a CLA.** Sole copyright would only be needed to relicense or
  sell proprietary exceptions, which the services model does not require. A CLA also reads as
  "they intend to close this", which corrodes the trust that is the actual product. If an
  OEM-exception business ever appears, a CLA can be adopted then — it covers everything written so
  far, since the author is sole.
- **The LGPL dependency is linked, not replaced.** A clean-room reimplementation of the `.ots`
  format, calendar protocol and verification (~500–900 lines, behind the `src/lib/ots.ts` seam) is
  the only way out from under the LGPL entirely, and it is deliberately *not* being done
  pre-emptively. Relicensing the dependency is a dead end: the package is a fork of La Crypta's
  work, so it would need every upstream holder, and no permissive OpenTimestamps client exists —
  the Python reference client is LGPL too.

## Next up

### 1. Real signed-PDF evidence — mostly closed, and still the highest-value input

Every real document supplied so far has found a defect that reasoning did not, so this stays at
the top even though the urgent gaps are shut. What is still unseen is listed at the end of this
section.

Original framing: obtain real QTSP-signed PDFs, because `pades.ts` had only synthetic fixtures
behind it. That has largely happened.

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
2. **Bank iD SIGN** — not a QTSP signature: bank-supplied identity plus Bank iD's own qualified
   *seal*, yielding an advanced signature rather than a QES. Nothing measured so far speaks for
   its shape, and it should differ from the QTSP output most.
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
Names DSS-run-locally and qualified validation services as the routes to a determination; makes
no qualified/not-qualified verdict of its own, and no longer links the Commission's hosted demo.

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

**Attesting the document itself is now supported too.** An optional second drop takes the `.ots`,
or the Certificate 1 carrying it. `findTimestampedRevision` locates which revision of each signed
file the proof timestamps, and where it fits, the certificate states the signatures are over the
timestamped document — attaching `proof.ots` alongside the signed files. Where it fits nothing,
the certificate says nothing about a timestamp and still attaches the proof, so a reader can see
what was offered. This is invariant 3 applied to the timestamp link.

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
4. **The underlying OTS status is still not shown.** `Certificate2Input.underlying` carries an
   optional `otsStatus` that nothing populates; when the signed file is a Certificate 1, the page
   names the notarized document's digest but not whether that timestamp is confirmed. Note this is
   *not* the same field as `Certificate2Input.timestamp`, which the Attest screen does populate
   (via `checkStatus`, degrading to `unverified` offline) for the sign-the-document-itself flow.
   Worth unifying: two ways of saying "this was timestamped" on one page will drift.

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

Done: GitHub Pages deploy, public repo. Left: PWA polish, onboarding, a disclaimer pass, and the
two reviews below. None of the remainder is blocked on code.

## Open items

- **Security review** — not started. Note for whoever does it: `npm audit --omit=dev` is **0**;
  nothing vulnerable ships. Two dependencies were added on 2026-07-30 and should be looked at:
  `@pdf-lib/fontkit` (runtime, no transitive tree, 9 lockfile lines) and `subset-font` (dev only,
  99 lines, harfbuzz/wasm). Both were chosen small on purpose — contrast
  `@signpdf/placeholder-plain`, which was installed, measured and reverted.
- ~~**Version numbering is inconsistent.**~~ **Settled 2026-08-24:** `app/package.json` now says
  `0.3.0`, matching the tag, and the bump is part of the deploy steps above. Keeping the field was
  the deliberate choice over deleting it: `npm` prints it, and a manifest disagreeing with the
  release is the kind of small wrongness that makes a reader distrust the larger claims.
- **The font subset is 546 KB of base64 committed to the repo**
  (`app/src/lib/fonts/liberation.generated.ts`, 310 KB gzipped, lazily imported so it never
  touches first paint). Regenerable with `npm run fonts:subset`. It is the largest single file in
  the tree and someone should agree to it rather than discover it.
- **Legal review** by Czech eIDAS counsel — not started, and required before this stops being
  labelled pre-release.
- **The retention claims need scoping before the archive product exists.** README principle 3 says
  xNotary "keeps no copy of anything, anywhere … a notarization service that cannot leak, subpoena
  or lose what it never held", and CLAUDE.md invariants 1 and 2 say the same. A paid archive makes
  all of that false on the day it ships unless it is rewritten first: *the app* retains nothing and
  needs no server; the optional archive holds only what the user explicitly sends it. Doing this
  before launch is cheap and after it is not — it is the same class of error as the "collect
  signatures" line fixed this session. Physical delivery also makes the operator a data controller
  (document name, digest, signer names), which needs a retention policy, a vendor DPA and privacy
  copy that is actually true.
- **Trademark, not copyright, is what protects the business.** The AGPL lets anyone run a fork as
  a competing service; it does not let them call it xNotary. For a trust product the name is the
  asset, so registering the mark (CZ or EUIPO) belongs with the domain move, along with a
  trademark policy line in the README.
- **A new domain is planned.** Two things bite, neither of them licensing: the certificate library
  lives in IndexedDB scoped to `elkojo.github.io`, so an origin change presents every existing user
  with an empty library — ship export/import first and leave the old URL redirecting with
  instructions. And a dedicated origin is a *security* upgrade, not just branding: today xNotary
  shares an origin with every other project on that Pages account, any of which can read its
  IndexedDB. `BASE_PATH` already parameterises the build, so a custom domain is just dropping it.
- **Whether to accept pull requests at all is undecided.** Raised and deferred this session. GitHub
  has no switch for it; the workable combination is a stated policy, a workflow that auto-closes
  incoming PRs, and optionally disabling forking. Refusing contributions outright (the SQLite
  model) would make the ownership question moot rather than managing it — worth deciding
  deliberately rather than by drift, since the first merged outside PR is the point of no return.
- **Full `ots verify` never completed end to end.** The reference client requires a local
  Bitcoin node and won't trust a block explorer. The proof parses and commits to the right
  digest, and the Bitcoin attestation was confirmed against two explorers — but one run against
  a real node before M3 would close this properly.
- **Dev-toolchain advisories for the M3 security review.** `npm audit --omit=dev` reports **0**
  — nothing vulnerable ships. `npm audit` reports 7 dev-only, of which two matter: Vite (path
  traversal in optimized-deps `.map` handling, dev server only) and `@vitest/mocker` via vitest.
  Both follow from the pinned Vite 5 / Node 18 floor, so clearing them means raising Node first.
  Worth stating explicitly in the review rather than leaving the raw `npm audit` number to alarm
  a reader.

## Post-MVP backlog, in priority order

~~0. **Embed a Unicode font in the PDFs.**~~ Done — this turned out to be a P0, not a nicety. A
reviewer would not send a certificate reading "Rehor Cízek" to a client, and the deferral had
underweighted that the mangled text is a *person's name*. `@pdf-lib/fontkit` plus subsets of
Liberation, 408 KB in a lazily-imported chunk. See `src/lib/fonts/README.md`.

1. Qualified RFC 3161 timestamp (e.g. I.CA) + PAdES-LTA/LTV embedding.
2. Full in-browser QES validation against EUTL trusted lists.
3. Flow B sharing: Nostr identities, client-side encryption, Blossom storage, NIP-44/NIP-59.
4. nsite/Nostr hosting alongside GitHub Pages.
5. Bank iD Sign gateway (self-hostable) and EUDI wallet (eIDAS 2.0) adapter.
~~6. **"Sign the original document" mode.**~~ Done — see *What the review changed*. What remains
is the optional next step: a **ready-to-sign bundle** that embeds `proof.ots` into the contract
itself via a PDF incremental update, so signers receive one file rather than two. That needs a
hand-written incremental-update writer (pdf-lib rewrites whole files; it cannot append) and it
means handing counterparties a contract xNotary modified, however faithfully. Deliberately not
started.
