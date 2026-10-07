import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The screen's side of LibreOffice's worker: starting it, running out of threads and starting
 * again with more, cancelling, and a worker that dies. The worker is a fake, scripted per test.
 */
vi.mock('./converter', () => ({ controlled: async () => undefined, stopPandoc: () => undefined }));

type Listener = (e: { data?: unknown; message?: string }) => void;
interface Script {
  /** What the fake does with a convert request, given the threads it was started with. */
  onConvert: (worker: FakeWorker, id: number) => void;
}

let script: Script;
let workers: FakeWorker[] = [];

class FakeWorker {
  listeners: Record<string, Listener[]> = {};
  threads = 0;
  terminated = false;
  constructor(readonly url: string) {
    workers.push(this);
    queueMicrotask(() => this.emit('message', { type: 'loaded' }));
  }
  addEventListener(type: string, listener: Listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  emit(type: string, data: unknown, message?: string) {
    if (this.terminated) return;
    for (const l of this.listeners[type] ?? []) l({ data, message });
  }
  postMessage(m: { type: string; id: number; threads?: number }) {
    if (m.type === 'init') {
      this.threads = m.threads!;
      queueMicrotask(() => this.emit('message', { type: 'ready', id: m.id }));
    }
    if (m.type === 'convert') queueMicrotask(() => script.onConvert(this, m.id));
  }
  terminate() {
    this.terminated = true;
  }
}

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const result = (w: FakeWorker, id: number) => w.emit('message', { type: 'result', id, data: PDF });
/** A document that needs `need` threads: the pool runs dry below that, as the patched glue says. */
const needs = (need: number) => (w: FakeWorker, id: number) =>
  w.threads < need ? w.emit('message', { type: 'xconvert-threads-exhausted', threads: w.threads }) : result(w, id);

async function load() {
  vi.resetModules();
  return import('./libreoffice');
}

beforeEach(() => {
  workers = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('document', { baseURI: 'https://x.test/xconvert/' });
  vi.stubGlobal('sessionStorage', { getItem: () => null });
});
afterEach(() => vi.unstubAllGlobals());

describe('convertKeepingLayout', () => {
  it('starts LibreOffice with eight threads and returns its PDF', async () => {
    const { convertKeepingLayout } = await load();
    script = { onConvert: result };
    expect(await convertKeepingLayout(new Uint8Array([1]), 'docx')).toEqual(PDF);
    expect(workers.map((w) => w.threads)).toEqual([8]);
  });

  it('starts again with twice the threads when a document runs the pool dry', async () => {
    const { convertKeepingLayout } = await load();
    script = { onConvert: needs(12) };
    const labels: string[] = [];
    expect(await convertKeepingLayout(new Uint8Array([1]), 'docx', (p) => labels.push(p.label))).toEqual(PDF);
    expect(workers.map((w) => w.threads)).toEqual([8, 16]);
    expect(workers[0].terminated).toBe(true);
    expect(labels).toContain('Starting again with more threads');
  });

  it('keeps the larger pool for the next document', async () => {
    const { convertKeepingLayout } = await load();
    script = { onConvert: needs(12) };
    await convertKeepingLayout(new Uint8Array([1]), 'docx');
    script = { onConvert: result };
    await convertKeepingLayout(new Uint8Array([2]), 'docx');
    expect(workers.at(-1)!.threads).toBe(16);
  });

  it('stops doubling at the ceiling and lets that run carry on', async () => {
    const { convertKeepingLayout, MAX_THREADS } = await load();
    script = {
      onConvert: (w, id) => {
        w.emit('message', { type: 'xconvert-threads-exhausted', threads: w.threads });
        if (w.threads >= MAX_THREADS) result(w, id); // a browser that copes on demand
      },
    };
    expect(await convertKeepingLayout(new Uint8Array([1]), 'docx')).toEqual(PDF);
    expect(workers.map((w) => w.threads)).toEqual([8, 16, 32]);
  });

  it('cancels: the conversion rejects as cancelled and LibreOffice is stopped', async () => {
    const { convertKeepingLayout, cancelKeepingLayout, LayoutCancelled } = await load();
    script = { onConvert: () => undefined }; // never answers, like the deadlock
    const run = convertKeepingLayout(new Uint8Array([1]), 'docx');
    await vi.waitFor(() => expect(workers[0]?.threads).toBe(8));
    cancelKeepingLayout();
    await expect(run).rejects.toBeInstanceOf(LayoutCancelled);
    expect(workers[0].terminated).toBe(true);
    script = { onConvert: result };
    expect(await convertKeepingLayout(new Uint8Array([1]), 'docx')).toEqual(PDF);
    expect(workers).toHaveLength(2);
  });

  it('cancels a start that is still on its way', async () => {
    const { convertKeepingLayout, cancelKeepingLayout, LayoutCancelled } = await load();
    script = { onConvert: result };
    const run = convertKeepingLayout(new Uint8Array([1]), 'docx');
    cancelKeepingLayout();
    await expect(run).rejects.toBeInstanceOf(LayoutCancelled);
  });

  it('fails, rather than waiting forever, when the worker dies mid-conversion', async () => {
    const { convertKeepingLayout } = await load();
    script = { onConvert: (w) => w.emit('error', undefined, 'out of memory') };
    await expect(convertKeepingLayout(new Uint8Array([1]), 'docx')).rejects.toThrow('out of memory');
  });

  it('starts with the number e2e asks for', async () => {
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => (k === 'xconvert:test-threads' ? '2' : null) });
    const { convertKeepingLayout } = await load();
    script = { onConvert: needs(4) };
    await convertKeepingLayout(new Uint8Array([1]), 'docx');
    expect(workers.map((w) => w.threads)).toEqual([2, 4]);
  });
});
