# M0 — Risk spike results

**Date:** 2026-07-27 · **Verdict: GO on both spikes.** No architectural change needed; the
"no backend" principle survives contact with the browser.

The brief named two highest-risk components and asked for go/no-go before building on them:

1. OpenTimestamps create/upgrade/verify **in the browser**
2. PAdES parsing + **signer-identity extraction**

Both were driven against real artifacts, not mocks. Reproduce with the commands in each
section.

---

## Spike 1 — OpenTimestamps in the browser

### Verdict: **GO**

The full lifecycle — stamp → pending `.ots` → upgrade → verify against Bitcoin — works from a
static page with no backend, no proxy and no polyfills.

### Library choice

`javascript-opentimestamps` (the client the brief suggested) was **rejected**. It is a 2019-era
Node package whose dependency set is hostile to a browser bundle: `request`, `fs`, `web3@0.18`,
and `keccak` with native bindings. Bundling it would have meant a large polyfill layer around
abandoned code, in the one part of the app whose correctness matters most.

Selected instead: **`@vitrified/typescript-opentimestamps`** —

| | |
|---|---|
| Dependencies | exactly one, `@noble/hashes` |
| Node builtins in the ESM build | **zero** (verified by grep over `dist/esm`) |
| Bundle contribution | ~25 kB / 9 kB gzipped |
| License | LGPL-3.0-or-later — compatible with our AGPL-3.0 |
| API | `submit` · `upgrade` · `verify` · `read` · `write` · `info`, plus pluggable verifiers |

### What was proven

Run: `npm run spike:ots` (hits live calendars) — 5/5 pass.

- **Stamping works.** A fresh random digest was accepted by the public calendars and produced a
  well-formed `.ots`.
- **Byte-exact interoperability.** The upstream reference proof
  (`src/spikes/fixtures/reference.ots`, produced by the Python client) parses and
  **re-serializes byte-for-byte**. Our reader/writer agrees with the reference implementation,
  which is what the "independently verifiable" requirement actually rests on.
- **Upgrade works.** An anchored proof upgraded from the calendars with zero errors.
- **Bitcoin verification works**, confirmed by two independent explorers (blockstream.info and
  blockchain.info) agreeing on the same attestation.
- **It fails closed.** Flipping one bit of the attested digest produces *zero* attestations
  rather than a silent pass.

### The finding that mattered: CORS

Node's `fetch` ignores CORS, so passing tests in Node prove nothing about a backend-free SPA.
The spike was therefore re-run **in real headless Chrome** against a dev server
(`npm run spike:cors`, source `src/spikes/cors-probe.html`).

Result: the calendars return `Access-Control-Allow-Origin: *` on the actual `POST /digest`, and
the request stays a CORS *simple request* — no preflight — because the client sends only
`Accept` (safelisted) and `User-Agent` (a forbidden header browsers silently drop), with a
`Uint8Array` body that sets no `Content-Type`. This is load-bearing: the calendars' `OPTIONS`
handler returns 404/501 with **no** CORS headers, so anything that triggered a preflight would
fail.

**One calendar is unusable from a browser:** `btc.calendar.catallaxy.com` sends no
`Access-Control-Allow-Origin` at all and is hard-blocked by Chrome.

> **Action taken:** `src/lib/ots.ts` defines its own `CALENDAR_URLS` (alice, bob, finney) rather
> than using the library's `defaultCalendarUrls`, so users do not see a spurious failure on
> every stamp. Revisit if catallaxy adds the header.

### Residual risks

- Both block explorers are third-party HTTP APIs. If both are unreachable the app reports
  `unverified` and says so, rather than claiming a confirmation it did not check.
- Calendar availability is outside our control. A stamp survives partial failure — one calendar
  is enough — and `stamp()` throws only when *every* calendar fails, rather than saving a
  `.ots` that attests to nothing.

---

## Spike 2 — PAdES parsing and signer identity

### Verdict: **GO**

`pkijs` + `asn1js` parse a signed PDF, confirm document integrity and extract signer identity
entirely in browser-safe code. Implemented in `src/lib/pades.ts` — this is M2 code, not
throwaway spike code.

### Fixture

