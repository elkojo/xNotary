# xConvert — step 1 risk spike

**Date:** 2026-10-05 · **Verdict: GO.** Pandoc and Typst both run in the browser, under the
site's CSP, with no backend and nothing fetched from anyone but our own origin. A DOCX becomes
an A4 **PDF/A-2b that veraPDF passes** in under a second once the tools are loaded.

Reproduce from `xconvert/`:

```bash
typst-pdf/build.sh         # our Typst → PDF/A wrapper; fails if the module imports anything
spike/fetch.sh             # pinned pandoc, loader, WASI shim, fonts → spike/vendor, spike/public
spike/build.sh             # bundles the worker (esbuild), packs the wrapper
node spike/serve.mjs 4180 &    # static server sending the planned /xconvert/* CSP
node spike/probe.mjs 4180      # headless Chrome; outputs land in spike/fixtures/out/
verapdf --flavour 2b spike/fixtures/out/*.pdf
```

Pinned: pandoc **3.12** (official `pandoc-3.12.wasm.zip`), loader from `pandoc-wasm` 1.1.0,
`@bjorn3/browser_wasi_shim` 0.4.2, Typst **0.15.1** crates (`typst`, `typst-pdf`,
`typst-layout`), fonts from `typst-assets` v0.15.0. veraPDF 1.30.2 for validation.

---

## What works

| Check | Result |
|---|---|
| pandoc in a Web Worker | DOCX → ODT, HTML, Markdown, DOCX; Markdown → DOCX |
| DOCX → PDF (pandoc → Typst markup → Typst) | A4, tagged, fonts embedded and subset |
| PDF/A | declares `pdfaid:part 2`, `conformance B`; **veraPDF: PASS 2b** for both fixtures |
| Czech | `á č ď é ě í ň ó ř š ť ú ů ý ž` correct in regular, bold and italic; text extracts cleanly |
| Structure | heading levels, numbered list, table with right-aligned numbers, image with caption, footnote at page foot |
| Language | `lang: cs` gives "Obrázek 1"; `papersize: a4` gives A4 — both are pandoc variables |
| CSP | `script-src 'self' 'wasm-unsafe-eval'`, `connect-src 'self'`: **no violations**, no `'unsafe-eval'` |
| Network | nothing requested from any origin but our own |

Fixture: `spike/fixtures/smlouva.md`, written to DOCX by LibreOffice (`smlouva.docx`) so the
input is an office-suite file, not one pandoc wrote for itself. `dlouha.docx` is the same ×120
(80 pages).

## Measurements (desktop, local server)

| | |
|---|---|
| pandoc.wasm | 58.3 MiB, **15.7 MiB gzipped** |
| Our Typst wrapper | 20.4 MiB, **7.5 MiB gzipped** |
| Fonts (Libertinus Serif ×4, DejaVu Sans Mono ×2, New CM Math) | 3.0 MiB |
| pandoc start | ~0.2 s |
| Typst start (fonts included) | ~0.03 s |
| First DOCX → PDF/A, tools already downloaded | ~0.9 s |
| Each conversion after that | ~0.1 s |
| 80-page document, 120 tables, images and footnotes | 2.6 s (pandoc 1.9, Typst 0.7) |
| WebAssembly memory | pandoc ~110 MiB, Typst ~15 MiB |

**First visit, download only** (computed from the sizes; Chrome cannot throttle a worker's
network — `Network.emulateNetworkConditions` answers "Not supported" on a worker target):

| Connection | Formats other than PDF (pandoc) | PDF (pandoc + Typst + fonts) |
|---|---|---|
| 50 Mbit/s | ~2.6 s | ~4.4 s |
| 20 Mbit/s (4G) | ~6.6 s | ~11 s |

Both are once: after that the service worker serves them from the cache, offline included.
**Phone CPU was not measured** (CPU throttling does not reach workers either); measure on a
real phone before release.

## Findings that change the build

1. **pandoc.wasm exceeds Cloudflare Pages' 25 MiB file limit** (58.3 MiB). Served gzipped
   (15.7 MiB) and inflated in the browser with `DecompressionStream`: Chrome 80+, Firefox 113+,
   Safari 16.4+. Our Typst wrapper is under the limit even uncompressed, but ships gzipped too.
2. **typst.ts was dropped.** It cannot run under our CSP (its font loader calls `new Function`
   on every load), it exposes no PDF/A switch (0.7.0 nor 0.8.0-rc3), and its wasm-bindgen glue
   builds four functions from strings while Typst starts. Each would have needed a workaround.
3. **Our own wrapper instead: `xconvert/typst-pdf/`.** A ~225-line Rust crate over `typst` +
   `typst-pdf`: fonts, images and source in; PDF or PDF/A-2b out. No wasm-bindgen — plain
   `extern "C"` exports over linear memory — so **the module imports nothing**: it cannot
   reach the network, the clock or the page, only what it is handed. The caller supplies the
   date (PDF/A requires one). `build.sh` fails the build if an import ever appears. It is also
   smaller than the general-purpose compiler (20.4 vs 27.0 MiB).
   - Needs a Rust toolchain with the `wasm32-unknown-unknown` target. On this machine:
     `rustup` per user (`~/.rustup`, `~/.cargo`, PATH untouched), Rust 1.99. Release CI needs
     the same; `Cargo.lock` pins the crate graph.
