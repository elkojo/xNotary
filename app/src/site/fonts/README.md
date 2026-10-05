# The site's text face

`InterVariable.woff2` is [Inter](https://rsms.me/inter/) 4.1 by Rasmus Andersson and the Inter
Project Authors, under the SIL Open Font License 1.1 (`OFL.txt`, which must travel with it).

It is a subset, not the release file. It covers Latin through Extended-B plus the punctuation,
arrows and symbols the pages use. It keeps the weight axis and pins optical size to text (14).
That takes it from 352 KB to about 112 KB. `npm run fonts:inter` regenerates it; the script
records the source and its checksum.

All four builds load it through the `@font-face` in `src/app.css`. Each service's third-party
notices name it: `fontNotice()` in `notice.ts` for the generated ones, and by hand in
`xsignature/THIRD-PARTY.md`.

This is the face for the pages only. The certificates embed Liberation; see
`src/lib/fonts/README.md`.
