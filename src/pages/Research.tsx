import { useState } from 'react';
import type { ClaimStatus } from '../domain/types';
import { researchToMarkdown } from '../lib/researchExport';
import { useActiveProject, useApp, useAudit, useCollection, useSettings } from '../state/AppState';
import { ConfirmButton, EmptyState, Field, Notice, PageHeader, Panel, download } from '../ui/kit';

const EMPTY = { title: '', claim: '', status: 'unverified' as ClaimStatus, sourceTitle: '', sourceUrl: '', notes: '' };

function validUrl(u: string): boolean {
  try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; }
}

export function Research() {
  const { db } = useApp();
  const audit = useAudit();
  const project = useActiveProject();
  const settings = useSettings();
  const scope = settings.activeProjectId ?? null;
  const items = useCollection('research').filter((r) => r.projectId === scope);
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState<ClaimStatus | 'all'>('all');

  const needsSource = form.status === 'verified' && !validUrl(form.sourceUrl);
  const urlBad = form.sourceUrl !== '' && !validUrl(form.sourceUrl);
  const canSave = form.title.trim() && form.claim.trim() && !needsSource && !urlBad;
  const shown = items.filter((i) => filter === 'all' || i.status === filter);

  return (
    <>
      <PageHeader
        title="Research"
        subtitle={project ? `Research board for ${project.name}` : 'Research board (no project selected)'}
        actions={<button className="btn" disabled={!items.length} onClick={() => { download('research.md', 'text/markdown', researchToMarkdown(project ? `${project.name}: research` : 'Research', [...items])); void audit({ action: 'research.export', detail: `${items.length} items` }); }}>Export Markdown</button>}
      />
      <Notice>Web search is not connected, so sources are added by hand. A claim can only be marked <b>verified</b> when it has a valid source link; everything else stays unverified or an assumption in exports.</Notice>
      <Panel title="Add a claim">
        <div className="grid g2">
          <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ClaimStatus })}>
              <option value="unverified">Unverified</option><option value="verified">Verified (needs source)</option><option value="assumption">Assumption</option>
            </select>
          </Field>
        </div>
        <Field label="Claim"><textarea value={form.claim} onChange={(e) => setForm({ ...form, claim: e.target.value })} /></Field>
        <div className="grid g2">
          <Field label="Source title"><input value={form.sourceTitle} onChange={(e) => setForm({ ...form, sourceTitle: e.target.value })} /></Field>
          <Field label="Source URL" hint={needsSource ? 'Verified claims need an http(s) link.' : urlBad ? 'That is not a valid http(s) URL.' : undefined}>
            <input value={form.sourceUrl} placeholder="https://" onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
          </Field>
        </div>
        <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <div><button className="btn primary" disabled={!canSave} onClick={async () => {
          const r = await db.create('research', { projectId: scope, ...form, title: form.title.trim(), claim: form.claim.trim() });
          await audit({ action: 'research.add', target: r.id, detail: r.status });
          setForm(EMPTY);
        }}>Add claim</button></div>
      </Panel>
      <div className="row">
        {(['all', 'verified', 'unverified', 'assumption'] as const).map((f) => <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? `All (${items.length})` : f}</button>)}
      </div>
      {shown.length === 0 ? <Panel><EmptyState icon="search" title="Nothing here yet">Add a claim with its source to start building a report.</EmptyState></Panel> : (
        <div className="stack">
          {[...shown].reverse().map((r) => (
            <div className="item" key={r.id}>
              <div>
                <h3>{r.title} <span className={`pill ${r.status}`}>{r.status}</span></h3>
                <p>{r.claim}</p>
                <small>{r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noreferrer noopener">{r.sourceTitle || r.sourceUrl}</a> : 'No source recorded'}</small>
              </div>
              <ConfirmButton label="Delete" onConfirm={async () => { await db.remove('research', r.id); await audit({ action: 'research.delete', target: r.id }); }} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
