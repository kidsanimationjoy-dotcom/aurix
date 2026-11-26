import { COLLECTIONS } from '../domain/types';

/** Minimal persistence contract. Swap implementations without touching the app. */
export interface Backend {
  getAll(collection: string): Promise<unknown[]>;
  put(collection: string, item: { id: string }): Promise<void>;
  delete(collection: string, id: string): Promise<void>;
  clear(collection: string): Promise<void>;
}

export class MemoryBackend implements Backend {
  private data = new Map<string, Map<string, unknown>>();
  private col(name: string) {
    let c = this.data.get(name);
    if (!c) this.data.set(name, (c = new Map()));
    return c;
  }
  async getAll(c: string) { return [...this.col(c).values()]; }
  async put(c: string, item: { id: string }) { this.col(c).set(item.id, item); }
  async delete(c: string, id: string) { this.col(c).delete(id); }
  async clear(c: string) { this.col(c).clear(); }
}

const DB_NAME = 'aurix';
const DB_VERSION = 1;

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error ?? new Error('IndexedDB request failed'));
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => rej(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/** Browser-local persistence. Data never leaves the device. */
export class IndexedDbBackend implements Backend {
  private dbp: Promise<IDBDatabase> | null = null;
  private open(): Promise<IDBDatabase> {
    if (!this.dbp) {
      this.dbp = new Promise((res, rej) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const name of COLLECTIONS) {
            if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error ?? new Error('Could not open IndexedDB'));
      });
    }
    return this.dbp;
  }
  async getAll(c: string) {
    const db = await this.open();
    return wrap(db.transaction(c, 'readonly').objectStore(c).getAll());
  }
  async put(c: string, item: { id: string }) {
    const db = await this.open();
    const tx = db.transaction(c, 'readwrite');
    tx.objectStore(c).put(item);
    await done(tx);
  }
  async delete(c: string, id: string) {
    const db = await this.open();
    const tx = db.transaction(c, 'readwrite');
    tx.objectStore(c).delete(id);
    await done(tx);
  }
  async clear(c: string) {
    const db = await this.open();
    const tx = db.transaction(c, 'readwrite');
    tx.objectStore(c).clear();
    await done(tx);
  }
}
