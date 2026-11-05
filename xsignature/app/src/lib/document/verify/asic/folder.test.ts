import { describe, expect, it } from 'vitest';

import { checkUnpacked } from './container';
import { container, makeSigner, makeXades, parseXml, utf8 } from './fixtures.test-helper';
import { readFolder } from './folder';
import { MAX_UNPACKED_BYTES, readZip } from './zip';

/** The browser's entry tree, handing children over in batches as the real one does. */
function directory(name: string, children: Record<string, Uint8Array | object>): FileSystemDirectoryEntry {
  const entries = Object.entries(children).map(([child, value]) =>
    value instanceof Uint8Array
      ? ({ name: child, isDirectory: false, isFile: true, file: (done: (file: File) => void) => done(new Blob([value as BlobPart]) as File) } as unknown as FileSystemEntry)
      : directory(child, value as Record<string, Uint8Array | object>),
  );
  return {
    name,
    isDirectory: true,
    isFile: false,
    createReader: () => {
      const left = [...entries];
      return { readEntries: (done: (batch: FileSystemEntry[]) => void) => done(left.splice(0, 2)) };
    },
  } as unknown as FileSystemDirectoryEntry;
}

describe('reading a folder', () => {
  it('reads nested files in several batches, with names relative to the folder', async () => {
    const found = await readFolder(directory('x.asice', { a: utf8('1'), b: utf8('2'), c: utf8('3'), 'META-INF': { 'signatures.xml': utf8('4') } }));
    expect(found.map((entry) => entry.name).sort()).toEqual(['META-INF/signatures.xml', 'a', 'b', 'c']);
  });

  it('refuses more than it is willing to hold', async () => {
    const huge = { name: 'big', isDirectory: false, file: (done: (file: unknown) => void) => done({ size: MAX_UNPACKED_BYTES + 1 }) };
    const folder = {
      name: 'x',
      isDirectory: true,
      createReader: () => {
        const left = [huge];
        return { readEntries: (done: (batch: unknown[]) => void) => done(left.splice(0, 1)) };
      },
    } as unknown as FileSystemDirectoryEntry;
    await expect(readFolder(folder)).rejects.toThrow(/512 MB/);
  });
});

describe('checking an unpacked container', () => {
  it('reads the same as the container it came from, and says where it came from', async () => {
    const files = { 'smlouva.pdf': utf8('the contract') };
    const parts = { ...files, 'META-INF/signatures0.xml': await makeXades(files, await makeSigner()) };
    const zipped = container(parts);

    const fromZip = await checkUnpacked(readZip(zipped), parseXml);
    expect(fromZip.fromFolder).toBe(true);
    expect(fromZip.signatures[0].verdict).toBe('intact');
    expect(fromZip.signatures[0].covers).toEqual(['smlouva.pdf']);
  });

  it('still notices a file that was changed', async () => {
    const files = { 'smlouva.pdf': utf8('the contract') };
    const parts = { 'smlouva.pdf': utf8('changed'), 'META-INF/signatures0.xml': await makeXades(files, await makeSigner()) };
    const { signatures } = await checkUnpacked(readZip(container(parts)), parseXml);
    expect(signatures[0].verdict).toBe('altered');
  });
});
