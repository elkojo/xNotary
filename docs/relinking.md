# The LGPL dependency, and how it stays replaceable

xNotary ships one copyleft dependency to the browser:
**`@vitrified/typescript-opentimestamps`**, LGPL-3.0-or-later. Everything else that reaches the
bundle is MIT or BSD — `THIRD-PARTY.txt`, generated at build time from the modules actually
present, is the authoritative list.

## Why this needs handling at all

Serving a static SPA **is conveying**. The bundle is copied to every visitor's machine, so
LGPL §4 applies exactly as it would to a downloadable binary; "we only host it" is not a shelter.
Today the whole app is AGPL-3.0-or-later, which satisfies the LGPL by itself. The arrangement
below exists so that stays true if the app's own licence ever changes, and so the §4(a) notice
obligation is met either way.

Two facts make the alternatives unattractive, and are worth recording so the question is not
reopened from scratch:

- **The package is a fork** — "based on work by La Crypta, originally at
  `opentimestamps/typescript-opentimestamps`" — so a relicensing grant would need every upstream
  copyright holder, not just the publisher. Not a realistic ask.
- **There is no permissive OpenTimestamps client.** The Python reference client and
  `javascript-opentimestamps` are both LGPL. Switching libraries changes nothing.

The only way out from under the LGPL entirely is a clean-room reimplementation of the `.ots`
format, calendar protocol and verification — written from the format specification, not
translated from the library's source. That remains a live option, and `src/lib/ots.ts` is the
seam it would be swapped behind. It is deliberately not being done pre-emptively.

## What the build does instead

`vite.config.ts` treats the library as dynamically linked rather than bundled:

- It is **external** to the app's chunks. Nothing of it is inlined into `assets/index-*.js`.
- It is built on its own into **`vendor/opentimestamps.js`** — unminified, and with
  `treeShaking: false`, because a tree-shaken library is a derived subset of it and a worse
  thing to hand someone who wants to replace it. Its `@noble/hashes` imports (MIT) are inlined so
  the file stands alone. A source map with `sourcesContent` sits next to it.
- The filename carries **no content hash**, on purpose: relinking means replacing that exact path.
- The app imports it by URL, so the browser loads it as a separate ES module.
- `vendor/opentimestamps.LICENSE.txt` and `vendor/README.md` (the user-facing relinking
  instructions) are emitted alongside it, and `THIRD-PARTY.txt` names it first.

This is LGPL §4(d)(0) — a shared library mechanism — expressed in ES modules. The honest caveat:
nobody has litigated §4(d)(0) against browser ESM. §4(d)(1), which asks for the *application* in
relinkable form, is unambiguous but incompatible with ever shipping this closed-source, which is
the situation the arrangement is meant to survive.

## Replacing the library

1. Build a modified library as a single ES module exporting at least `submit`, `upgrade`,
   `verify`, `verifiers`, `read`, `write`, `info` — the surface `src/lib/ots.ts` uses.
2. Replace `vendor/opentimestamps.js` in the deployed site, keeping the file name.
3. Reload. Nothing else is rebuilt.

If the app was installed as a PWA, clear its cache first — the service worker precaches
`vendor/opentimestamps.js` along with the rest of the shell.

## Verified

Against the production build (`npm run build:only`):

- `assets/index-*.js` contains `from"/vendor/opentimestamps.js"` and no library code.
- `sw.js` precaches `/vendor/opentimestamps.js`.
- Both hold under `BASE_PATH=/xNotary/`, which rewrites the import to
  `/xNotary/vendor/opentimestamps.js`.
- `npm run e2e` passes Flow A end to end against the built bundle — stamping against live
  calendars through the externally linked module.
