import { useEffect, useMemo, useState } from 'react';
import {
  closeCodexAgent,
  getCodexAgentStatus,
  interruptCodexAgent,
  respondCodexAgentApproval,
  startCodexAgent,
} from '../companion/client';
import type { CodexAgentEvent, CodexAgentSession } from '../companion/protocol';
import { diffLines, diffStats } from '../lib/diff';
import { validateRelativePath } from '../lib/paths';
import { useActiveProject, useApp, useAudit, useCollection, useSettings, companionToken } from '../state/AppState';
import { NeedsCompanion } from '../ui/NeedsCompanion';
import { ConfirmButton, EmptyState, Field, Notice, PageHeader, Panel } from '../ui/kit';
import { navigate } from '../router/useRoute';

type Tab = 'changes' | 'terminal' | 'preview' | 'tests' | 'git';
const TABS: [Tab, string][] = [['changes', 'Changes'], ['terminal', 'Terminal'], ['preview', 'Preview'], ['tests', 'Tests'], ['git', 'Git']];

export function Coding() {
  const project = useActiveProject();
  if (!project) {
    return (
      <>
        <PageHeader title="Coding Studio" subtitle="Project editor, local Codex agent and change review." />
        <Panel><EmptyState icon="code" title="Pick a project first" action={<button className="btn primary" onClick={() => navigate('/projects')}>Go to Projects</button>}>
          Open or create a project before starting a coding task.
        </EmptyState></Panel>
      </>
    );
  }
  return <Workspace projectId={project.id} name={project.name} localPath={project.localPath} />;
}

