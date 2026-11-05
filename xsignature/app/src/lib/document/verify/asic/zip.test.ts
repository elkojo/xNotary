import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { rawZip, utf8 } from './fixtures.test-helper';
import { ContainerRefused, MAX_UNPACKED_BYTES, looksLikeZip, printable, readZip, savedName } from './zip';

const entry = (name: string, text = 'hello') => ({ name, bytes: utf8(text) });

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('reading', () => {
  it('reads stored entries', () => {
    const [first] = readZip(rawZip([entry('a.txt')]));
    expect(first.name).toBe('a.txt');
    expect(text(first.bytes)).toBe('hello');
  });

  it('reads deflated entries, and an empty one', () => {
    const entries = readZip(zipSync({ 'a.txt': utf8('hello '.repeat(100)), 'empty.txt': new Uint8Array(0) }, { level: 6 }));
    expect(text(entries[0].bytes)).toBe('hello '.repeat(100));
    expect(entries[1].bytes.length).toBe(0);
  });

  it('skips directory entries', () => {
    expect(readZip(rawZip([entry('META-INF/', ''), entry('a.txt')])).map((e) => e.name)).toEqual(['a.txt']);
  });

  it('keeps a Czech name written as UTF-8 without the flag that says so', () => {
    const name = 'smlouva č.txt';
    const [first] = readZip(rawZip([{ name, bytes: utf8('x'), rawName: utf8(name) }]));
    expect(first.name).toBe(name);
  });

  it('reads a single-byte name without losing the entry', () => {
    const [first] = readZip(rawZip([{ name: 'x', bytes: utf8('x'), rawName: Uint8Array.from([0x61, 0xe8, 0x62]) }]));
    expect(first.name).toBe('aèb');
  });

  it('recognises a ZIP by its first bytes', () => {
    expect(looksLikeZip(rawZip([entry('a.txt')]))).toBe(true);
    expect(looksLikeZip(utf8('%PDF-1.7'))).toBe(false);
  });
});

describe('what it refuses, because two programs could read it differently', () => {
  const refusal = (zip: Uint8Array) => expect(() => readZip(zip)).toThrow(ContainerRefused);

  it('the same name twice', () => {
    refusal(rawZip([entry('a.txt', 'first'), entry('a.txt', 'second')]));
    expect(() => readZip(rawZip([entry('a.txt'), entry('a.txt')]))).toThrow(/twice/);
  });

  it('names that differ only by case, which land on one file on many systems', () => {
    refusal(rawZip([entry('A.txt'), entry('a.txt')]));
  });

  it('names that differ only by Unicode form', () => {
    refusal(rawZip([entry('č.txt'.normalize('NFC')), entry('č.txt'.normalize('NFD'))]));
  });

  it('a local header that disagrees with the directory', () => {
    expect(() => readZip(rawZip([{ ...entry('a.txt'), localName: 'b.txt' }]))).toThrow(/two different names/);
  });

  it('bytes placed in front of the archive', () => {
    // Offsets that account for the padding, as a tool repairing the file would write.
    expect(() => readZip(rawZip([entry('a.txt')], { before: utf8('%PDF-1.7 hello\n') }))).toThrow(/in front/);
  });

  it('bytes placed after it', () => {
    refusal(rawZip([entry('a.txt')], { after: utf8('trailing') }));
  });

  it('names that climb out of the container', () => {
    refusal(rawZip([entry('../evil.txt')]));
    refusal(rawZip([entry('folder/../evil.txt')]));
    refusal(rawZip([entry('/etc/passwd')]));
    refusal(rawZip([entry('folder\\evil.txt')]));
    refusal(rawZip([entry('C:/evil.txt')]));
  });

  it('a password-protected entry', () => {
    expect(() => readZip(rawZip([{ ...entry('a.txt'), flags: 0x0801 }]))).toThrow(/password/);
  });

  it('more than it is willing to unpack, before unpacking any of it', () => {
    expect(() => readZip(rawZip([{ ...entry('a.txt'), declaredSize: MAX_UNPACKED_BYTES + 1 }]))).toThrow(/512 MB/);
  });

  it('a size that disagrees with the stored bytes', () => {
    refusal(rawZip([{ ...entry('a.txt'), declaredSize: 2 }]));
  });

  it('something that is not a ZIP at all', () => {
    refusal(utf8('PK\u0003\u0004 and then nothing useful'));
  });

  it('a file cut off partway', () => {
    const whole = rawZip([entry('a.txt')]);
    refusal(whole.subarray(0, whole.length - 10));
  });
});

describe('names out of a file', () => {
  it('neutralises the controls that make exe.fdp read as pdf.exe', () => {
    expect(printable('invoice\u202Efdp.exe')).toBe('invoice\ufffdfdp.exe');
  });

  it('saves under the last part of the name only', () => {
    expect(savedName('folder/report.pdf')).toBe('report.pdf');
  });

  it('keeps Czech letters, and drops what a file system would choke on', () => {
    expect(savedName('smlouva č. 1.pdf')).toBe('smlouva č. 1.pdf');
    expect(savedName('a<b>:c.pdf')).toBe('a_b__c.pdf');
    expect(savedName('invoice\u202Efdp.exe')).toBe('invoicefdp.exe');
    expect(savedName('trailing. ')).toBe('trailing');
    expect(savedName('...')).toBe('file');
  });
});
