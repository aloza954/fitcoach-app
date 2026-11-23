// Envoltorio mínimo de IndexedDB con promesas.
// Todos los datos del usuario viven en el propio dispositivo.

const DB_NAME = 'fitcoach';
const DB_VERSION = 1;

export const STORES = {
  kv: { keyPath: 'key' },
  plans: { keyPath: 'id', indexes: ['kind'] },
  workouts: { keyPath: 'id', indexes: ['scheduledDate', 'date'] },
  dietLogs: { keyPath: 'date' },
  water: { keyPath: 'date' },
  measurements: { keyPath: 'id', indexes: ['date'] },
  photos: { keyPath: 'id', indexes: ['date'] },
};

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, def] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(name)) continue;
        const store = db.createObjectStore(name, { keyPath: def.keyPath });
        for (const idx of def.indexes || []) store.createIndex(idx, idx);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(store, mode = 'readonly') {
  const db = await open();
  return db.transaction(store, mode).objectStore(store);
}

export async function get(store, key) {
  return wrap((await tx(store)).get(key));
}

export async function put(store, value) {
  return wrap((await tx(store, 'readwrite')).put(value));
}

export async function del(store, key) {
  return wrap((await tx(store, 'readwrite')).delete(key));
}

export async function all(store) {
  return wrap((await tx(store)).getAll());
}

export async function clear(store) {
  return wrap((await tx(store, 'readwrite')).clear());
}

/** Registros cuyo índice está en [from, to] (ambos incluidos). */
export async function byIndexRange(store, index, from, to) {
  const s = await tx(store);
  return wrap(s.index(index).getAll(IDBKeyRange.bound(from, to)));
}

export async function byIndex(store, index, value) {
  const s = await tx(store);
  return wrap(s.index(index).getAll(value));
}

export async function kvGet(key, fallback = null) {
  const row = await get('kv', key);
  return row ? row.value : fallback;
}

export async function kvSet(key, value) {
  return put('kv', { key, value });
}

export async function kvDel(key) {
  return del('kv', key);
}

/** Inserta muchos registros en una sola transacción. */
export async function putMany(store, values) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    for (const v of values) s.put(v);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function wipeAll() {
  for (const name of Object.keys(STORES)) await clear(name);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
