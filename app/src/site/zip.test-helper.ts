import { inflateRawSync } from 'node:zlib';
import { expect } from 'vitest';
import { crc32 } from './zip';

/** Reads back what zip() wrote, from its central directory, as an unzipper does. */
export function unzip(bytes: Uint8Array): Record<string, string> {
  const b = Buffer.from(bytes);
  const end = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = b.readUInt16LE(end + 10);
  let p = b.readUInt32LE(end + 16);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    const size = b.readUInt32LE(p + 20);
    const nameLen = b.readUInt16LE(p + 28);
    const at = b.readUInt32LE(p + 42);
    const name = b.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    const data = inflateRawSync(b.subarray(at + 30 + b.readUInt16LE(at + 26), at + 30 + b.readUInt16LE(at + 26) + size));
    expect(crc32(data), name).toBe(b.readUInt32LE(p + 16));
    out[name] = data.toString('utf8');
    p += 46 + nameLen + b.readUInt16LE(p + 30) + b.readUInt16LE(p + 32);
  }
  return out;
}
