import { recordAudit } from '../audit/audit';
import { BUILT_IN_AGENTS } from '../domain/seed';
import type { SettingsRecord } from '../domain/types';
import type { Db } from '../storage/db';

export const SETTINGS_ID = 'app';

/** Idempotent first-run setup: settings record and built-in agent definitions. */
export async function bootstrap(db: Db, persistent: boolean): Promise<void> {
  if (!db.get('settings', SETTINGS_ID)) {
    await db.create('settings', {
      id: SETTINGS_ID, activeProjectId: null, reduceMotion: false, density: 'comfortable', companionUrl: '',
    } satisfies Omit<SettingsRecord, 'createdAt' | 'updatedAt'>);
  }
  if (db.snapshot('agents').length === 0) {
    for (const a of BUILT_IN_AGENTS) await db.create('agents', a);
    await recordAudit(db, { actor: 'system', action: 'agents.seeded', detail: `${BUILT_IN_AGENTS.length} built-in agent definitions` });
  }
  await recordAudit(db, {
    actor: 'system',
    action: 'workspace.opened',
    detail: persistent ? 'Local persistence: IndexedDB' : 'Local persistence unavailable; data is kept in memory only',
    outcome: persistent ? 'info' : 'error',
  });
}
