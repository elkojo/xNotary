/**
 * Whether this browser can run pandoc 3.12's WebAssembly.
 *
 * pandoc is compiled with WebAssembly's exception handling (`try_table`, `exnref`), in
 * every major browser since 2025 — Safari last, at 18.4. An older engine fails only after
 * the 16 MB download, with a compile error nobody can act on; this asks first, with a
 * module of a few bytes, so the screen can say so before anything is fetched.
 */
// (module (func try_table end))
const TRY_TABLE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic, version 1
  0x01, 0x04, 0x01, 0x60, 0x00, 0x00, // type section: () -> ()
  0x03, 0x02, 0x01, 0x00, // function section: one function of type 0
  0x0a, 0x08, 0x01, 0x06, 0x00, 0x1f, 0x40, 0x00, 0x0b, 0x0b, // code: try_table (no catches) end end
]);

export const PROBE_FOR_TESTS = TRY_TABLE;

export function canRunPandoc(): boolean {
  return typeof WebAssembly === 'object' && WebAssembly.validate(TRY_TABLE);
}
