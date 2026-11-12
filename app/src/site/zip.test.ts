import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { crc32, zip } from './zip';
import { unzip } from './zip.test-helper';

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
