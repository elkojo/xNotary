/**
 * "Keep the layout": Word and OpenDocument to PDF/A with LibreOffice, compiled to WebAssembly.
 *
 * pandoc keeps a document's structure and re-typesets it; LibreOffice lays the document out as a
 * word processor would print it — headers and footers, fonts, tables, numbering, page breaks. It
 * costs about 73 MB, downloaded once, and around 2 GB of memory while it converts, so it is offered
 * on computers only and only when asked for. See docs/xconvert-spike.md, "LibreOffice route".
 *
 * The worker is the converter package's own (vendor/libreoffice/libreoffice.worker.js, patched by
 * scripts/patch-libreoffice.mjs); this is the screen's side of its message protocol.
 */
import { controlled, stopPandoc } from './converter';

const DIR = 'vendor/libreoffice/';

/** The formats LibreOffice converts here. pandoc stays the route for everything else. */
export const LAYOUT_INPUTS = ['docx', 'odt'] as const;
export type LayoutInput = (typeof LAYOUT_INPUTS)[number];
export const keepsLayout = (format: string | null): format is LayoutInput =>
  (LAYOUT_INPUTS as readonly string[]).includes(format ?? '');

/**
 * About what the first use downloads, for the screen to say before it starts. In the units the
 * progress counts in (formatBytes: 1 MB = 1024² bytes), so the promise and the count agree;
 * libreoffice.test.ts derives it from the shipped parts.
 */
export const DOWNLOAD_MB = 73;

/**
 * Whether to offer it at all: threads need a cross-origin-isolated page, and the memory it needs
 * rules out phones and tablets. Those report a coarse primary pointer; computers report a fine
 * one (or none, headless). Where the browser says how much memory the device has, under 4 GB is
 * also a no.
 */
export function canKeepLayout(): boolean {
  if (typeof self === 'undefined' || self.crossOriginIsolated !== true) return false;
  if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return false;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return memory === undefined || memory >= 4;
}

/**
 * LibreOffice's PDF export options. PDF/A-2b, as for pandoc; and no comments, because Word and
 * OpenDocument comments become PDF notes without an appearance, which PDF/A forbids (veraPDF
 * 6.3.3-1). Printing them in the margin instead hangs this build.
 */
export const PDF_EXPORT_OPTIONS = JSON.stringify({
  ExportNotes: { type: 'boolean', value: 'false' },
  SelectPdfVersion: { type: 'long', value: '2' },
});

/**
 * Where LibreOffice is, for the screen. `loaded`/`total` are bytes, and only the download has
 * them: it is the one stage whose progress is measured. LibreOffice's own stages come with a
 * percentage too, but it marks the stage rather than measuring it — "Saving… 70%" stays at 70
 * for as long as a long document takes to lay out — so it is not shown as one.
 */
export interface LayoutProgress {
  readonly label: string;
  readonly loaded: number | null;
  readonly total: number | null;
}

interface RawProgress {
  readonly percent?: number;
  readonly message: string;
  readonly loaded?: number;
  readonly total?: number;
}

/** LibreOffice's stage messages, in the screen's words. Anything unknown is "Working". */
const STAGES: ReadonlyArray<readonly [RegExp, string]> = [
  [/WebAssembly|WASM|LibreOfficeKit|^Initializing|^Setting up|^Ready/i, 'Starting LibreOffice'],
  [/^Writing input|^Loading document/i, 'Opening the document'],
  [/^Converting|^Saving/i, 'Laying out the PDF'],
  [/^Reading output|^Complete/i, 'Finishing'],
];

export function layoutStage(raw: RawProgress): LayoutProgress {
  if (typeof raw.loaded === 'number' && typeof raw.total === 'number' && raw.total > 0) {
    return { label: 'Downloading the layout converter, once', loaded: raw.loaded, total: raw.total };
  }
  const label = STAGES.find(([pattern]) => pattern.test(raw.message))?.[1] ?? 'Working';
  return { label, loaded: null, total: null };
}

type Message =
  | { type: 'loaded' }
  | { type: 'progress'; progress?: RawProgress }
  | { type: 'xconvert-threads-exhausted' }
  | { type: 'ready' | 'result' | 'error'; id: number; data?: Uint8Array; error?: string };

/** Raised by cancelKeepingLayout, so the screen can tell a cancel from a failure. */
export class LayoutCancelled extends Error {
  constructor() {
    super('Cancelled.');
  }
}

/** LibreOffice ran out of threads; the conversion starts again with twice as many. */
class OutOfThreads extends Error {}

/**
 * Threads LibreOffice is started with. Emscripten starts any beyond these on demand, which
 * deadlocks in Brave while LibreOffice exports (docs/xconvert-spike.md). Documents of every size
 * measured peak at four or five, so eight is the start; one that needs more is said so by the
 * patched glue, and converted again with twice as many, up to MAX_THREADS.
 */
export const MAX_THREADS = 32;
let threads: number | null = null;

function initialThreads(): number {
  // A seam for e2e, which starts with fewer threads to see a document run out and convert anyway.
  try {
    const n = Number(sessionStorage.getItem('xconvert:test-threads'));
    if (Number.isInteger(n) && n >= 1) return n;
  } catch {
    // no storage: the default
  }
  return 8;
}

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (m: Message) => void; reject: (e: Error) => void }>();
let onProgress: ((p: LayoutProgress) => void) | undefined;
/** Bumped by stop(), so a start that is still on its way gives up rather than carrying on. */
let generation = 0;
let abortStart: ((e: Error) => void) | null = null;

