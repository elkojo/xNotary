/**
 * Reading a dropped folder: what a file manager makes of a container when it unpacks one.
 *
 * Browsers hand a dropped folder over as a tree of entries, read through callbacks and in
 * batches, which is why this loops. Names come back relative to the folder itself.
 */
import { ContainerRefused, MAX_UNPACKED_BYTES, type ZipEntry } from './zip';

const entriesOf = (directory: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> =>
  new Promise((resolve, reject) => {
    const reader = directory.createReader();
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        next();
      }, reject);
    next();
  });

const fileOf = (entry: FileSystemFileEntry): Promise<File> => new Promise((resolve, reject) => entry.file(resolve, reject));

export async function readFolder(folder: FileSystemDirectoryEntry): Promise<ZipEntry[]> {
  const found: ZipEntry[] = [];
  let total = 0;

  const walk = async (directory: FileSystemDirectoryEntry, prefix: string): Promise<void> => {
    for (const entry of await entriesOf(directory)) {
      if (entry.isDirectory) {
        await walk(entry as FileSystemDirectoryEntry, `${prefix}${entry.name}/`);
        continue;
      }
      const file = await fileOf(entry as FileSystemFileEntry);
      total += file.size;
      if (total > MAX_UNPACKED_BYTES) {
        throw new ContainerRefused('This folder holds more than 512 MB, which is too large to check in a browser.');
      }
      found.push({ name: `${prefix}${entry.name}`, bytes: new Uint8Array(await file.arrayBuffer()) });
    }
  };

  await walk(folder, '');
  return found;
}
