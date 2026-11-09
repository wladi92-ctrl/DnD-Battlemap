import '@testing-library/jest-dom/vitest';

// Ab Node 25 überdeckt das eingebaute (ohne --localstorage-file leere) localStorage
// das von jsdom. Für Tests wird dann ein In-Memory-Storage eingesetzt.
if (typeof globalThis.localStorage?.getItem !== 'function') {
  const data = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}