function request(type: string, body: Record<string, unknown>, transfer: Transferable[] = []): Promise<Message> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker!.postMessage({ type, id, ...body }, transfer);
  });
}

/** Ends LibreOffice and everything waiting on it with `reason`; the next request starts afresh. */
function stop(reason: Error): void {
  generation += 1;
  abortStart?.(reason);
  abortStart = null;
  for (const p of pending.values()) p.reject(reason);
  pending.clear();
  worker?.terminate();
  worker = null;
  ready = null;
}

function start(): Promise<void> {
  ready ??= (async () => {
    const mine = generation;
    threads ??= initialThreads();
    await controlled();
    if (mine !== generation) throw new LayoutCancelled();
    const base = new URL(DIR, document.baseURI).pathname;
    worker = new Worker(base + 'libreoffice.worker.js');
    const loaded = new Promise<void>((resolve, reject) => {
      abortStart = reject;
      worker!.addEventListener('error', (e) => {
        const error = new Error(e.message || 'The layout converter stopped.');
        reject(error);
        stop(error);
      });
      worker!.addEventListener('message', (e: MessageEvent<Message>) => {
        const m = e.data;
        if (m.type === 'loaded') return resolve();
        if (m.type === 'progress') {
          if (m.progress) onProgress?.(layoutStage(m.progress));
          return;
        }
        if (m.type === 'xconvert-threads-exhausted') {
          // At the ceiling, let it try on demand: some browsers cope, and Cancel is there.
          if (threads! >= MAX_THREADS) return;
          threads = Math.min(MAX_THREADS, threads! * 2);
          return stop(new OutOfThreads());
        }
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        if (m.type === 'error') p.reject(new Error(m.error ?? 'Unknown error'));
        else p.resolve(m);
      });
    });
    await loaded;
    abortStart = null;
    await request('init', {
      sofficeJs: base + 'soffice.js',
      sofficeWasm: base + 'soffice.wasm',
      sofficeData: base + 'soffice.data',
      sofficeWorkerJs: base + 'soffice.worker.js',
      enableProgressTracking: false,
      verbose: false,
      threads,
    });
  })().catch((e) => {
    // A failed start can be retried from scratch.
    if (!(e instanceof LayoutCancelled || e instanceof OutOfThreads)) stop(e);
    throw e;
  });
  return ready;
}

/** Converts a DOCX or ODT to PDF/A-2b, starting (and on first use downloading) LibreOffice. */
export async function convertKeepingLayout(
  bytes: Uint8Array,
  format: LayoutInput,
  progress?: (p: LayoutProgress) => void,
): Promise<Uint8Array> {
  onProgress = progress;
  stopPandoc();
  try {
    for (;;) {
      try {
        await start();
        const input = bytes.slice();
        const reply = await request(
          'convert',
          { inputData: input, inputExt: format, outputFormat: 'pdf', filterOptions: PDF_EXPORT_OPTIONS },
          [input.buffer],
        );
        if (!(reply.type === 'result' && reply.data instanceof Uint8Array)) throw new Error('LibreOffice returned no PDF.');
        return reply.data;
      } catch (e) {
        if (!(e instanceof OutOfThreads)) throw e;
        onProgress?.({ label: 'Starting again with more threads', loaded: null, total: null });
      }
    }
  } finally {
    onProgress = undefined;
  }
}

/** Stops a Keep-the-layout conversion. LibreOffice stays downloaded; the next one starts it again. */
export function cancelKeepingLayout(): void {
  stop(new LayoutCancelled());
}

// --- Does the document have comments? ---------------------------------------------------------

/** Inflates raw DEFLATE; the browser's is DecompressionStream, a test's may be zlib's. */
export type InflateRaw = (bytes: Uint8Array) => Promise<Uint8Array>;

export const browserInflateRaw: InflateRaw = async (bytes) =>
  new Uint8Array(await new Response(new Blob([bytes.slice()]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());

/** One entry of a ZIP file, read from its central directory: enough for DOCX and ODT. */
async function zipEntry(zip: Uint8Array, name: string, inflateRaw: InflateRaw): Promise<Uint8Array | null> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  // The end-of-central-directory record is in the last 64 KiB + 22 bytes.
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  const wanted = new TextEncoder().encode(name);
  for (let n = 0; n < entries && at + 46 <= zip.length; n++) {
    if (view.getUint32(at, true) !== 0x02014b50) return null;
    const method = view.getUint16(at + 10, true);
    const compressed = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const entryName = zip.subarray(at + 46, at + 46 + nameLength);
    if (entryName.length === wanted.length && entryName.every((b, i) => b === wanted[i])) {
      const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const data = zip.subarray(dataAt, dataAt + compressed);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      return null;
    }
    at += 46 + nameLength + extraLength + commentLength;
  }
  return null;
}

/**
 * Whether a DOCX or ODT carries comments, which "Keep the layout" leaves out. A DOCX keeps them
 * in word/comments.xml; an ODT, as <office:annotation> in content.xml. When in doubt (a file
 * that cannot be read as a ZIP), the answer is no: the note is about what is dropped, and an
 * unreadable file fails in the converter with its own message.
 */
export async function hasComments(bytes: Uint8Array, format: LayoutInput, inflateRaw: InflateRaw = browserInflateRaw): Promise<boolean> {
  try {
    if (format === 'docx') {
      const xml = await zipEntry(bytes, 'word/comments.xml', inflateRaw);
      return !!xml && new TextDecoder().decode(xml).includes('<w:comment ');
    }
    const content = await zipEntry(bytes, 'content.xml', inflateRaw);
    return !!content && new TextDecoder().decode(content).includes('<office:annotation');
  } catch {
    return false;
  }
}
