import { useState } from 'react';
import { useActiveProject, useApp, useAudit, useCollection } from '../state/AppState';
import { ConfirmButton, EmptyState, Field, Notice, PageHeader, Panel, fmtTime } from '../ui/kit';

export function Memory() {
  const { db } = useApp();
  const audit = useAudit();
  const project = useActiveProject();
  const entries = useCollection('memory');
  const [text, setText] = useState('');
  const [scope, setScope] = useState<'global' | 'project'>('global');
  const [editId, setEditId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const visible = entries.filter((e) => e.scope === 'global' || e.projectId === project?.id);

  return (
    <>
      <PageHeader title="Memory" subtitle="Notes you approve for AURIX to keep. You can inspect, edit and delete every entry." />
      <Notice>Only entries you add here are stored, on this device. Memory kept by Claude, Grok or OpenAI is separate and is not read or shared by AURIX.</Notice>
      <Panel title="Add a memory">
        <Field label="Memory"><textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Prefer TypeScript strict mode. Never run destructive commands without asking." /></Field>
        <div className="row">
          <Field label="Applies to">
            <select value={scope} onChange={(e) => setScope(e.target.value as 'global' | 'project')}>
              <option value="global">All projects</option>
              <option value="project" disabled={!project}>{project ? `Only ${project.name}` : 'Only the active project (none selected)'}</option>
            </select>
          </Field>
          <button className="btn primary" disabled={!text.trim()} onClick={async () => {
            const m = await db.create('memory', { scope, projectId: scope === 'project' ? project?.id ?? null : null, text: text.trim() });
            await audit({ action: 'memory.add', target: m.id, detail: scope }); setText('');
          }}>Save memory</button>
        </div>
      </Panel>
      {visible.length === 0 ? <Panel><EmptyState icon="brain" title="No memories">Saved memories will appear here.</EmptyState></Panel> : (
        <div className="stack">
          {[...visible].reverse().map((m) => (
            <div className="item" key={m.id}>
              <div style={{ flex: 1 }}>
                {editId === m.id ? <textarea aria-label="Edit memory" value={editText} onChange={(e) => setEditText(e.target.value)} /> : <p style={{ color: 'var(--text)' }}>{m.text}</p>}
                <small>{m.scope === 'global' ? 'All projects' : 'This project'} · {fmtTime(m.createdAt)}</small>
              </div>
              <div className="row tight">
                {editId === m.id ? (
                  <><button className="btn sm" disabled={!editText.trim()} onClick={async () => { await db.update('memory', m.id, { text: editText.trim() }); await audit({ action: 'memory.edit', target: m.id }); setEditId(null); }}>Save</button><button className="btn ghost sm" onClick={() => setEditId(null)}>Cancel</button></>
                ) : (
                  <><button className="btn ghost sm" onClick={() => { setEditId(m.id); setEditText(m.text); }}>Edit</button><ConfirmButton label="Delete" onConfirm={async () => { await db.remove('memory', m.id); await audit({ action: 'memory.delete', target: m.id }); }} /></>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
