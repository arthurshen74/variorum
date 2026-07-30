/**
 * Harness smoke test — proves the Vitest wiring, not the application.
 * Verifies: TS + alias resolution, and that fake-indexeddb supplies a
 * working IndexedDB in the node environment. Deliberately imports no
 * application module beyond a type (source layering stays intact:
 * repository.ts remains the only importer of indexed-db-wrapper.ts).
 * Delete this file once real unit tests exist.
 */
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { MessageRole } from '@/domain/types';

describe('vitest harness', () => {
  it('resolves the @ alias and strict TS', () => {
    const role: MessageRole = 'user';
    expect(role).toBe('user');
  });

  it('fake-indexeddb round-trips a record', async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('harness-smoke', 1);
      req.onupgradeneeded = () =>
        req.result.createObjectStore('records', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('records', 'readwrite');
      tx.objectStore('records').put({ id: 'a', value: 42 });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const all = await new Promise<unknown[]>((resolve, reject) => {
      const req = db
        .transaction('records', 'readonly')
        .objectStore('records')
        .getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    expect(all).toEqual([{ id: 'a', value: 42 }]);
  });
});
