import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { recordAudit, type AuditInput } from '../audit/audit';
import type { ProviderAdapter, ProviderId, ProviderStatus } from '../adapters/types';
import { probeCompanion } from '../companion/client';
import type { CompanionStatus } from '../companion/protocol';
import type { CollectionName, Project, Schema, SettingsRecord } from '../domain/types';
import type { Db } from '../storage/db';
import { TaskEngine } from '../tasks/engine';
import { SETTINGS_ID } from './bootstrap';

const TOKEN_KEY = 'aurix.companionToken';
/** Pairing token lives in sessionStorage only: never in IndexedDB, exports or the audit log. */
export const companionToken = {
  get: () => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; } },
  set: (v: string) => { try { sessionStorage.setItem(TOKEN_KEY, v); } catch { /* ignore */ } },
};

interface Ctx {
  db: Db;
  adapters: ProviderAdapter[];
  taskEngine: TaskEngine;
  persistent: boolean;
  statuses: Record<string, ProviderStatus>;
  companion: CompanionStatus;
  checkCompanion: () => Promise<void>;
}
const AppCtx = createContext<Ctx | null>(null);

export function AppProvider(props: { db: Db; adapters: ProviderAdapter[]; persistent: boolean; children: ReactNode }) {
  const { db, adapters, persistent } = props;
  const taskEngine = useMemo(() => new TaskEngine(db, adapters), [db, adapters]);
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [companion, setCompanion] = useState<CompanionStatus>({ state: 'not_configured', message: 'No companion URL set.' });

  useEffect(() => {
    let live = true;
    void Promise.all(adapters.map(async (a) => [a.meta.id, await a.getStatus()] as const)).then((rows) => {
      if (live) setStatuses(Object.fromEntries(rows));
    }).catch(() => {
      if (live) setStatuses({});
    });
    return () => { live = false; };
  }, [adapters]);

  useEffect(() => {
    void taskEngine.recoverInterruptedTasks();
  }, [taskEngine]);

  const checkCompanion = useCallback(async () => {
    const url = db.get('settings', SETTINGS_ID)?.companionUrl ?? '';
    setCompanion(await probeCompanion({ url, token: companionToken.get() }));
  }, [db]);

  useEffect(() => {
    if ((db.get('settings', SETTINGS_ID)?.companionUrl ?? '') && companionToken.get()) void checkCompanion();
  }, [db, checkCompanion]);

  const value = useMemo(() => ({ db, adapters, taskEngine, persistent, statuses, companion, checkCompanion }), [db, adapters, taskEngine, persistent, statuses, companion, checkCompanion]);
  return <AppCtx.Provider value={value}>{props.children}</AppCtx.Provider>;
}

export function useTaskEngine(): TaskEngine {
  return useApp().taskEngine;
}

export function useApp(): Ctx {
  const c = useContext(AppCtx);
  if (!c) throw new Error('AppProvider missing');
  return c;
}

export function useCollection<K extends CollectionName>(name: K): readonly Schema[K][] {
  const { db } = useApp();
  const sub = useCallback((cb: () => void) => db.subscribe(name, cb), [db, name]);
  const snap = useCallback(() => db.snapshot(name), [db, name]);
  return useSyncExternalStore(sub, snap);
}

export function useSettings(): SettingsRecord {
  const { db } = useApp();
  const all = useCollection('settings');
  return all.find((s) => s.id === SETTINGS_ID) ?? (db.get('settings', SETTINGS_ID) as SettingsRecord);
}

export function useAudit() {
  const { db } = useApp();
  return useCallback((e: AuditInput) => recordAudit(db, e), [db]);
}

export function useActiveProject(): Project | undefined {
  const s = useSettings();
  const projects = useCollection('projects');
  return projects.find((p) => p.id === s.activeProjectId);
}

export function useProviderStatus(id: ProviderId): ProviderStatus | undefined {
  return useApp().statuses[id];
}
