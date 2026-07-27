import { describe, expect, it } from 'vitest';

import { bytesEqual, fromHex, groupHex, sha256Bytes, sha256File, toHex } from './hash';

const KNOWN_EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

describe('hex', () => {
  it('round-trips', () => {
    const bytes = new Uint8Array([0x00, 0x0f, 0xff, 0xa5]);
    expect(toHex(bytes)).toBe('000fffa5');
    expect(fromHex('000fffa5')).toEqual(bytes);
  });

  it('tolerates whitespace and case', () => {
    expect(fromHex('  00 0F FF A5 ')).toEqual(new Uint8Array([0x00, 0x0f, 0xff, 0xa5]));
  });

  it('rejects malformed input rather than silently truncating', () => {
    expect(() => fromHex('abc')).toThrow();
    expect(() => fromHex('zz')).toThrow();
  });

  it('groups for display without altering content', () => {
    expect(groupHex('deadbeefcafe')).toBe('dead beef cafe');
    expect(groupHex('deadbeefcafe').replace(/ /g, '')).toBe('deadbeefcafe');
  });
});

describe('sha256', () => {
  it('matches the known digest of the empty input', async () => {
    expect(toHex(await sha256Bytes(new Uint8Array()))).toBe(KNOWN_EMPTY);
  });

  it('hashes a view into a larger buffer correctly', async () => {
    // Guards the bufferOf() offset handling: a subarray must hash as its own
    // contents, not as the whole backing buffer.
    const backing = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const view = backing.subarray(2, 5);
    expect(toHex(await sha256Bytes(view))).toBe(toHex(await sha256Bytes(new Uint8Array([3, 4, 5]))));
  });

  it('gives the same digest for the chunked and single-shot paths', async () => {
    // Larger than the 8 MiB chunk threshold, so this exercises the streaming
    // @noble path and compares it against WebCrypto over the same bytes.
    const size = 9 * 1024 * 1024;
    const data = new Uint8Array(size);
    for (let i = 0; i < size; i++) data[i] = (i * 31 + 7) & 0xff;

    const streamed = await sha256File(new Blob([data]));
    const oneShot = await sha256Bytes(data);
    expect(toHex(streamed)).toBe(toHex(oneShot));
  });

  it('reports progress that ends at the file size', async () => {
    const data = new Uint8Array(9 * 1024 * 1024);
    let last = 0;
    let total = 0;
    await sha256File(new Blob([data]), (read, size) => {
      expect(read).toBeGreaterThan(last);
      last = read;
      total = size;
    });
    expect(last).toBe(data.length);
    expect(total).toBe(data.length);
  });
});

describe('bytesEqual', () => {
  it('compares content, not identity', () => {
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true);
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false);
    expect(bytesEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});
