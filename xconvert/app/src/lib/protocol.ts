/** Messages between the screen and the converter worker (src/worker.ts). */
import type { ConvertRequest, ConvertResult } from './convert';

export type ToWorker =
  | { readonly id: number; readonly kind: 'load' }
  | { readonly id: number; readonly kind: 'formats' }
  | { readonly id: number; readonly kind: 'convert'; readonly request: ConvertRequest };

export type FromWorker =
  | { readonly id: number; readonly kind: 'progress'; readonly stage: 'pandoc' | 'typst'; readonly loaded: number; readonly total: number }
  | { readonly id: number; readonly kind: 'loaded' }
  | { readonly id: number; readonly kind: 'formats'; readonly inputs: string[]; readonly outputs: string[] }
  | { readonly id: number; readonly kind: 'converted'; readonly result: ConvertResult }
  | { readonly id: number; readonly kind: 'failed'; readonly message: string; readonly detail: string };

export type Progress = Extract<FromWorker, { kind: 'progress' }>;
