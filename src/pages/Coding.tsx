import { useEffect, useMemo, useState } from 'react';
import { routeTask, type RouteDecision } from '../router/providerRouter';
import { diffLines, diffStats } from '../lib/diff';
import { validateRelativePath } from '../lib/paths';
import { useActiveProject, useApp, useAudit, useCollection } from '../state/AppState';
import { NeedsCompanion } from '../ui/NeedsCompanion';
import { ConfirmButton, EmptyState, Notice, PageHeader, Panel } from '../ui/kit';
import { navigate } from '../router/useRoute';

type Tab = 'changes' | 'terminal' | 'preview' | 'tests' | 'git';
const TABS: [Tab, string][] = [['changes', 'Changes'], ['terminal', 'Terminal'], ['preview', 'Preview'], ['tests', 'Tests'], ['git', 'Git']];

export function Coding() {
  const project = useActiveProject();
  if (!project) {
    return (
      <>
        <PageHeader title="Coding Studio" subtitle="Files, editor, review and (later) agents, terminal and preview." />
        <Panel><EmptyState icon="code" title="Pick a project first" action={<button className="btn primary" onClick={() => navigate('/projects')}>Go to Projects</button>}>
          The Coding Studio works inside a project.
        </EmptyState></Panel>
      </>
    );
  }
  return <Workspace projectId={project.id} name={project.name} />;
}

function Workspace({ projectId, name }: { projectId: string; name: string }) {
  const { db, adapters } = useApp();
  const audit = useAudit();
  const files = useCollection('files').filter((f) => f.projectId === projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newPath, setNewPath] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('changes');
  const [route, setRoute] = useState<RouteDecision | null>(null);
  const selected = files.find((f) => f.id === selectedId);

  useEffect(() => { setDraft(selected?.content ?? ''); setRenameTo(selected?.path ?? ''); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void routeTask(adapters, { kind: 'coding', preferred: 'auto' }).then(setRoute); }, [adapters]);

  const diff = useMemo(() => (selected ? diffLines(selected.content, draft) : []), [selected, draft]);
  const stats = diffStats(diff);
  const dirty = !!selected && draft !== selected.content;

  async function addFile() {
    const err = validateRelativePath(newPath);
    if (err) return setError(err);
    if (files.some((f) => f.path === newPath.trim())) return setError('A file with that path already exists.');
    const f = await db.create('files', { projectId, path: newPath.trim(), content: '' });
    await audit({ action: 'file.create', target: f.path, detail: 'browser workspace' });
    setNewPath(''); setError(null); setSelectedId(f.id);
  }
  async function rename() {
    if (!selected) return;
    const err = validateRelativePath(renameTo);
    if (err) return setError(err);
    if (files.some((f) => f.path === renameTo.trim() && f.id !== selected.id)) return setError('A file with that path already exists.');
    await db.update('files', selected.id, { path: renameTo.trim() });
    await audit({ action: 'file.rename', target: renameTo.trim(), detail: `from ${selected.path}` });
    setError(null);
  }

  return (
    <>
      <PageHeader title="Coding Studio" subtitle={`Project: ${name}`} />
      <Notice>
        You are editing a <b>browser workspace</b>: files live in this browser only and are not on your disk. Local folders, the terminal and live previews need the local companion, which is not built yet.
      </Notice>
      <div className="split three">
        <Panel title="Files">
          <div className="row tight" style={{ flexWrap: 'nowrap' }}>
            <input aria-label="New file path" placeholder="src/index.ts" value={newPath} onChange={(e) => setNewPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addFile()} />
            <button className="btn icon" aria-label="Create file" onClick={addFile}>+</button>
          </div>
          {error && <small role="alert" style={{ color: 'var(--bad)' }}>{error}</small>}
          {files.length === 0 ? <small>No files yet. Create one above.</small> : (
            <div className="stack" style={{ gap: 2 }}>
              {[...files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => (
                <button key={f.id} className={`list-btn mono ${f.id === selectedId ? 'on' : ''}`} onClick={() => setSelectedId(f.id)}>{f.path}</button>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={selected ? selected.path : 'Editor'}
          aside={selected && (
            <div className="row tight">
              <span className="muted" style={{ fontSize: 13 }}>{dirty ? `+${stats.added} −${stats.removed} unsaved` : 'Saved'}</span>
              <button className="btn primary sm" disabled={!dirty} onClick={async () => { await db.update('files', selected.id, { content: draft }); await audit({ action: 'file.save', target: selected.path, detail: `+${stats.added} −${stats.removed}` }); }}>Save</button>
              <button className="btn sm" disabled={!dirty} onClick={() => setDraft(selected.content)}>Revert</button>
            </div>
          )}
        >
          {!selected ? <EmptyState icon="file" title="Select or create a file">Edits stay unsaved until you save them. The Changes tab shows exactly what will change.</EmptyState> : (
            <>
              <textarea className="editor" aria-label={`Editing ${selected.path}`} spellCheck={false} value={draft} onChange={(e) => setDraft(e.target.value)} />
              <div className="row">
                <input style={{ maxWidth: 280 }} aria-label="Rename file" value={renameTo} onChange={(e) => setRenameTo(e.target.value)} />
                <button className="btn sm" disabled={renameTo.trim() === selected.path} onClick={rename}>Rename</button>
                <ConfirmButton label="Delete file" onConfirm={async () => { await db.remove('files', selected.id); await audit({ action: 'file.delete', target: selected.path }); setSelectedId(null); }} />
              </div>
            </>
          )}
        </Panel>

        <div className="stack">
          <Panel title="AI assistant">
            {route?.ok ? <small>Routing to {route.providerId}.</small> : (
              <Notice tone="warn">{route?.reason ?? 'Checking providers…'} Connect a coding provider and the companion to let an agent plan, edit and run tests.</Notice>
            )}
            <textarea aria-label="Instruction for coding agent" placeholder="Describe a change for an agent" disabled />
            <button className="btn" disabled>Start agent task</button>
            <small>Disabled: no connected provider can run coding tasks.</small>
          </Panel>
          <Panel title="Tasks"><small>No tasks. Agent tasks, checkpoints and rollback will appear here once agents can run.</small></Panel>
        </div>
      </div>

      <Panel>
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        {tab === 'changes' && (!selected ? <small>Select a file to review its changes.</small> : !dirty ? <small>No unsaved changes in {selected.path}.</small> : (
          <div className="diff" aria-label="Diff of unsaved changes">
            {diff.map((l, i) => <div key={i} className={l.kind === 'same' ? '' : l.kind}>{l.kind === 'add' ? '+ ' : l.kind === 'del' ? '− ' : '  '}{l.text}</div>)}
          </div>
        ))}
        {tab === 'terminal' && <NeedsCompanion what="The terminal" />}
        {tab === 'preview' && <NeedsCompanion what="Live preview" />}
        {tab === 'tests' && <NeedsCompanion what="Running tests" />}
        {tab === 'git' && <NeedsCompanion what="Git operations" />}
      </Panel>
    </>
  );
}
