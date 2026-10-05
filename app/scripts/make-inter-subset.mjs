/**
 * Builds the site's text face: app/src/site/fonts/InterVariable.woff2.
 *
 * Every page named Inter but none shipped it, so most visitors saw their system
 * font and the site looked different on each OS. This subsets Inter 4.1's
 * variable web font to the scripts the pages and the names typed into them use,
 * keeps the weight axis (the CSS uses weights such as 730 and 780), and pins
 * optical size to text (14): 352 KB becomes about 112 KB.
 *
 *   npm run fonts:inter -- /path/to/Inter-4.1/web/InterVariable.woff2
 *
 * The source is web/InterVariable.woff2 in Inter-4.1.zip from
 * https://github.com/rsms/inter/releases/tag/v4.1
 * (sha256 9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e).
 * The output is committed, with OFL.txt beside it as the licence requires.
 */
import fontkit from '@pdf-lib/fontkit';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const source = process.argv[2];
if (!source) {
  console.error('usage: npm run fonts:inter -- /path/to/InterVariable.woff2');
  process.exit(2);
}
const OUT = fileURLToPath(new URL('../src/site/fonts/InterVariable.woff2', import.meta.url));

// Latin through Extended-B (Czech and the rest of Europe's Latin scripts), then the
// punctuation, arrows and symbols the pages use. Inter has no ⇄ ⋯ ⓘ ▸ ▾; those fall
// back to the system font, as before.
const RANGES = [
  [0x20, 0x7e], [0xa0, 0x24f], [0x2000, 0x206f], [0x20a0, 0x20cf], [0x2100, 0x21ff],
  [0x2200, 0x22ff], [0x2300, 0x23ff], [0x2460, 0x24ff], [0x25a0, 0x25ff], [0x2700, 0x27bf],
];
let text = '';
for (const [from, to] of RANGES) for (let c = from; c <= to; c++) text += String.fromCodePoint(c);

const out = await subsetFont(readFileSync(source), text, {
  targetFormat: 'woff2',
  preserveNameIds: [0, 1, 2, 3, 4, 5, 6, 13, 14], // copyright, names, licence
  variationAxes: { opsz: 14 },
});
writeFileSync(OUT, out);

const font = fontkit.create(out);
const missing = [...'ŘřĚěČčŮůŤťŇňĎďŠšŽžÁáÍíÝý—’“”…←→✓✗●'].filter((c) => !font.hasGlyphForCodePoint(c.codePointAt(0)));
if (missing.length) throw new Error(`the subset lost ${missing.join(' ')}`);
console.log(`${OUT}: ${out.length} bytes, ${font.numGlyphs} glyphs, axes ${Object.keys(font.variationAxes).join(', ')}`);