function Workspace({ projectId, name, localPath }: { projectId: string; name: string; localPath: string | null }) {
  const { db } = useApp();
  const audit = useAudit();
  const settings = useSettings();
  const files = useCollection('files').filter((f) => f.projectId === projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newPath, setNewPath] = useState('');
  const [renameTo, setRenameTo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('changes');
  const [agentPrompt, setAgentPrompt] = useState('');
  const [agentSnapshot, setAgentSnapshot] = useState<CodexAgentSession | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState('');
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const selected = files.find((f) => f.id === selectedId);
  const companionConfig = { url: settings.companionUrl, token: companionToken.get() };

  useEffect(() => { setDraft(selected?.content ?? ''); setRenameTo(selected?.path ?? ''); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sessionId = agentSnapshot?.id;
    if (!sessionId) return;
    let live = true;
    let cursor = agentSnapshot.nextCursor;
    const poll = async () => {
      try {
        const next = await getCodexAgentStatus(companionConfig, sessionId, cursor);
        if (!live) return;
        cursor = next.nextCursor;
        setAgentSnapshot((current) => {
          if (!current || current.id !== sessionId) return next;
          const merged = new Map<number, CodexAgentEvent>();
          for (const item of [...current.events, ...next.events]) merged.set(item.sequence, item);
          return { ...next, events: [...merged.values()].sort((a, b) => a.sequence - b.sequence) };
        });
      } catch (pollError) {
        if (live) setAgentError(pollError instanceof Error ? pollError.message : 'Could not refresh the local coding task.');
      }
    };
    const timer = window.setInterval(() => { void poll(); }, 1000);
    void poll();
    return () => { live = false; window.clearInterval(timer); };
  }, [agentSnapshot?.id, settings.companionUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  const diff = useMemo(() => (selected ? diffLines(selected.content, draft) : []), [selected, draft]);
  const stats = diffStats(diff);
  const dirty = !!selected && draft !== selected.content;
  const events = agentSnapshot?.events ?? [];
  const responded = new Set(events.filter((event) => event.type === 'agent.approval.responded').map((event) => event.id));
  const pendingApprovals = events.filter((event) => event.type === 'agent.approval.required' && typeof event.id === 'string' && !responded.has(event.id));
  const output = events.filter((event) => event.type === 'agent.output.delta').map((event) => String(event.text ?? '')).join('');

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
  async function startAgent() {
    if (!localPath?.trim()) {
      setAgentError('Link this project to its local folder in Projects first.');
      return;
    }
    if (!companionConfig.url || !companionConfig.token) {
      setAgentError('Pair and verify the local companion in Settings first.');
      return;
    }
    if (!agentPrompt.trim() || agentBusy) return;
    setAgentBusy(true);
    setAgentError('');
    try {
      const session = await startCodexAgent(companionConfig, localPath.trim(), agentPrompt.trim());
      setAgentSnapshot(session);
      setAgentPrompt('');
      await audit({ action: 'codex.agent.start', target: projectId, detail: session.id });
    } catch (startError) {
      setAgentError(startError instanceof Error ? startError.message : 'Could not start the local coding agent.');
    } finally {
      setAgentBusy(false);
    }
  }
  async function resolveApproval(id: string, decision: 'accept' | 'decline') {
    if (!agentSnapshot || approvalBusyId) return;
    setApprovalBusyId(id);
    setAgentError('');
    try {
      await respondCodexAgentApproval(companionConfig, agentSnapshot.id, id, decision);
      await audit({ action: 'codex.agent.approval', target: id, detail: decision, outcome: decision === 'accept' ? 'success' : 'info' });
      const next = await getCodexAgentStatus(companionConfig, agentSnapshot.id, agentSnapshot.nextCursor);
      setAgentSnapshot((current) => current ? { ...next, events: [...current.events, ...next.events] } : next);
    } catch (approvalError) {
      setAgentError(approvalError instanceof Error ? approvalError.message : 'The approval could not be recorded.');
    } finally {
      setApprovalBusyId(null);
    }
  }
  async function interruptAgent() {
    if (!agentSnapshot) return;
    setAgentBusy(true);
    try {
      await interruptCodexAgent(companionConfig, agentSnapshot.id);
      await audit({ action: 'codex.agent.interrupt', target: agentSnapshot.id });
      const next = await getCodexAgentStatus(companionConfig, agentSnapshot.id, agentSnapshot.nextCursor);
      setAgentSnapshot((current) => current ? { ...next, events: [...current.events, ...next.events] } : next);
    } catch (stopError) {
      setAgentError(stopError instanceof Error ? stopError.message : 'Could not interrupt the coding task.');
    } finally {
      setAgentBusy(false);
    }
  }
  async function closeAgent() {
    if (!agentSnapshot) return;
    try {
      await closeCodexAgent(companionConfig, agentSnapshot.id);
      await audit({ action: 'codex.agent.close', target: agentSnapshot.id });
      setAgentSnapshot(null);
      setAgentError('');
    } catch (closeError) {
      setAgentError(closeError instanceof Error ? closeError.message : 'Could not close the coding session.');
    }
  }

  return (
    <>
      <PageHeader title="Coding Studio" subtitle={`Project: ${name}`} />
      <Notice>
        The editor on the left is a browser-only workspace. The Codex agent below works in the linked local folder instead. It starts read-only; any additional file permission or command approval appears here before AURIX responds to Codex.
      </Notice>
      <div className="split three">
        <Panel title="Files">
          <div className="row tight" style={{ flexWrap: 'nowrap' }}>
            <input aria-label="New file path" placeholder="src/index.ts" value={newPath} onChange={(e) => setNewPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addFile()} />
            <button className="btn icon" aria-label="Create file" onClick={addFile}>+</button>
          </div>
          {error && <small role="alert" style={{ color: 'var(--bad)' }}>{error}</small>}
          {files.length === 0 ? <small>No browser workspace files yet. Create one above.</small> : (
            <div className="stack" style={{ gap: 2 }}>
              {[...files].sort((a, b) => a.path.localeCompare(b.path)).map((f) => (
                <button key={f.id} className={`list-btn mono ${f.id === selectedId ? 'on' : ''}`} onClick={() => setSelectedId(f.id)}>{f.path}</button>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title={selected ? selected.path : 'Browser editor'}
          aside={selected && (
            <div className="row tight">
              <span className="muted" style={{ fontSize: 13 }}>{dirty ? `+${stats.added} −${stats.removed} unsaved` : 'Saved'}</span>
              <button className="btn primary sm" disabled={!dirty} onClick={async () => { await db.update('files', selected.id, { content: draft }); await audit({ action: 'file.save', target: selected.path, detail: `+${stats.added} −${stats.removed}` }); }}>Save</button>
              <button className="btn sm" disabled={!dirty} onClick={() => setDraft(selected.content)}>Revert</button>
            </div>
          )}
        >
          {!selected ? <EmptyState icon="file" title="Select or create a browser file">These files stay in this browser. They are separate from the actual folder linked to the Codex agent.</EmptyState> : (
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
          <Panel title="Local Codex coding agent">
            {localPath ? <small>Linked folder: <code>{localPath}</code></small> : <Notice tone="warn">No local folder linked. Add the path to this project in Projects.</Notice>}
            <small>For access to work, the linked path must also be under an explicitly approved AURIX_CODEX_ROOTS folder in the companion environment.</small>
            <Field label="Task for Codex"><textarea aria-label="Instruction for coding agent" value={agentPrompt} onChange={(e) => setAgentPrompt(e.target.value)} placeholder="Describe the change, investigation or test you want Codex to perform." rows={5} /></Field>
            <div className="row">
              <button className="btn primary" disabled={!localPath || !agentPrompt.trim() || agentBusy || agentSnapshot?.status === 'running'} onClick={() => void startAgent()}>
                {agentBusy ? 'Starting…' : 'Start coding task'}
              </button>
              {agentSnapshot?.status === 'running' && <button className="btn danger" disabled={agentBusy} onClick={() => void interruptAgent()}>Stop task</button>}
              {agentSnapshot && agentSnapshot.status !== 'running' && <button className="btn" onClick={() => void closeAgent()}>Close session</button>}
            </div>
            {agentSnapshot && <small>Status: <b>{agentSnapshot.status}</b> · Session: <code>{agentSnapshot.id.slice(0, 8)}</code></small>}
            {agentError && <Notice tone="bad">{agentError}</Notice>}
          </Panel>
          {agentSnapshot && (
            <Panel title="Agent activity">
              {pendingApprovals.map((event) => {
                const id = String(event.id);
                const kind = String(event.kind ?? 'approval');
                const isNetwork = kind === 'network';
                return (
                  <div className="panel" key={id}>
                    <h3>Approval needed: {kind.replace('_', ' ')}</h3>
                    {typeof event.reason === 'string' && <p>{event.reason}</p>}
                    {Array.isArray(event.command) && event.command.length > 0 && <><small>Command (review before approving)</small><pre className="code-block">{JSON.stringify(event.command, null, 2)}</pre></>}
                    {typeof event.cwd === 'string' && <small>Working folder: <code>{event.cwd}</code></small>}
                    {Array.isArray(event.changes) && event.changes.map((change, index) => (
                      <div key={index}>
                        <small>{String((change as Record<string, unknown>).kind ?? 'change')}: {String((change as Record<string, unknown>).path ?? '')}</small>
                        <pre className="code-block">{String((change as Record<string, unknown>).diff ?? '')}</pre>
                      </div>
                    ))}
                    {event.requestedPermissions && <><small>Requested filesystem permission (review carefully)</small><pre className="code-block">{JSON.stringify(event.requestedPermissions, null, 2)}</pre></>}
                    {isNetwork && <Notice tone="warn">Network access is never granted by this AURIX coding workflow.</Notice>}
                    <div className="row">
                      <button className="btn primary" disabled={isNetwork || approvalBusyId !== null} onClick={() => void resolveApproval(id, 'accept')}>
                        {approvalBusyId === id ? 'Saving…' : 'Approve this request'}
                      </button>
                      <button className="btn" disabled={approvalBusyId !== null} onClick={() => void resolveApproval(id, 'decline')}>Decline</button>
                    </div>
                    <small>Approval applies to this request only. Filesystem grants are limited to this project for this turn; command approvals are not remembered.</small>
                  </div>
                );
              })}
              {output && <div><h3>Codex response</h3><pre className="code-block">{output}</pre></div>}
              {events.filter((event) => event.type === 'agent.plan.updated').map((event, index) => (
                <div key={index}><h3>Plan</h3><ol>{(Array.isArray(event.plan) ? event.plan : []).map((step, stepIndex) => {
                  const item = step as Record<string, unknown>;
                  return <li key={stepIndex}>{String(item.step ?? '')} <small>({String(item.status ?? '')})</small></li>;
                })}</ol></div>
              ))}
              {events.filter((event) => event.type === 'agent.command.output').map((event, index) => (
                <pre className="code-block" key={index}>{String(event.text ?? '')}</pre>
              ))}
              {events.filter((event) => event.type === 'agent.diff.updated').slice(-1).map((event, index) => (
                <div key={index}><h3>Current project diff</h3><pre className="code-block">{String(event.diff ?? '')}</pre></div>
              ))}
              {agentSnapshot.error && <Notice tone="bad">{agentSnapshot.error}</Notice>}
            </Panel>
          )}
          <Panel title="Tasks"><small>Codex task sessions are shown here with live status and approvals. Generic terminal access remains disabled.</small></Panel>
        </div>
      </div>

      <Panel>
        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
        </div>
        {tab === 'changes' && (!selected ? <small>Select a browser file to review its changes.</small> : !dirty ? <small>No unsaved changes in {selected.path}.</small> : (
          <div className="diff" aria-label="Diff of unsaved changes">
            {diff.map((line, index) => <div key={index} className={line.kind === 'same' ? '' : line.kind}>{line.kind === 'add' ? '+ ' : line.kind === 'del' ? '− ' : '  '}{line.text}</div>)}
          </div>
        ))}
        {tab === 'terminal' && <NeedsCompanion what="The general terminal" />}
        {tab === 'preview' && <NeedsCompanion what="Live preview" />}
        {tab === 'tests' && <NeedsCompanion what="Standalone test controls" />}
        {tab === 'git' && <NeedsCompanion what="Git operations" />}
      </Panel>
    </>
  );
}
