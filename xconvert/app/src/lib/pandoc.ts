/**
 * pandoc, compiled to WebAssembly, behind a small typed interface.
 *
 * Adapted from pandoc-wasm 1.1.0's `src/core.js` (MIT, © Tweag I/O Limited, Johannes Wilm
 * and pandoc-wasm contributors; notice in public/licences/pandoc-wasm-loader-MIT.txt). The
 * binary itself is pandoc's official release, fetched and checksum-pinned by
 * scripts/vendor.sh — not the copy that package bundles.
 *
 * pandoc runs as a WASI program over an in-memory file system. Nothing it does can reach
 * the network: there is no network in WASI preview 1, and the shim provides none.
 */
import { ConsoleStdout, Directory, File, OpenFile, PreopenDirectory, WASI } from '@bjorn3/browser_wasi_shim';

export interface PandocWarning {
  readonly type: string;
  readonly verbosity: 'INFO' | 'WARNING' | 'ERROR';
  readonly pretty: string;
  /** Set on some types, e.g. ScriptingWarning: the message without pandoc's preamble. */
  readonly message?: string;
}

export interface PandocResult {
  /** What pandoc wrote to standard output: the result, for text formats. */
  readonly stdout: Uint8Array;
  readonly stderr: string;
  readonly warnings: readonly PandocWarning[];
  /** The `output-file`, for formats pandoc only writes to a file (DOCX, ODT, EPUB…). */
  readonly output: Uint8Array | null;
  /** Images and other files pandoc extracted (`extract-media`), by path. */
  readonly media: ReadonlyMap<string, Uint8Array>;
}

export interface Pandoc {
  /** One conversion. `options` are pandoc's defaults-file options; `files` its inputs. */
  convert(options: Record<string, unknown>, files: Record<string, Uint8Array>): PandocResult;
  /** pandoc's own answers: `input-formats`, `output-formats`, `version`, … */
  query(what: string): unknown;
}

const SYSTEM_FILES = ['stdin', 'stdout', 'stderr', 'warnings'];
const decoder = new TextDecoder('utf-8');

export async function createPandoc(wasm: BufferSource): Promise<Pandoc> {
  // The RTS heap hint pandoc-wasm uses; pandoc's own argv[0] otherwise.
  const args = ['pandoc.wasm', '+RTS', '-H64m', '-RTS'];
  const fileSystem = new Map<string, File | Directory>();
  const wasi = new WASI(args, [], [
    new OpenFile(new File(new Uint8Array(), { readonly: true })),
    ConsoleStdout.lineBuffered(() => {}),
    ConsoleStdout.lineBuffered(() => {}),
    new PreopenDirectory('/', fileSystem),
  ]);

  const { instance } = await WebAssembly.instantiate(wasm, { wasi_snapshot_preview1: wasi.wasiImport });
  const x = instance.exports as {
    memory: WebAssembly.Memory;
    malloc(size: number): number;
    __wasm_call_ctors(): void;
    hs_init_with_rtsopts(argc: number, argv: number): void;
    convert(ptr: number, len: number): void;
    query(ptr: number, len: number): void;
  };
  wasi.initialize(instance as { exports: { memory: WebAssembly.Memory; _initialize?: () => unknown } });
  x.__wasm_call_ctors();

  // argc and argv for the Haskell runtime, written into pandoc's own memory.
  const view = () => new DataView(x.memory.buffer);
  const argc = x.malloc(4);
  view().setUint32(argc, args.length, true);
  const argv = x.malloc(4 * (args.length + 1));
  args.forEach((arg, i) => {
    const bytes = new TextEncoder().encode(arg);
    const ptr = x.malloc(bytes.length + 1);
    new Uint8Array(x.memory.buffer, ptr, bytes.length).set(bytes);
    view().setUint8(ptr + bytes.length, 0);
    view().setUint32(argv + 4 * i, ptr, true);
  });
  view().setUint32(argv + 4 * args.length, 0, true);
  const argvPtr = x.malloc(4);
  view().setUint32(argvPtr, argv, true);
  x.hs_init_with_rtsopts(argc, argvPtr);

  function passJson(value: unknown): [number, number] {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const ptr = x.malloc(bytes.length);
    new Uint8Array(x.memory.buffer, ptr, bytes.length).set(bytes);
    return [ptr, bytes.length];
  }

  function reset(): Record<string, File> {
    fileSystem.clear();
    const system = Object.fromEntries(SYSTEM_FILES.map((name) => [name, new File(new Uint8Array(), { readonly: name === 'stdin' })]));
    for (const [name, file] of Object.entries(system)) fileSystem.set(name, file);
    return system;
  }

  return {
    convert(options, files) {
      const system = reset();
      for (const [name, data] of Object.entries(files)) fileSystem.set(name, new File(data, { readonly: true }));
      const outputName = typeof options['output-file'] === 'string' ? options['output-file'] : null;
      if (outputName) fileSystem.set(outputName, new File(new Uint8Array(), { readonly: false }));

      x.convert(...passJson(options));

      const known = new Set([...SYSTEM_FILES, ...Object.keys(files), ...(outputName ? [outputName] : [])]);
      const media = new Map<string, Uint8Array>();
      const collect = (dir: Map<string, File | Directory>, prefix: string) => {
        for (const [name, entry] of dir) {
          const path = prefix ? `${prefix}/${name}` : name;
          if (entry instanceof Directory) collect(entry.contents as Map<string, File | Directory>, path);
          else if (!known.has(path) && entry.data.length > 0) media.set(path, entry.data);
        }
      };
      collect(fileSystem, '');

      const output = outputName ? (fileSystem.get(outputName) as File | undefined)?.data ?? null : null;
      const rawWarnings = decoder.decode(system.warnings.data);
      return {
        stdout: system.stdout.data,
        stderr: decoder.decode(system.stderr.data),
        warnings: rawWarnings ? (JSON.parse(rawWarnings) as PandocWarning[]) : [],
        output: output && output.length > 0 ? output : null,
        media,
      };
    },

    query(what) {
      const system = reset();
      x.query(...passJson({ query: what }));
      return JSON.parse(decoder.decode(system.stdout.data));
    },
  };
}
