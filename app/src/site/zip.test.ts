import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32, zip } from './zip';

/** Reads back what zip() wrote, from its central directory, as an unzipper does. */
function unzip(bytes: Uint8Array): Record<string, string> {
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

describe('zip', () => {
  const files = [{ path: 'xnotary/SKILL.md', data: new TextEncoder().encode('---\nname: x\n---\nPříliš žluťoučký kůň\n'.repeat(20)) }];

  it('writes what an unzipper reads back, byte for byte', () => {
    expect(unzip(zip(files))).toEqual({ 'xnotary/SKILL.md': '---\nname: x\n---\nPříliš žluťoučký kůň\n'.repeat(20) });
  });

  it('gives the same bytes for the same files', () => {
    expect(Buffer.from(zip(files)).equals(Buffer.from(zip(files)))).toBe(true);
  });

  it('knows the CRC-32 check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('opens with the system unzip, where there is one', () => {
    let tool = true;
    try {
      execFileSync('unzip', ['-v'], { stdio: 'ignore' });
    } catch {
      tool = false;
    }
    if (!tool) return;
    const dir = mkdtempSync(join(tmpdir(), 'zip-'));
    writeFileSync(join(dir, 'a.zip'), zip(files));
    execFileSync('unzip', ['-q', join(dir, 'a.zip'), '-d', dir]);
    expect(readFileSync(join(dir, 'xnotary/SKILL.md'), 'utf8')).toBe(new TextDecoder().decode(files[0].data));
  });
});
