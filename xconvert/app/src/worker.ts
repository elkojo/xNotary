/// <reference lib="webworker" />
/**
 * The converters, off the main thread: pandoc (~110 MiB of memory once running) and, for
 * PDF, our Typst wrapper. Each is fetched from this site the first time it is needed and
 * kept for the life of the worker; the screen stays responsive throughout.
 */
import { FONT_FILES, PANDOC_WASM, TYPST_WASM } from './lib/assets';
import { ConversionError, convert } from './lib/convert';
import { createPandoc, type Pandoc } from './lib/pandoc';
import { createTypstPdf, type TypstPdf } from './lib/typst-pdf';
import type { FromWorker, ToWorker } from './lib/protocol';

declare const self: DedicatedWorkerGlobalScope;
const post = (message: FromWorker, transfer: Transferable[] = []) => self.postMessage(message, transfer);

/**
 * Fetches a gzipped binary from this site, reporting progress, and inflates it here.
 *
 * Served as application/gzip, so the bytes normally arrive compressed. Should a server
 * decompress it on the way (Content-Encoding), they arrive raw instead — told apart by
 * gzip's magic number rather than trusted to headers.
 */
async function fetchBinary(path: string, onProgress: (loaded: number, total: number) => void): Promise<ArrayBuffer> {
  const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
  if (!response.ok || !response.body) throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes.buffer;
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

let pandoc: Promise<Pandoc> | null = null;
let typst: Promise<TypstPdf> | null = null;

const loadPandoc = (id: number) =>
  (pandoc ??= fetchBinary(PANDOC_WASM, (loaded, total) => post({ id, kind: 'progress', stage: 'pandoc', loaded, total })).then(
    (wasm) => createPandoc(wasm),
  ));

const loadTypst = (id: number) =>
  (typst ??= (async () => {
    const wasm = await fetchBinary(TYPST_WASM, (loaded, total) => post({ id, kind: 'progress', stage: 'typst', loaded, total }));
    const fonts = await Promise.all(
      FONT_FILES.map(async (f) => new Uint8Array(await (await fetch(`${import.meta.env.BASE_URL}vendor/fonts/${f}`)).arrayBuffer())),
    );
    return createTypstPdf(wasm, fonts);
  })());

self.onmessage = async ({ data }: MessageEvent<ToWorker>) => {
  const { id } = data;
  try {
    // A failed load is not cached: the next request tries again.
    const engine = await loadPandoc(id).catch((e) => {
      pandoc = null;
      throw e;
    });
    if (data.kind === 'load') {
      post({ id, kind: 'loaded' });
    } else if (data.kind === 'formats') {
      post({ id, kind: 'formats', inputs: engine.query('input-formats') as string[], outputs: engine.query('output-formats') as string[] });
    } else {
      const result = await convert(data.request, engine, () =>
        loadTypst(id).catch((e) => {
          typst = null;
          throw e;
        }),
      );
      post({ id, kind: 'converted', result }, [result.bytes.buffer]);
    }
  } catch (e) {
    post({
      id,
      kind: 'failed',
      message: e instanceof ConversionError ? e.message : 'The converter could not run.',
      detail: e instanceof ConversionError ? e.detail : String(e instanceof Error ? e.message : e),
    });
  }
};
