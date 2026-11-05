/**
 * Reading a container's ZIP, and refusing the ones that could mean two things.
 *
 * A signature over `report.pdf` is only worth something if everybody who opens
 * the container gets the same `report.pdf`. ZIP does not promise that: a name may
 * appear twice, and which copy a tool extracts is up to the tool; the name in an
 * entry's local header may differ from the one in the central directory; bytes
 * may sit in front of the archive. Each is a way of showing a checker one file
 * and a person another. So these are refused, rather than resolved in favour of
 * whichever reading happens to verify.
 *
 * That is why this reads the central directory itself and uses `fflate` only to
 * inflate: `unzipSync` returns a map, where the second `report.pdf` has already
 * silently replaced the first.
 */
import { inflateSync } from 'fflate';

/** Why a file cannot be read as a container, in the app's own voice. */
export class ContainerRefused extends Error {}

export interface ZipEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/** Everything in one container held in memory at once, so a limit has to exist. */
export const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;
const MAX_ENTRIES = 10_000;

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_HEADER = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;
const ZIP64_END = 0x06064b50;
const ZIP64_EXTRA = 0x0001;
const NOT_IN_FIELD = 0xffffffff;
const UTF8_NAME_FLAG = 0x0800;

const DAMAGED = 'This container could not be read. It may be damaged, or only partly downloaded.';

/** True when the bytes begin as a ZIP does, whatever the file is called. */
export function looksLikeZip(head: Uint8Array): boolean {
  return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
}

export function readZip(zip: Uint8Array): ZipEntry[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  try {
    return readEntries(zip, view);
  } catch (error) {
    if (error instanceof ContainerRefused) throw error;
    // A length that points outside the file, or a stream that will not inflate.
    throw new ContainerRefused(DAMAGED);
  }
}

function readEntries(zip: Uint8Array, view: DataView): ZipEntry[] {
  const end = findEnd(zip, view);
  const count = view.getUint16(end + 10, true);
  const directoryOffset = view.getUint32(end + 16, true);
  if (count === 0xffff || directoryOffset === NOT_IN_FIELD || count > MAX_ENTRIES) {
    throw new ContainerRefused('This container is too large to check in a browser.');
  }

  const listed: Array<{ name: string; size: number; compressedSize: number; offset: number; method: number; rawName: Uint8Array }> = [];
  const seen = new Set<string>();
  let unpacked = 0;
  let firstOffset = Number.POSITIVE_INFINITY;
  let position = directoryOffset;

  for (let i = 0; i < count; i++) {
    if (view.getUint32(position, true) !== CENTRAL_HEADER) throw new ContainerRefused(DAMAGED);

    const flags = view.getUint16(position + 8, true);
    const method = view.getUint16(position + 10, true);
    let compressedSize = view.getUint32(position + 20, true);
    let size = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    let offset = view.getUint32(position + 42, true);

    const rawName = zip.subarray(position + 46, position + 46 + nameLength);
    const name = decodeName(rawName, (flags & UTF8_NAME_FLAG) !== 0);

    const wide = readZip64(view, position + 46 + nameLength, extraLength, { size, compressedSize, offset });
    size = wide.size;
    compressedSize = wide.compressedSize;
    offset = wide.offset;

    position += 46 + nameLength + extraLength + commentLength;

    if (flags & 1) throw new ContainerRefused('This container is password-protected, so nothing in it can be checked.');
    refuseUnsafeName(name);

    // Case and Unicode form too: on many file systems these extract to one file,
    // so they raise the same question as an exact duplicate.
    const key = name.normalize('NFC').toLowerCase();
    if (seen.has(key)) {
      throw new ContainerRefused(
        `This container lists “${printable(name)}” twice. Which copy opens depends on the program, so a signature here could not say which one it covers.`,
      );
    }
    seen.add(key);
    firstOffset = Math.min(firstOffset, offset);

    if (name.endsWith('/')) continue;
    if (method !== 0 && method !== 8) throw new ContainerRefused(DAMAGED);

    unpacked += size;
    if (unpacked > MAX_UNPACKED_BYTES) {
      throw new ContainerRefused('This container unpacks to more than 512 MB, which is too large to check in a browser.');
    }
    listed.push({ name, size, compressedSize, offset, method, rawName });
  }

  // Every byte has to belong to the archive: the first entry starts the file, and
  // nothing but the directory's own closing records sits before the end record.
  if (position !== end && view.getUint32(position, true) !== ZIP64_END) throw new ContainerRefused(DAMAGED);
  if (count > 0 && firstOffset !== 0) {
    throw new ContainerRefused('Something has been placed in front of this container, so programs may disagree about what it is. It cannot be checked as it stands.');
  }

  return listed.map((entry) => ({ name: entry.name, bytes: readEntry(zip, view, entry) }));
}

