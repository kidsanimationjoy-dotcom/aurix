import { useState } from 'react';
import type { AgentDef, Permission } from '../domain/types';
import { useApp, useAudit, useCollection } from '../state/AppState';
import { ConfirmButton, Field, Notice, PageHeader, Panel } from '../ui/kit';

const PERMS: (keyof AgentDef['permissions'])[] = ['fileWrite', 'terminal', 'network'];
const PERM_LABEL = { fileWrite: 'File writes', terminal: 'Terminal', network: 'Network' } as const;

export function Agents() {
  const { db } = useApp();
  const audit = useAudit();
  const agents = useCollection('agents');
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState('');

  return (
    <>
      <PageHeader title="Agents" subtitle="Specialist agent definitions: role, instructions and permission boundaries." />
      <Notice>These are definitions only. No agent is running, so there is no activity, status or output to show. Running an agent needs a connected provider and the local companion. Permissions can only be set to “ask first” or “deny”.</Notice>
      <Panel title="Add a custom agent">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input aria-label="Agent name" placeholder="Release notes agent" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" disabled={!name.trim()} onClick={async () => {
            const a = await db.create('agents', { role: 'custom', name: name.trim(), summary: 'Custom agent', instructions: '', permissions: { fileWrite: 'ask', terminal: 'ask', network: 'ask' }, enabled: true, builtIn: false });
            await audit({ action: 'agent.create', target: a.id, detail: a.name }); setName(''); setOpenId(a.id);
          }}>Add agent</button>
        </div>
      </Panel>
      <div className="stack">
        {agents.map((a) => (
          <div key={a.id} className="panel">
            <div className="panel-head">
              <div><h2>{a.name} <span className="pill">No runtime</span></h2><small>{a.summary}</small></div>
              <div className="row tight">
                <label className="check"><input type="checkbox" checked={a.enabled} onChange={async (e) => { await db.update('agents', a.id, { enabled: e.target.checked }); await audit({ action: e.target.checked ? 'agent.enable' : 'agent.disable', target: a.name }); }} />Enabled</label>
                <button className="btn sm" onClick={() => setOpenId(openId === a.id ? null : a.id)}>{openId === a.id ? 'Close' : 'Configure'}</button>
              </div>
            </div>
            {openId === a.id && (
              <>
                <Field label="Instructions"><textarea defaultValue={a.instructions} onBlur={async (e) => { if (e.target.value !== a.instructions) { await db.update('agents', a.id, { instructions: e.target.value }); await audit({ action: 'agent.instructions', target: a.name }); } }} /></Field>
                <div className="grid g3">
                  {PERMS.map((k) => (
                    <Field key={k} label={PERM_LABEL[k]}>
                      <select value={a.permissions[k]} onChange={async (e) => { await db.update('agents', a.id, { permissions: { ...a.permissions, [k]: e.target.value as Permission } }); await audit({ action: 'agent.permission', target: a.name, detail: `${k}=${e.target.value}` }); }}>
                        <option value="ask">Ask before each use</option><option value="deny">Deny</option>
                      </select>
                    </Field>
                  ))}
                </div>
                {!a.builtIn && <div><ConfirmButton label="Delete agent" onConfirm={async () => { await db.remove('agents', a.id); await audit({ action: 'agent.delete', target: a.name }); }} /></div>}
              </>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
