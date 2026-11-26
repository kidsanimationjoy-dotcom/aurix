import { useState } from 'react';
import type { McpTransport } from '../domain/types';
import { twentyFirstMeta } from '../adapters/twentyfirst';
import { useApp, useAudit, useCollection } from '../state/AppState';
import { ConfirmButton, EmptyState, Field, Notice, PageHeader, Panel, StatusPill } from '../ui/kit';

function targetError(t: McpTransport, target: string): string | null {
  const v = target.trim();
  if (!v) return 'Enter a command or URL.';
  if (t === 'stdio') return null;
  try { const u = new URL(v); return u.protocol === 'https:' || u.protocol === 'http:' ? null : 'Use an http(s) URL.'; } catch { return 'That is not a valid URL.'; }
}

export function Mcp() {
  const { db } = useApp();
  const audit = useAudit();
  const servers = useCollection('mcpServers');
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<McpTransport>('http');
  const [target, setTarget] = useState('');
  const err = target ? targetError(transport, target) : null;
  const can = name.trim() && target.trim() && !targetError(transport, target);
  const twentyUrl = twentyFirstMeta.references.find((r) => r.label.includes('MCP'))?.url ?? '';

  return (
    <>
      <PageHeader title="MCP Tools" subtitle="Register Model Context Protocol servers. Configuration is stored locally." />
      <Notice tone="warn">Servers are saved but never contacted. Connecting, testing and tool discovery need the local companion or backend. Do not put API keys in these fields.</Notice>
      <Panel title="Add a server" aside={<button className="btn sm" onClick={() => { setName('21st.dev'); setTransport('http'); setTarget(twentyUrl); }}>Prefill 21st.dev</button>}>
        <div className="grid g3">
          <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Transport"><select value={transport} onChange={(e) => setTransport(e.target.value as McpTransport)}><option value="http">HTTP</option><option value="sse">SSE</option><option value="stdio">stdio (command)</option></select></Field>
          <Field label={transport === 'stdio' ? 'Command' : 'URL'} hint={err ?? undefined}><input value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
        </div>
        <div><button className="btn primary" disabled={!can} onClick={async () => {
          const s = await db.create('mcpServers', { name: name.trim(), transport, target: target.trim(), enabled: false });
          await audit({ action: 'mcp.add', target: s.name, detail: `${transport} ${s.target}` });
          setName(''); setTarget('');
        }}>Save server</button></div>
      </Panel>
      {servers.length === 0 ? <Panel><EmptyState icon="link" title="No MCP servers">Add a server above to register it.</EmptyState></Panel> : (
        <div className="stack">
          {servers.map((s) => (
            <div className="item" key={s.id}>
              <div><h3>{s.name} <span className="pill">{s.transport}</span> <StatusPill state="not_configured" /></h3><p className="mono">{s.target}</p><small>Tools: not discovered (server has never been contacted)</small></div>
              <div className="row tight">
                <label className="check"><input type="checkbox" checked={s.enabled} onChange={async (e) => { await db.update('mcpServers', s.id, { enabled: e.target.checked }); await audit({ action: e.target.checked ? 'mcp.enable' : 'mcp.disable', target: s.name }); }} />Enabled</label>
                <button className="btn sm" disabled title="Needs the local companion or backend">Test connection</button>
                <ConfirmButton label="Remove" confirmLabel="Remove server" onConfirm={async () => { await db.remove('mcpServers', s.id); await audit({ action: 'mcp.remove', target: s.name }); }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
