/**
 * The real Typst wrapper and fonts, for tests. They come from public/vendor/, which
 * `npm run vendor` fills (checksum-pinned, offline once cached); a missing file fails with
 * that instruction rather than skipping, because a skipped test proves nothing.
 *
 * pandoc is not here: it needs WebAssembly exception handling, which Node 18 lacks. It is
 * tested in a browser, by scripts/e2e.mjs.
 */
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { FONT_FILES } from './assets';
import { createTypstPdf, type TypstPdf } from './typst-pdf';

const VENDOR = new URL('../../public/vendor/', import.meta.url);

export function vendored(path: string): Uint8Array<ArrayBuffer> {
  const url = new URL(path, VENDOR);
  if (!existsSync(url)) throw new Error(`public/vendor/${path} is missing — run \`npm run vendor\` first.`);
  const bytes = readFileSync(url);
  // Copied into a plain ArrayBuffer, which is what WebAssembly and Blob accept.
  return new Uint8Array(path.endsWith('.gz') ? gunzipSync(bytes) : bytes);
}

let typst: Promise<TypstPdf> | null = null;

export const testTypst = () =>
  (typst ??= createTypstPdf(vendored('typst-pdf.wasm.gz'), FONT_FILES.map((f) => vendored(`fonts/${f}`))));

export const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../../fixtures/${name}`, import.meta.url)));