No third-party signed PDF of unknown provenance is committed. Instead
`scripts/make-pades-fixture.sh` builds one reproducibly: an OpenSSL chain shaped like a real
Czech qualified certificate — `nonRepudiation`-only key usage, a subject `serialNumber` carrying
the identity, and hand-encoded **ETSI EN 319 412-5 QCStatements** (QcCompliance, QcSSCD,
QcType=esign) — then signs a PDF with it via `@signpdf` (dev dependency only).

Regenerate: `npm run fixtures:pades`.

### What was proven

Run: `npm test` (offline — this spike doubles as the regression suite for `pades.ts`) — 6/6 pass.

- **Signature location.** `/ByteRange` and `/Contents` are recovered from the raw bytes, and the
  covered byte span is reconstructed exactly.
- **Integrity.** The `messageDigest` signed attribute matches a re-hash of the covered bytes;
  flipping a single byte inside the signed range flips the result to `false`.
- **Identity.** Signer CN, subject `serialNumber`, country, and the **issuer DN — the QTSP** —
  all extract cleanly, as does the CMS `signingTime`.
- **Qualified-certificate markers.** The QCStatements decode correctly.

### Deliberate scope line

`pades.ts` reports what a certificate **claims** (`QualifiedClaim`), never a verdict on whether
a signature is a valid QES. That requires EUTL trusted-list validation at signing time, which
the MVP delegates to an official external validator, per the brief. The type is named and
documented so this cannot be misread later.

### Residual risk — the one thing still untested

Everything above ran against a **synthetic** chain. It has **not** been tested against a real
I.CA / PostSignum / Bank iD–signed PDF, because no such document was available.

What could still differ on real inputs, in rough order of likelihood:

1. **Name encoding.** Czech diacritics in `CN`, or identity split across `givenName`/`surname`
   instead of `CN`. `displayName()` already handles the GN+SN split; the wider risk is
   `BMPString`/`UTF8String` handling in DN values.
2. **Incremental updates.** Real multi-signature PDFs are signed by appending revisions.
   `coversWholeDocument` detects appended bytes and warns, but multi-revision behaviour is
   untested end-to-end.
3. **PAdES-LTA.** Documents carrying DSS/VRI dictionaries and archive timestamps parse as extra
   signature slots that we have not exercised.
4. **SubjectKeyIdentifier SignerInfos.** `matchSignerCert` falls back to "the only certificate"
   when the `sid` is not `issuerAndSerialNumber`; a multi-cert CMS using SKI would fail to match.

**Recommended before M2 ships:** obtain one real I.CA-signed and one Bank iD–signed PDF and add
them as fixtures. This is a data-availability problem, not a technical unknown — the parsing
machinery is proven.

---

## Interop check — is a Certificate 1 really verifiable without xNotary?

Principle 3 is the one worth testing hardest, so it was tested with **no xNotary code in the
loop on the verifying side**:

1. `buildCertificate1()` produced a real Certificate 1 PDF wrapping the anchored reference proof.
2. **pypdf** (independent Python library) walked `/Names → /EmbeddedFiles` and extracted
   `proof.ots` — 688 bytes, byte-identical to the input.
3. **`ots` v0.7.2**, the reference Python client, parsed it and reported

   ```
   File sha256 hash: 03ba204e50d126e4674c005e04d82e84c21366780af1f43bd54a37816b6ab340
   ```

   which is exactly the SHA-256 of `reference.txt`.

So the attachment is discoverable and readable by standard tools, and the proof commits to the
right document. **Caveat:** the final `ots verify` step could not be completed here, because the
reference client insists on a local Bitcoin node (`~/.bitcoin/.cookie`) and will not trust a
block explorer. That is the client being conservative, not a defect in the certificate — the
Bitcoin attestation in this same proof was independently confirmed against two explorers in
Spike 1. Worth re-running against a real node before M3.

---

## Fallbacks considered and not needed

The brief allowed a WASM verification library or a downloadable CLI as a fallback if
in-browser work failed. **Neither is needed.** Both spikes cleared in pure TypeScript with a
combined dependency footprint small enough to audit.

---

## Reproducing everything

```bash
cd app && npm install

npm test                # offline suite, incl. the PAdES spike       (22 tests)
npm run spike:ots       # live calendars + block explorers            (5 tests)

npm run dev &           # then, in another shell:
npm run spike:cors      # real-browser CORS proof, headless Chrome
npm run e2e             # Flow A driven end-to-end through the UI
```

`spike:cors` and `e2e` need a Chrome/Chromium binary at `/usr/bin/google-chrome`.
