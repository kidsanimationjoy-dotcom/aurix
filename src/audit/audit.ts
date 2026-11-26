import type { AuditOutcome } from '../domain/types';
import type { Db } from '../storage/db';

export interface AuditInput {
  action: string;
  target?: string;
  detail?: string;
  outcome?: AuditOutcome;
  actor?: 'user' | 'system';
}

/** Append-only audit trail. Every mutating user action should call this. */
export async function recordAudit(db: Db, e: AuditInput): Promise<void> {
  await db.create('audit', {
    actor: e.actor ?? 'user',
    action: e.action,
    target: e.target ?? '',
    detail: e.detail ?? '',
    outcome: e.outcome ?? 'success',
  });
}

export function auditNewestFirst(db: Db) {
  return [...db.snapshot('audit')].sort((a, b) => b.createdAt - a.createdAt);
}