4. **Defaults must be set:** US Letter and English captions otherwise. Paper size from the
   reader's locale, language from the document or a selector.
5. **Markdown with images needs the images too.** A lone `.md` that references `diagram.png`
   converts with the image replaced by its description and a pandoc warning. The screen should
   accept the companion files, and show pandoc's warnings rather than swallow them.
6. **"Archival" may be said only because veraPDF passed** — the same rule as invariant 3.
   The release checks should run veraPDF over the fixtures, so a Typst upgrade that breaks
   conformance fails the build instead of shipping a false claim.

Poppler prints `Syntax Error: Suspects object is wrong type (boolean)` for Typst's PDFs; the
spec defines `/Suspects` as a boolean and veraPDF raises nothing, so this is poppler's.

## Checked in step 5: a converted PDF/A, then signed

A PDF/A from xConvert, run through xSignature's own library code on each of Sign a
document's paths (throwaway keys from its test fixtures), then veraPDF 1.30.2:

| Path | veraPDF 2b | Signature read back |
|---|---|---|
| Picture only, vector outlines (whole file re-saved by pdf-lib) | PASS | — |
| Picture only, transparent PNG | PASS | — |
| Certificate, invisible (incremental update) | PASS | intact |
| Certificate, visible block with Czech text (incremental update) | PASS | intact |

The re-save keeps PDF/A because xSignature opens files with `updateMetadata: false`, so
pdf-lib does not rewrite the Info dictionary out of step with the XMP. xNotary's Timestamp
never modifies the file — it hashes it — so needs no test of its own. xSignature's RFC 3161
document timestamp is the same incremental path as the certificate signature, but needs the
network, and was not run.

Word drawings Typst cannot draw (EMF, WMF, TIFF, BMP) no longer stop the PDF: a pandoc Lua
filter replaces each with a visible note and a warning. Lua is in pandoc's wasm build.

## LibreOffice route: "Keep the layout" (2026-10-06)

**Why.** A real, layout-heavy Word document (a technical specification with comments, not
committed) went through pandoc as structure: no page headers or footers, a serif face instead
of Arial, table borders and merged cells lost, heading numbers gone, 24 pages instead of 18.
That is pandoc working as designed. It converts structure, not layout. Desktop LibreOffice
printed the same document faithfully.

**What.** LibreOffice compiled to WebAssembly: the prebuilt `@matbee/libreoffice-converter`
2.7.2 (MPL-2.0; LibreOffice's `libreoffice-24-8` branch with that project's patches, Emscripten
3.1.51), pinned by SHA-256 in `vendor.sh`. It is offered on computers only, opt-in, for DOCX and
ODT to PDF.

| | pandoc (re-typeset) | LibreOffice (keep the layout) |
|---|---|---|
| The real document | 24 pages, layout lost | 18 pages, identical to desktop LibreOffice |
| veraPDF 2b | PASS | PASS, with comments left out |
| Time (desktop) | ~1 s | ~3 s headless, under 2 s in the owner's Chrome |
| Peak memory | small | ~2 GB across Chrome's processes |
| First download | 18 MB | 77 MB in 5 parts (147 MB wasm + 100 MB data, gzipped) |

**What it took. Each item is in `scripts/patch-libreoffice.mjs` or `vendor.sh`:**

- **No `'unsafe-eval'`.** Embind's glue builds two families of call wrappers with
  `new Function`. Both become plain closures, which is what `-sDYNAMIC_EXECUTION=0` generates.
  Only `soffice.js` changes, and every replacement must match exactly once, or the vendor
  step fails.
- **Under 25 MiB per file.** The worker fetches `<name>.parts.json`, streams the gzipped parts
  through `DecompressionStream` and compiles with `compileStreaming`. It hands Emscripten the
  module via `instantiateWasm` and the data via `getPreloadedPackage`. The loader is unchanged.
- **Threads.** These need `SharedArrayBuffer`, which needs COOP `same-origin` and COEP
  `require-corp` on `/xconvert/*`. All of xConvert is same-origin, so this costs nothing.
- **PDF/A.** Word comments become PDF Text annotations without an appearance stream (veraPDF
  6.3.3-1). `ExportNotes=false` fixes it, and the screen says "Comments are not included" when
  the document has any. `ExportNotesInMargin` hangs this build.
- **Logging.** The worker set `SAL_LOG=+ALL` and printed everything. It is now errors only.

**A trap in testing.** Driving the page over the DevTools protocol, a `Runtime.evaluate` poll
during LibreOffice's PDF export can stall the export indefinitely. That took two hours to tell
apart from a real bug. The same page in a normal browser converts the same document in under
2 s. The e2e polls only while the small fixture converts, and that passes. Don't poll the page
while a large document exports.

## Not yet checked

- A real phone.
- Inputs beyond the fixtures, for the pandoc route: Word's own DOCX (not LibreOffice's),
  tracked changes, right-to-left text, CJK (the bundled faces have none).
- For Keep the layout: browsers other than Chrome (Firefox, Safari), tracked changes, and
  documents whose fonts LibreOffice's bundled set lacks (CJK needs extra fonts).
