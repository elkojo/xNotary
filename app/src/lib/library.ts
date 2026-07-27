/**
 * The local certificate library.
 *
 * Self-custody means this is the only copy: there is no server holding a
 * backup. IndexedDB is used rather than localStorage because proofs and
 * certificate PDFs are binary and localStorage would force base64 into a ~5 MB
 * quota. The user is told, in the UI, to export and back these up.
 */
import type { OtsStatus } from './ots';

const DB_NAME = 'xnotary';
const DB_VERSION = 1;
const STORE = 'certificates';

export interface CertificateRecord {
  /** Hex SHA-256 of the document — the natural primary key. */
  readonly id: string;
  readonly fileName: string;
  readonly fileSize: number;
  readonly note?: string;
  readonly createdAt: number;
  /** Last time the proof was upgraded or its status re-checked. */
  updatedAt: number;
  /** Serialized `.ots` proof. Replaced in place when a pending proof upgrades. */
  ots: Uint8Array;
  /** Certificate 1 PDF, regenerated whenever the proof changes. */
  pdf: Uint8Array;
  /** Cached status, so the library renders offline. */
  status: OtsStatus;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the local database'));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE, mode);
        const req = fn(transaction.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('Local database error'));
      }),
  );
}

export async function listCertificates(): Promise<CertificateRecord[]> {
  const all = await tx<CertificateRecord[]>('readonly', (s) => s.getAll());
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getCertificate(id: string): Promise<CertificateRecord | undefined> {
  return tx<CertificateRecord | undefined>('readonly', (s) => s.get(id));
}

export async function putCertificate(record: CertificateRecord): Promise<void> {
  await tx('readwrite', (s) => s.put(record));
}

export async function deleteCertificate(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
}

/**
 * Ask the browser to make this origin's storage persistent, so the library is
 * not evicted under storage pressure. Best-effort: browsers may decline.
 */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota };
}
