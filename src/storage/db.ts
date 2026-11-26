import { COLLECTIONS, type CollectionName, type Entity, type Schema } from '../domain/types';
import { newId } from '../lib/id';
import type { Backend } from './backend';

type Listener = () => void;
export type NewRecord<K extends CollectionName> = Omit<Schema[K], keyof Entity> & { id?: string };

/**
 * Local-first store: reads are synchronous from an in-memory cache (React-friendly),
 * writes are persisted to the backend before listeners are notified.
 * The 'audit' collection is append-only: no update, delete or clear through this API
 * except the explicit `eraseWorkspace` which preserves it.
 */
export class Db {
  private cache = new Map<CollectionName, Schema[CollectionName][]>();
  private listeners = new Map<CollectionName, Set<Listener>>();
  private loaded = false;
  constructor(private backend: Backend) {}

  async load(): Promise<void> {
    for (const name of COLLECTIONS) {
      const rows = (await this.backend.getAll(name)) as Schema[CollectionName][];
      this.cache.set(name, rows.sort((a, b) => a.createdAt - b.createdAt));
    }
    this.loaded = true;
  }

  snapshot<K extends CollectionName>(name: K): readonly Schema[K][] {
    return (this.cache.get(name) ?? []) as Schema[K][];
  }
  get<K extends CollectionName>(name: K, id: string): Schema[K] | undefined {
    return this.snapshot(name).find((r) => r.id === id);
  }
  subscribe(name: CollectionName, fn: Listener): () => void {
    let set = this.listeners.get(name);
    if (!set) this.listeners.set(name, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  }
  private emit(name: CollectionName) {
    this.listeners.get(name)?.forEach((fn) => fn());
  }
  private assertLoaded() {
    if (!this.loaded) throw new Error('Db.load() must complete before use');
  }

  async create<K extends CollectionName>(name: K, data: NewRecord<K>): Promise<Schema[K]> {
    this.assertLoaded();
    const now = Date.now();
    const rec = { ...data, id: data.id ?? newId(name.slice(0, 3)), createdAt: now, updatedAt: now } as unknown as Schema[K];
    await this.backend.put(name, rec);
    this.cache.set(name, [...this.snapshot(name), rec]);
    this.emit(name);
    return rec;
  }

  async update<K extends CollectionName>(name: K, id: string, patch: Partial<Omit<Schema[K], keyof Entity>>): Promise<Schema[K]> {
    this.assertLoaded();
    if (name === 'audit' || name === 'taskEvents') throw new Error(name === 'audit' ? 'Audit log is append-only' : 'Task event history is append-only');
    const cur = this.get(name, id);
    if (!cur) throw new Error(`${name}/${id} not found`);
    const next = { ...cur, ...patch, updatedAt: Date.now() } as Schema[K];
    await this.backend.put(name, next);
    this.cache.set(name, this.snapshot(name).map((r) => (r.id === id ? next : r)));
    this.emit(name);
    return next;
  }

  async remove(name: CollectionName, id: string): Promise<void> {
    this.assertLoaded();
    if (name === 'audit') throw new Error('Audit log is append-only');
    await this.backend.delete(name, id);
    this.cache.set(name, this.snapshot(name).filter((r) => r.id !== id));
    this.emit(name);
  }

  /** Remove every record where `pred` holds (used for cascades). */
  async removeWhere<K extends CollectionName>(name: K, pred: (r: Schema[K]) => boolean): Promise<number> {
    const doomed = this.snapshot(name).filter(pred);
    for (const r of doomed) await this.remove(name, r.id);
    return doomed.length;
  }

  /** Wipes all user data but keeps the audit trail. Returns number of collections cleared. */
  async eraseWorkspace(): Promise<number> {
    this.assertLoaded();
    let n = 0;
    for (const name of COLLECTIONS) {
      if (name === 'audit') continue;
      await this.backend.clear(name);
      this.cache.set(name, []);
      this.emit(name);
      n++;
    }
    return n;
  }

  /** JSON-safe export (asset blobs are excluded; they stay in this browser). */
  exportJson(): string {
    const out: Record<string, unknown> = { format: 'aurix-export', version: 1, exportedAt: Date.now() };
    for (const name of COLLECTIONS) {
      out[name] = name === 'assets'
        ? this.snapshot('assets').map(({ blob: _b, ...meta }) => meta)
        : this.snapshot(name);
    }
    return JSON.stringify(out, null, 2);
  }
}
