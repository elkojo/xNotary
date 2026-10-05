/**
 * Our Typst wrapper (xconvert/typst-pdf): Typst source, its images and fonts in; PDF or
 * PDF/A-2b out.
 *
 * The module imports nothing — its build fails if it ever does — so it is instantiated
 * with an empty import object and can reach nothing but what is copied into its memory.
 * It does not read the clock either: the caller passes the date, which PDF/A requires.
 */

export type PdfStandard = 'pdf' | 'pdf-a-2b';

export type TypstResult = { ok: true; pdf: Uint8Array } | { ok: false; diagnostics: string };

export interface TypstPdf {
  /** How many font faces were loaded. */
  readonly faces: number;
  /**
   * Compiles `source` with `files` readable at their paths (e.g. `/media/image1.png`).
   * Files from an earlier call are forgotten first; fonts are kept.
   */
  compile(source: string, files: ReadonlyMap<string, Uint8Array>, standard: PdfStandard, now: Date): TypstResult;
}

interface Exports {
  memory: WebAssembly.Memory;
  xc_alloc(len: number): number;
  xc_free(ptr: number, len: number): void;
  xc_add_font(ptr: number, len: number): number;
  xc_add_file(pathPtr: number, pathLen: number, ptr: number, len: number): number;
  xc_reset_files(): void;
  xc_compile(ptr: number, len: number, standard: number, y: number, mo: number, d: number, h: number, mi: number, s: number): number;
  xc_output_ptr(): number;
  xc_output_len(): number;
}

const STANDARDS: Record<PdfStandard, number> = { pdf: 0, 'pdf-a-2b': 1 };

export async function createTypstPdf(wasm: BufferSource, fonts: readonly Uint8Array[]): Promise<TypstPdf> {
  const { instance } = await WebAssembly.instantiate(wasm, {});
  const x = instance.exports as unknown as Exports;

  /** Copies `data` into the module for the length of `use`, then frees it. */
  function lend<T>(data: Uint8Array, use: (ptr: number, len: number) => T): T {
    const ptr = x.xc_alloc(data.byteLength);
    new Uint8Array(x.memory.buffer, ptr, data.byteLength).set(data);
    try {
      return use(ptr, data.byteLength);
    } finally {
      x.xc_free(ptr, data.byteLength);
    }
  }
  const output = () => new Uint8Array(x.memory.buffer, x.xc_output_ptr(), x.xc_output_len()).slice();
  const utf8 = (text: string) => new TextEncoder().encode(text);

  const faces = fonts.reduce((n, font) => n + lend(font, (p, l) => x.xc_add_font(p, l)), 0);

  return {
    faces,
    compile(source, files, standard, now) {
      x.xc_reset_files();
      for (const [path, data] of files) {
        lend(utf8(path), (pp, pl) => lend(data, (dp, dl) => x.xc_add_file(pp, pl, dp, dl)));
      }
      const status = lend(utf8(source), (p, l) =>
        x.xc_compile(
          p, l, STANDARDS[standard],
          now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
          now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds(),
        ),
      );
      return status === 0 ? { ok: true, pdf: output() } : { ok: false, diagnostics: new TextDecoder().decode(output()) };
    },
  };
}
