import { useState } from 'react';
import type { AuditOutcome } from '../domain/types';
import { useCollection } from '../state/AppState';
import { EmptyState, Notice, PageHeader, Panel, download, fmtTime } from '../ui/kit';

export function Activity() {
  const all = useCollection('audit');
  const [outcome, setOutcome] = useState<AuditOutcome | 'all'>('all');
  const [q, setQ] = useState('');
  const rows = [...all].sort((a, b) => b.createdAt - a.createdAt)
    .filter((e) => outcome === 'all' || e.outcome === outcome)
    .filter((e) => `${e.action} ${e.target} ${e.detail}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageHeader title="Activity" subtitle="Append-only record of what you and AURIX did in this workspace." actions={
        <button className="btn" disabled={!all.length} onClick={() => download('aurix-audit.json', 'application/json', JSON.stringify(all, null, 2))}>Export JSON</button>
      } />
      <Notice>Events can be filtered and exported but not edited or deleted. This log is stored on this device only. Erasing workspace data in Settings keeps it.</Notice>
      <div className="row">
        <input style={{ maxWidth: 320 }} aria-label="Search activity" placeholder="Search actions, targets, details" value={q} onChange={(e) => setQ(e.target.value)} />
        {(['all', 'success', 'info', 'denied', 'error'] as const).map((o) => <button key={o} className={`chip ${outcome === o ? 'on' : ''}`} onClick={() => setOutcome(o)}>{o}</button>)}
      </div>
      <Panel>
        {rows.length === 0 ? <EmptyState icon="list" title="No matching events" /> : (
          <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Outcome</th><th>Detail</th></tr></thead><tbody>
            {rows.map((e) => <tr key={e.id}><td>{fmtTime(e.createdAt)}</td><td>{e.actor}</td><td className="mono">{e.action}</td><td className="mono">{e.target}</td><td>{e.outcome}</td><td className="muted">{e.detail}</td></tr>)}
          </tbody></table></div>
        )}
      </Panel>
    </>
  );
}
