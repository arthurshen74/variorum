/**
 * A localStorage stand-in for node tests: the Storage surface the llm
 * modules use — get/set/remove, plus length/key for the migration's key
 * scan — backed by a Map the test can inspect and clear.
 */
export function installLocalStorageStub(): Map<string, string> {
  const storage = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
    clear: () => storage.clear(),
    get length() {
      return storage.size;
    },
    key: (index: number) => [...storage.keys()][index] ?? null,
  };
  return storage;
}
