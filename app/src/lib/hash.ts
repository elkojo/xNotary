/**
 * Local hashing. Everything here runs on the user's device — no bytes of the
 * user's file ever leave it; only the resulting 32-byte digest is submitted to
 * OpenTimestamps calendars.
 */

/** Streaming chunk size for reading large files without pinning them in memory. */
const CHUNK_SIZE = 8 * 1024 * 1024;

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.trim().replace(/\s+/g, '').toLowerCase();
  if (clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) {
    throw new Error('Not a valid hex string');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Group a hex digest for display: `a1b2 c3d4 ...`. */
export function groupHex(hex: string, group = 4): string {
  return (hex.match(new RegExp(`.{1,${group}}`, 'g')) ?? []).join(' ');
}

export async function sha256Bytes(data: Uint8Array | ArrayBuffer): Promise<Uint8Array> {
  const buf = data instanceof Uint8Array ? bufferOf(data) : data;
  return new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
}

/**
 * SHA-256 of a File/Blob, read in chunks so multi-gigabyte files do not have to
 * be materialised in memory at once.
 *
 * WebCrypto has no incremental digest API, so we use @noble/hashes for the
 * streaming path and fall back to `crypto.subtle` for small inputs, where it is
 * both faster and one less implementation to trust.
 */
export async function sha256File(
  file: Blob,
  onProgress?: (bytesRead: number, total: number) => void,
): Promise<Uint8Array> {
  if (file.size <= CHUNK_SIZE) {
    const buf = await file.arrayBuffer();
    onProgress?.(file.size, file.size);
    return sha256Bytes(buf);
  }

  const { sha256 } = await import('@noble/hashes/sha256');
  const hasher = sha256.create();
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = new Uint8Array(await file.slice(offset, end).arrayBuffer());
    hasher.update(chunk);
    offset = end;
    onProgress?.(offset, file.size);
  }
  return hasher.digest();
}

/** Narrow a possibly-offset view to a standalone ArrayBuffer. */
function bufferOf(view: Uint8Array): ArrayBuffer {
  if (view.byteOffset === 0 && view.byteLength === view.buffer.byteLength) {
    return view.buffer as ArrayBuffer;
  }
  return view.slice().buffer as ArrayBuffer;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}
