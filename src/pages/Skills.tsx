import { useState } from 'react';
import { useApp, useAudit, useCollection } from '../state/AppState';
import { ConfirmButton, EmptyState, Field, Notice, PageHeader, Panel } from '../ui/kit';

const TEMPLATE = `---
name: my-skill
description: When to use this skill
---

# Instructions

Describe the steps the agent should follow.
`;

function frontmatter(md: string): { name: string; description: string } {
  const m = /^---\s*\n([\s\S]*?)\n---/.exec(md);
  const get = (k: string) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(m?.[1] ?? '')?.[1]?.trim() ?? '';
  return { name: get('name'), description: get('description') };
}

export function Skills() {
  const { db } = useApp();
  const audit = useAudit();
  const skills = useCollection('skills');
  const [body, setBody] = useState(TEMPLATE);
  const [version, setVersion] = useState('0.1.0');
  const [openId, setOpenId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);

  async function add(text: string, origin: 'custom' | 'imported') {
    const fm = frontmatter(text);
    if (!fm.name) return setErr('SKILL.md needs a "name:" line in its front matter.');
    if (skills.some((s) => s.name === fm.name)) return setErr(`A skill named "${fm.name}" already exists.`);
    const s = await db.create('skills', { name: fm.name, description: fm.description, body: text, version, enabled: false, origin });
    await audit({ action: `skill.${origin === 'imported' ? 'import' : 'create'}`, target: s.name });
    setErr(null);
  }
  const shown = skills.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageHeader title="Skills" subtitle="Reusable instructions in SKILL.md format. Stored locally." />
      <Notice>Skills are saved and can be enabled here, but nothing executes them yet. Running a skill needs a connected agent provider. New skills start disabled.</Notice>
      <Panel title="Add a skill">
        <Field label="SKILL.md"><textarea className="editor" style={{ minHeight: 180 }} spellCheck={false} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="row">
          <Field label="Version"><input style={{ width: 110 }} value={version} onChange={(e) => setVersion(e.target.value)} /></Field>
          <button className="btn primary" onClick={() => void add(body, 'custom')}>Save skill</button>
          <label className="btn">Import file…<input type="file" accept=".md,text/markdown,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (f) await add(await f.text(), 'imported'); e.target.value = ''; }} /></label>
        </div>
        {err && <small role="alert" style={{ color: 'var(--bad)' }}>{err}</small>}
      </Panel>
      <input aria-label="Search skills" placeholder="Search installed skills" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 ? <Panel><EmptyState icon="spark" title={skills.length ? 'No matches' : 'No skills yet'}>Add a SKILL.md above or import one from a file.</EmptyState></Panel> : (
        <div className="stack">
          {shown.map((s) => (
            <div className="panel" key={s.id}>
              <div className="panel-head">
                <div><h2>{s.name} <span className="pill">v{s.version}</span> <span className="pill">{s.origin}</span></h2><small>{s.description || 'No description'}</small></div>
                <div className="row tight">
                  <label className="check"><input type="checkbox" checked={s.enabled} onChange={async (e) => { await db.update('skills', s.id, { enabled: e.target.checked }); await audit({ action: e.target.checked ? 'skill.enable' : 'skill.disable', target: s.name }); }} />Enabled</label>
                  <button className="btn sm" onClick={() => setOpenId(openId === s.id ? null : s.id)}>{openId === s.id ? 'Hide' : 'View SKILL.md'}</button>
                  <ConfirmButton label="Delete" onConfirm={async () => { await db.remove('skills', s.id); await audit({ action: 'skill.delete', target: s.name }); }} />
                </div>
              </div>
              {openId === s.id && <pre className="code-view" tabIndex={0}>{s.body}</pre>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
