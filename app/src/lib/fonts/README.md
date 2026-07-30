# Certificate fonts

`liberation.generated.ts` is **generated** — do not edit it. Rebuild with:

```bash
npm run fonts:subset            # reads /usr/share/fonts/truetype/liberation
npm run fonts:subset -- /path   # or from somewhere else
```

## Why these are here at all

pdf-lib's standard fonts are WinAnsi-encoded, and Czech straddles that boundary:
`á é í ó ú ý š ž` are in CP1252, `ř ě č ů ť ň ď` are not. Certificates therefore printed
`Rehor Cízek` for **Řehoř Čížek** and `Účetní záverka` for **závěrka** — on documents whose whole
job is to name a file and, in Certificate 2, the people who signed it. Half of a name rendering
and half not looks arbitrary to whoever receives it, and a misspelled name undercuts the
attribution the certificate exists to make.

## Why Liberation

It is metric-compatible with Helvetica and Courier, so replacing the standard fonts moved nothing:
the layout here is measured to the point and has to fit one A4 page, and a font with different
advance widths would have re-opened all of that. It is also OFL, so it can be embedded and
redistributed — see `OFL.txt`, which has to travel with it.

## Why subsets, and why base64

The three faces are 1.1 MB whole and 408 KB subset to the ranges in
`scripts/make-font-subsets.mjs`: Latin (through Extended-B), Greek, Cyrillic, punctuation and
currency. CJK is deliberately excluded — it would dwarf everything else — so those names still
fall back to `?`, which the certificate then says it did.

Base64 in a `.ts` rather than an asset import so that Node and the browser load byte-identical
fonts with no bundler-specific path, which keeps the tests honest. `loadFonts` imports it
dynamically, so it lands in its own chunk and is fetched when someone first builds a certificate
rather than on page load. pdf-lib subsets again on embed, so a certificate carries only the glyphs
it actually draws.

## Two things that will bite

- **Do not reformat the generated file.** Splitting the base64 into concatenated chunks builds an
  expression tree deep enough to overflow esbuild's parser; `svelte-check` then fails with
  `Maximum call stack size exceeded` and a Go deadlock trace that names nothing useful.
- **fontkit's own `createSubset()` is not usable here.** It targets PDF embedding, where glyphs are
  addressed by id, and drops the `cmap`. pdf-lib then fails to re-embed the result with
  `Cannot read properties of undefined (reading 'records')`. The script uses harfbuzz
  (`subset-font`) instead, which emits a complete font.
