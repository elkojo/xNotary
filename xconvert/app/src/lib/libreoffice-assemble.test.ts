import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/**
 * scripts/libreoffice-assemble.js, run as the worker runs it: a plain script in a scope of its
 * own, against a fake origin that can drop a connection mid-part, ignore Range, or refuse.
 */
const SOURCE = readFileSync(new URL('../../scripts/libreoffice-assemble.js', import.meta.url), 'utf8');

interface Origin {
  files: Record<string, Uint8Array>;
  /** Drop the connection after this many bytes of the given file, once per entry. */
  drops?: Record<string, number[]>;
  honoursRange?: boolean;
  log: string[];
}

function body(bytes: Uint8Array, dropAfter?: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (dropAfter !== undefined && sent >= dropAfter) return controller.error(new TypeError('network error'));
      const end = Math.min(bytes.length, sent + 1000, dropAfter ?? Infinity);
      if (sent >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(sent, end));
      sent = end;
    },
  });
}

function load(origin: Origin) {
  const messages: Array<{ percent: number; loaded: number; total: number }> = [];
  const posted: unknown[] = [];
  const listeners: Array<(e: { data: unknown }) => void> = [];
  const fetch = async (url: string, init?: { headers?: Record<string, string> }) => {
    const range = init?.headers?.Range;
    origin.log.push(range ? `${url} ${range}` : url);
    const file = origin.files[url];
    if (!file) return new Response('missing', { status: 404 });
    const from = range && origin.honoursRange ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0;
    const drop = origin.drops?.[url]?.shift();
    return new Response(body(file.slice(from), drop), { status: from ? 206 : 200 });
  };
  const scope: Record<string, unknown> = {
    fetch,
    Response,
    Blob,
    ReadableStream,
    DecompressionStream,
    setTimeout,
    Date,
    Promise,
    Math,
    Error,
    WebAssembly: { compileStreaming: async (r: Promise<Response> | Response) => new Uint8Array(await (await r).arrayBuffer()) },
    self: {
      postMessage: (m: { type: string; progress: { percent: number; loaded: number; total: number } }) =>
        m.type === 'progress' ? messages.push(m.progress) : posted.push(m),
      addEventListener: (_type: string, listener: (e: { data: unknown }) => void) => listeners.push(listener),
    },
  };
  runInNewContext(SOURCE, scope);
  (scope.self as Record<string, unknown>).__xconvertThreads = undefined;
  return { scope, messages, posted, listeners };
}

/** `data` gzipped and cut into parts of `size` bytes, with its manifest, under `name`. */
function ship(name: string, data: Uint8Array, size: number): Record<string, Uint8Array> {
  const gz = gzipSync(data);
  const files: Record<string, Uint8Array> = {};
  const parts: string[] = [];
  for (let i = 0; i * size < gz.length; i++) {
    const part = `${name}.gz.0${i}`;
    parts.push(part);
    files[`/v/${part}`] = new Uint8Array(gz.subarray(i * size, (i + 1) * size));
  }
  files[`/v/${name}.parts.json`] = new TextEncoder().encode(JSON.stringify({ parts, bytes: gz.length }));
  return files;
}

// Random, so gzip cannot shrink it below a part: each file really arrives in several.
const WASM = new Uint8Array(randomBytes(60_000));
const DATA = new Uint8Array(randomBytes(40_000));
const NO_WAIT = [0, 0, 0];

interface FakeModule {
  instantiateWasm?: unknown;
  getPreloadedPackage?: () => ArrayBuffer;
  xconvertThreads?: number;
  xconvertPoolExhausted?: () => void;
}

async function assemble(origin: Origin, init?: { threads: number }) {
  const { scope, messages, posted, listeners } = load(origin);
  if (init) for (const listener of listeners) listener({ data: { type: 'init', ...init } });
  const Module: FakeModule = {};
  let compiled: Uint8Array | undefined;
  (scope.WebAssembly as { compileStreaming: unknown }).compileStreaming = async (r: Response) =>
    (compiled = new Uint8Array(await r.arrayBuffer()));
  await (scope.__xconvertAssemble as (...a: unknown[]) => Promise<void>)(Module, '/v/soffice.wasm', '/v/soffice.data', NO_WAIT);
  return { compiled: compiled!, data: new Uint8Array(Module.getPreloadedPackage!()), messages, Module, posted };
}

const files = () => ({ ...ship('soffice.wasm', WASM, 20_000), ...ship('soffice.data', DATA, 20_000) });

describe('libreoffice-assemble', () => {
  it('joins and inflates the parts of both files', async () => {
    const { compiled, data } = await assemble({ files: files(), log: [] });
    expect(compiled).toEqual(WASM);
    expect(data).toEqual(DATA);
  });

  it('reports progress by the byte, across both files, ending at 100%', async () => {
    const all = files();
    const total = ['soffice.wasm', 'soffice.data']
      .map((n) => JSON.parse(new TextDecoder().decode(all[`/v/${n}.parts.json`])).bytes as number)
      .reduce((a, b) => a + b);
    const { messages } = await assemble({ files: all, log: [] });
    expect(messages.at(-1)).toMatchObject({ percent: 100, loaded: total, total });
    expect(messages.every((m) => m.total === total)).toBe(true);
    // Never backwards: one figure for the whole download, not one per file.
    expect(messages.map((m) => m.loaded)).toEqual([...messages.map((m) => m.loaded)].sort((a, b) => a - b));
  });

  it('resumes a dropped part where it stopped, with Range', async () => {
    const origin: Origin = { files: files(), drops: { '/v/soffice.wasm.gz.01': [7_000] }, honoursRange: true, log: [] };
    const { compiled } = await assemble(origin);
    expect(compiled).toEqual(WASM);
    expect(origin.log).toContain('/v/soffice.wasm.gz.01 bytes=7000-');
  });

  it('skips the bytes already in hand when the server ignores Range', async () => {
    const origin: Origin = { files: files(), drops: { '/v/soffice.data.gz.00': [5_000, 12_000] }, log: [] };
    const { data } = await assemble(origin);
    expect(data).toEqual(DATA);
    expect(origin.log.filter((l) => l.startsWith('/v/soffice.data.gz.00'))).toHaveLength(3);
  });

  it('gives up after three retries', async () => {
    const origin: Origin = { files: files(), drops: { '/v/soffice.wasm.gz.00': [100, 100, 100, 100] }, log: [] };
    await expect(assemble(origin)).rejects.toThrow('network error');
    expect(origin.log.filter((l) => l.startsWith('/v/soffice.wasm.gz.00'))).toHaveLength(4);
  });

  it('does not retry a refusal: a missing part is a broken deploy', async () => {
    const all = files();
    delete all['/v/soffice.data.gz.01'];
    const origin: Origin = { files: all, log: [] };
    await expect(assemble(origin)).rejects.toThrow('404');
    expect(origin.log.filter((l) => l.startsWith('/v/soffice.data.gz.01'))).toHaveLength(1);
  });

  it('starts eight threads unless the page asks for more', async () => {
    expect((await assemble({ files: files(), log: [] })).Module.xconvertThreads).toBe(8);
    expect((await assemble({ files: files(), log: [] }, { threads: 16 })).Module.xconvertThreads).toBe(16);
  });

  it('tells the page once when the thread pool runs dry', async () => {
    const { Module, posted } = await assemble({ files: files(), log: [] }, { threads: 16 });
    Module.xconvertPoolExhausted!();
    Module.xconvertPoolExhausted!();
    expect(posted).toEqual([{ type: 'xconvert-threads-exhausted', threads: 16 }]);
  });
});
