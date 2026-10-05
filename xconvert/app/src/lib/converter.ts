/**
 * The screen's side of the converter worker: one promise per request, progress on the way.
 * The worker is started on first use and kept, so pandoc is downloaded and started once.
 */
import type { ConvertRequest, ConvertResult } from './convert';
import type { FromWorker, Progress, ToWorker } from './protocol';

export class ConverterError extends Error {
  constructor(
    message: string,
    readonly detail: string,
  ) {
    super(message);
  }
}

/** Omit, applied to each member of a union rather than to the union as a whole. */
type Without<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type Pending = { resolve: (m: FromWorker) => void; reject: (e: Error) => void; onProgress?: (p: Progress) => void };

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function start(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('../worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }: MessageEvent<FromWorker>) => {
    const waiting = pending.get(data.id);
    if (!waiting) return;
    if (data.kind === 'progress') return waiting.onProgress?.(data);
    pending.delete(data.id);
    if (data.kind === 'failed') waiting.reject(new ConverterError(data.message, data.detail));
    else waiting.resolve(data);
  };
  worker.onerror = (event) => {
    for (const waiting of pending.values()) waiting.reject(new ConverterError('The converter stopped.', event.message));
    pending.clear();
    worker = null;
  };
  return worker;
}

function ask(message: Without<ToWorker, 'id'>, onProgress?: (p: Progress) => void, transfer: Transferable[] = []): Promise<FromWorker> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    start().postMessage({ ...message, id } as ToWorker, transfer);
  });
}

/** Fetches and starts pandoc ahead of the first conversion. */
export const preload = (onProgress?: (p: Progress) => void) => ask({ kind: 'load' }, onProgress).then(() => undefined);

/** Every format pandoc reads and writes, by pandoc's own names. */
export async function formats(): Promise<{ inputs: string[]; outputs: string[] }> {
  const reply = await ask({ kind: 'formats' });
  if (reply.kind !== 'formats') throw new Error(`unexpected reply ${reply.kind}`);
  return { inputs: reply.inputs, outputs: reply.outputs };
}

export async function convertDocument(request: ConvertRequest, onProgress?: (p: Progress) => void): Promise<ConvertResult> {
  // A copy is transferred, so the screen keeps the original for another conversion.
  const input = { ...request.input, bytes: request.input.bytes.slice() };
  const reply = await ask({ kind: 'convert', request: { ...request, input } }, onProgress, [input.bytes.buffer]);
  if (reply.kind !== 'converted') throw new Error(`unexpected reply ${reply.kind}`);
  return reply.result;
}
