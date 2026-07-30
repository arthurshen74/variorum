/**
 * The hand-rolled IndexedDB wrapper (DESIGN.md "State Architecture").
 * Named indexed-db-wrapper deliberately: there is an npm library called
 * `idb`, and no file in this repo may be mistakable for it.
 *
 * The entire surface: openDatabase / getAll / put / putMany / deleteByKey.
 * Single-operation transactions everywhere except putMany, which batches a
 * whole plan into one transaction — createConfiguration's name record plus
 * its version 1, importDatabase's merge plan. Do not grow this file without
 * a reason of that caliber.
 */

const DB_NAME = 'variorum';
const DB_VERSION = 1;

export const STORE_NAMES = [
  'configurations',
  'configurationVersions',
  'units',
] as const;
export type StoreName = (typeof STORE_NAMES)[number];

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      // Migrations live here and only here. Keep them boring.
      const db = request.result;
      if (!db.objectStoreNames.contains('configurations')) {
        db.createObjectStore('configurations', { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains('configurationVersions')) {
        db.createObjectStore('configurationVersions', {
          keyPath: ['name', 'version'],
        });
      }
      if (!db.objectStoreNames.contains('units')) {
        db.createObjectStore('units', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('indexedDB.open failed'));
  });
}

export function getAll<T>(db: IDBDatabase, store: StoreName): Promise<T[]> {
  const tx = db.transaction(store, 'readonly');
  return requestToPromise(tx.objectStore(store).getAll() as IDBRequest<T[]>);
}

export function put(
  db: IDBDatabase,
  store: StoreName,
  doc: unknown,
): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  return requestToPromise(tx.objectStore(store).put(doc)).then(() => undefined);
}

/**
 * Several documents, several stores, ONE transaction — all land or none do.
 * NOTE: never await anything that is not an IDB request inside a
 * transaction; it auto-commits at the end of the microtask.
 */
export function putMany(
  db: IDBDatabase,
  writes: ReadonlyArray<{ store: StoreName; doc: unknown }>,
): Promise<void> {
  // An empty write set is a no-op: IndexedDB rejects a zero-scope transaction.
  if (writes.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const stores = [...new Set(writes.map((w) => w.store))];
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () =>
      reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    for (const { store, doc } of writes) {
      tx.objectStore(store).put(doc);
    }
  });
}

export function deleteByKey(
  db: IDBDatabase,
  store: StoreName,
  key: IDBValidKey,
): Promise<void> {
  const tx = db.transaction(store, 'readwrite');
  return requestToPromise(tx.objectStore(store).delete(key)).then(
    () => undefined,
  );
}