/** The end record has to close the file exactly, its comment included. */
function findEnd(zip: Uint8Array, view: DataView): number {
  const lowest = Math.max(0, zip.length - 22 - 0xffff);
  for (let i = zip.length - 22; i >= lowest; i--) {
    if (view.getUint32(i, true) === END_OF_CENTRAL_DIRECTORY && i + 22 + view.getUint16(i + 20, true) === zip.length) {
      return i;
    }
  }
  throw new ContainerRefused(DAMAGED);
}

function readEntry(
  zip: Uint8Array,
  view: DataView,
  entry: { name: string; size: number; compressedSize: number; offset: number; method: number; rawName: Uint8Array },
): Uint8Array {
  if (view.getUint32(entry.offset, true) !== LOCAL_HEADER) throw new ContainerRefused(DAMAGED);

  const nameLength = view.getUint16(entry.offset + 26, true);
  const extraLength = view.getUint16(entry.offset + 28, true);
  const localName = zip.subarray(entry.offset + 30, entry.offset + 30 + nameLength);
  if (localName.length !== entry.rawName.length || !localName.every((byte, i) => byte === entry.rawName[i])) {
    throw new ContainerRefused(
      `This container gives “${printable(entry.name)}” two different names, depending on where a program looks. A signature here could not say which file it covers.`,
    );
  }

  const start = entry.offset + 30 + nameLength + extraLength;
  const stored = zip.subarray(start, start + entry.compressedSize);
  if (stored.length !== entry.compressedSize) throw new ContainerRefused(DAMAGED);
  if (entry.size === 0) return new Uint8Array(0);
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.size) throw new ContainerRefused(DAMAGED);
    return stored.slice();
  }

  const bytes = inflateSync(stored, { out: new Uint8Array(entry.size) });
  if (bytes.length !== entry.size) throw new ContainerRefused(DAMAGED);
  return bytes;
}

function readZip64(
  view: DataView,
  start: number,
  length: number,
  fields: { size: number; compressedSize: number; offset: number },
): { size: number; compressedSize: number; offset: number } {
  const wide = { ...fields };
  for (let at = start; at + 4 <= start + length; at += 4 + view.getUint16(at + 2, true)) {
    if (view.getUint16(at, true) !== ZIP64_EXTRA) continue;
    let cursor = at + 4;
    const next = () => {
      const value = Number(view.getBigUint64(cursor, true));
      cursor += 8;
      return value;
    };
    if (wide.size === NOT_IN_FIELD) wide.size = next();
    if (wide.compressedSize === NOT_IN_FIELD) wide.compressedSize = next();
    if (wide.offset === NOT_IN_FIELD) wide.offset = next();
  }
  return wide;
}

/** UTF-8 when flagged or when it decodes cleanly; otherwise a single-byte reading. */
function decodeName(raw: Uint8Array, flaggedUtf8: boolean): string {
  try {
    return new TextDecoder('utf-8', { fatal: !flaggedUtf8 }).decode(raw);
  } catch {
    return new TextDecoder('latin1').decode(raw);
  }
}

function refuseUnsafeName(name: string): void {
  const parts = name.split('/');
  if (name.startsWith('/') || name.includes('\\') || parts.includes('..') || /^[A-Za-z]:/.test(name)) {
    throw new ContainerRefused(
      `This container holds a file named “${printable(name)}”, which points outside the container, so it is not read here.`,
    );
  }
}

/**
 * A name out of a file, made safe to show.
 *
 * Bidirectional controls are how `exe.fdp` is made to read as `pdf.exe`, and a
 * name in a list of signed files is exactly where that would be aimed.
 */
export function printable(name: string): string {
  return name.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '\ufffd');
}

/** A name out of a file, made safe to save under: its last part, printable. */
export function savedName(name: string): string {
  const last = printable(name).split('/').pop() ?? '';
  const cleaned = last.replace(/\ufffd/g, '').replace(/[<>:"\\|?*]/g, '_').replace(/[. ]+$/, '');
  return cleaned || 'file';
}
