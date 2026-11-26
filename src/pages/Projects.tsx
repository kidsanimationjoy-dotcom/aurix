import { useState } from 'react';
import type { ProviderChoice } from '../domain/types';
import { useApp, useAudit, useCollection, useSettings } from '../state/AppState';
import { ConfirmButton, EmptyState, Field, PageHeader, Panel, fmtTime } from '../ui/kit';

export function Projects() {
  const { db, adapters } = useApp();
  const audit = useAudit();
  const settings = useSettings();
  const projects = useCollection('projects');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState<ProviderChoice>('auto');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', description: '' });
  const [pathDrafts, setPathDrafts] = useState<Record<string, string>>({});

  async function create() {
    if (!name.trim()) return;
    const p = await db.create('projects', { name: name.trim(), description: description.trim(), preferredProvider: provider, localPath: null });
    await db.update('settings', settings.id, { activeProjectId: p.id });
    await audit({ action: 'project.create', target: p.id, detail: p.name });
    setName(''); setDescription('');
  }

  async function remove(id: string, label: string) {
    const counts = await Promise.all([
      db.removeWhere('conversations', (c) => c.projectId === id),
      db.removeWhere('files', (f) => f.projectId === id),
      db.removeWhere('memory', (m) => m.projectId === id),
      db.removeWhere('research', (r) => r.projectId === id),
      db.removeWhere('scenes', (s) => s.projectId === id),
      db.removeWhere('assets', (a) => a.projectId === id),
    ]);
    const convIds = new Set(db.snapshot('conversations').map((c) => c.id));
    await db.removeWhere('messages', (m) => !convIds.has(m.conversationId));
    await db.remove('projects', id);
    if (settings.activeProjectId === id) await db.update('settings', settings.id, { activeProjectId: null });
    await audit({ action: 'project.delete', target: id, detail: `${label}; removed ${counts.reduce((a, b) => a + b, 0)} related records` });
  }

  return (
    <>
      <PageHeader title="Projects" subtitle="Projects group conversations, files, research, memory and assets. Everything is stored in this browser." />
      <Panel title="New project">
        <div className="grid g2">
          <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer portal" /></Field>
          <Field label="Preferred provider" hint="Used when you start work in this project. You can change it per task.">
            <select value={provider} onChange={(e) => setProvider(e.target.value as ProviderChoice)}>
              <option value="auto">Automatic</option>
              {adapters.map((a) => <option key={a.meta.id} value={a.meta.id}>{a.meta.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description"><input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project for?" /></Field>
        <div><button className="btn primary" onClick={create} disabled={!name.trim()}>Create project</button></div>
      </Panel>

      {projects.length === 0 ? (
        <Panel><EmptyState icon="folder" title="No projects yet">Create your first project above. It becomes the active project automatically.</EmptyState></Panel>
      ) : (
        <div className="stack">
          {[...projects].reverse().map((p) => (
            <div key={p.id} className="item">
              <div style={{ flex: 1 }}>
                {editing === p.id ? (
                  <div className="stack" style={{ gap: 8 }}>
                    <input aria-label="Project name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                    <input aria-label="Project description" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                  </div>
                ) : (
                  <>
                    <h3>{p.name}{settings.activeProjectId === p.id && <span className="pill s-connected" style={{ marginLeft: 8 }}>Active</span>}</h3>
                    <p>{p.description || 'No description'}</p>
                    <small>Created {fmtTime(p.createdAt)} · Provider: {p.preferredProvider}</small>
                    <div className="row tight" style={{ marginTop: 8, flexWrap: 'nowrap' }}>
                      <input aria-label={'Local folder path for ' + p.name} value={pathDrafts[p.id] ?? p.localPath ?? ''} placeholder="C:\\Projects\\MyApp" onChange={(e) => setPathDrafts((current) => ({ ...current, [p.id]: e.target.value }))} />
                      <button className="btn sm" disabled={(pathDrafts[p.id] ?? p.localPath ?? '').trim() === (p.localPath ?? '')} onClick={async () => {
                        const localPath = (pathDrafts[p.id] ?? '').trim() || null;
                        await db.update('projects', p.id, { localPath });
                        await audit({ action: 'project.local_path.set', target: p.id, detail: localPath ?? 'unlinked' });
                      }}>Save folder</button>
                    </div>
                    <small className="muted">The path must also be inside a folder listed in AURIX_CODEX_ROOTS in your local companion. Saving it here does not grant access.</small>
                  </>
                )}
              </div>
              <div className="row tight" style={{ justifyContent: 'flex-end' }}>
                {editing === p.id ? (
                  <>
                    <button className="btn" disabled={!draft.name.trim()} onClick={async () => { await db.update('projects', p.id, { name: draft.name.trim(), description: draft.description.trim() }); await audit({ action: 'project.update', target: p.id }); setEditing(null); }}>Save</button>
                    <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    {settings.activeProjectId !== p.id && <button className="btn" onClick={async () => { await db.update('settings', settings.id, { activeProjectId: p.id }); await audit({ action: 'project.switch', target: p.id }); }}>Open</button>}
                    <button className="btn ghost" onClick={() => { setEditing(p.id); setDraft({ name: p.name, description: p.description }); }}>Edit</button>
                    <ConfirmButton label="Delete" confirmLabel="Delete project and its data" onConfirm={() => remove(p.id, p.name)} />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
