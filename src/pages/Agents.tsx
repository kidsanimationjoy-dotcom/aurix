import { useState } from 'react';
import type { AgentDef, Permission } from '../domain/types';
import { useActiveProject, useApp, useAudit, useCollection, useTaskEngine } from '../state/AppState';
import type { TaskAgentProfile } from '../tasks/types';
import { ConfirmButton, Field, Notice, PageHeader, Panel } from '../ui/kit';
import { navigate } from '../router/useRoute';

const PERMS: (keyof Pick<AgentDef['permissions'], 'fileWrite' | 'terminal'>)[] = ['fileWrite', 'terminal'];
const PERM_LABEL = { fileWrite: 'File changes', terminal: 'Command execution' } as const;

export function Agents() {
  const { db } = useApp();
  const engine = useTaskEngine();
  const audit = useAudit();
  const agents = useCollection('agents');
  const project = useActiveProject();
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [modes, setModes] = useState<Record<string, 'chat' | 'coding'>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runMessages, setRunMessages] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function runAgent(agent: AgentDef) {
    const prompt = (prompts[agent.id] ?? '').trim();
    if (!prompt || runningId) return;
    const mode = modes[agent.id] ?? 'chat';
    setRunningId(agent.id);
    setRunMessages((current) => ({ ...current, [agent.id]: '' }));
    setErrors((current) => ({ ...current, [agent.id]: '' }));
    const profile: TaskAgentProfile = {
      id: agent.id,
      name: agent.name,
      role: agent.role,
      summary: agent.summary,
      instructions: agent.instructions,
      permissions: {
        fileWrite: agent.permissions.fileWrite,
        terminal: agent.permissions.terminal,
        // AURIX never grants network access, even if an older saved agent said "ask".
        network: 'deny',
      },
    };
    try {
      const task = await engine.submit({
        projectId: project?.id ?? null,
        prompt,
        preferredProvider: 'openai',
        intentOverride: mode,
        agentProfile: profile,
      });
      await audit({
        action: 'agent.run.submit',
        target: agent.id,
        detail: 'task=' + task.id + '; mode=' + mode,
        outcome: task.status === 'waiting_for_provider' ? 'info' : 'success',
      });
      setPrompts((current) => ({ ...current, [agent.id]: '' }));
      setRunMessages((current) => ({
        ...current,
        [agent.id]: task.status === 'awaiting_approval'
          ? 'Task created. Review the plan and approve it in Task Center before Codex starts.'
          : task.status === 'waiting_for_provider'
            ? 'Task saved in Task Center, but it is waiting: ' + task.errorMessage
            : 'Task created in Task Center with status ' + task.status + '.',
      }));
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [agent.id]: error instanceof Error ? error.message : 'Could not start this agent task.',
      }));
    } finally {
      setRunningId(null);
    }
  }

  return (
    <>
      <PageHeader title="Agents" subtitle="Specialist agents with saved role instructions and permission boundaries." />
      <Notice>
        Agents now run through Task Center using the local Codex connection. Every run needs your approval before it starts; command and file permissions are reviewed separately during the task. Network access is always blocked by AURIX.
      </Notice>
      <Panel title="Add a custom agent">
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input aria-label="Agent name" placeholder="Release notes agent" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" disabled={!name.trim()} onClick={async () => {
            const a = await db.create('agents', {
              role: 'custom',
              name: name.trim(),
              summary: 'Custom agent',
              instructions: '',
              permissions: { fileWrite: 'ask', terminal: 'ask', network: 'deny' },
              enabled: true,
              builtIn: false,
            });
            await audit({ action: 'agent.create', target: a.id, detail: a.name });
            setName('');
            setOpenId(a.id);
          }}>Add agent</button>
        </div>
      </Panel>
      <Panel title="Run context">
        <p>{project ? <><b>Active project:</b> {project.name}</> : 'No active project selected.'}</p>
        {project?.localPath
          ? <small>Linked local folder: <code>{project.localPath}</code>. Coding tasks still require this folder to be within AURIX_CODEX_ROOTS.</small>
          : <Notice tone="warn">No local project folder is linked. Agents can still use read-only chat mode, but coding mode needs a linked folder configured in Projects.</Notice>}
        <div className="row">
          <button className="btn" onClick={() => navigate('/tasks')}>Open Task Center</button>
          <button className="btn" onClick={() => navigate('/projects')}>Manage project folder</button>
        </div>
      </Panel>
      <div className="stack">
        {agents.map((agent) => {
          const mode = modes[agent.id] ?? 'chat';
          return (
            <div key={agent.id} className="panel">
              <div className="panel-head">
                <div>
                  <h2>{agent.name} <span className="pill">Task Center runtime</span></h2>
                  <small>{agent.summary}</small>
                </div>
                <div className="row tight">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={agent.enabled}
                      onChange={async (event) => {
                        await db.update('agents', agent.id, { enabled: event.target.checked });
                        await audit({ action: event.target.checked ? 'agent.enable' : 'agent.disable', target: agent.name });
                      }}
                    />
                    Enabled
                  </label>
                  <button className="btn sm" onClick={() => setOpenId(openId === agent.id ? null : agent.id)}>
                    {openId === agent.id ? 'Close' : 'Configure / Run'}
                  </button>
                </div>
              </div>
              {openId === agent.id && (
                <>
                  <Field label="Role"><input aria-label={agent.name + ' role'} defaultValue={agent.role} onBlur={async (event) => {
                    if (event.target.value.trim() !== agent.role) {
                      await db.update('agents', agent.id, { role: event.target.value.trim().slice(0, 100) });
                      await audit({ action: 'agent.role', target: agent.name });
                    }
                  }} /></Field>
                  <Field label="Summary"><input aria-label={agent.name + ' summary'} defaultValue={agent.summary} onBlur={async (event) => {
                    if (event.target.value.trim() !== agent.summary) {
                      await db.update('agents', agent.id, { summary: event.target.value.trim().slice(0, 300) });
                      await audit({ action: 'agent.summary', target: agent.name });
                    }
                  }} /></Field>
                  <Field label="Instructions">
                    <textarea
                      aria-label={agent.name + ' instructions'}
                      defaultValue={agent.instructions}
                      maxLength={8000}
                      onBlur={async (event) => {
                        if (event.target.value !== agent.instructions) {
                          await db.update('agents', agent.id, { instructions: event.target.value.slice(0, 8000) });
                          await audit({ action: 'agent.instructions', target: agent.name });
                        }
                      }}
                    />
                  </Field>
                  <div className="grid g2">
                    {PERMS.map((key) => (
                      <Field key={key} label={PERM_LABEL[key]}>
                        <select
                          value={agent.permissions[key]}
                          onChange={async (event) => {
                            await db.update('agents', agent.id, {
                              permissions: { ...agent.permissions, [key]: event.target.value as Permission },
                            });
                            await audit({ action: 'agent.permission', target: agent.name, detail: key + '=' + event.target.value });
                          }}
                        >
                          <option value="ask">Ask before each use</option>
                          <option value="deny">Always deny</option>
                        </select>
                      </Field>
                    ))}
                  </div>
                  <Notice tone="info">Network access is always denied by AURIX. File changes and command execution follow the settings above. An agent cannot widen its own permissions.</Notice>
                  <div className="divider" />
                  <h3>Run this agent</h3>
                  <Field label="Task mode">
                    <select value={mode} onChange={(event) => setModes((current) => ({ ...current, [agent.id]: event.target.value as 'chat' | 'coding' }))}>
                      <option value="chat">Read-only chat / reasoning</option>
                      <option value="coding">Project coding task</option>
                    </select>
                  </Field>
                  <Field label="What should this agent do?">
                    <textarea
                      aria-label={'Task for ' + agent.name}
                      rows={4}
                      maxLength={10_000}
                      value={prompts[agent.id] ?? ''}
                      onChange={(event) => setPrompts((current) => ({ ...current, [agent.id]: event.target.value }))}
                      placeholder="Describe the task for this specialist agent."
                    />
                  </Field>
                  {mode === 'coding' && !project?.localPath && <Notice tone="warn">Link a project folder in Projects and add it to AURIX_CODEX_ROOTS before running a coding task.</Notice>}
                  {errors[agent.id] && <Notice tone="bad">{errors[agent.id]}</Notice>}
                  {runMessages[agent.id] && <Notice>{runMessages[agent.id]}</Notice>}
                  <div className="row">
                    <button className="btn primary" disabled={!agent.enabled || !prompts[agent.id]?.trim() || runningId !== null} onClick={() => void runAgent(agent)}>
                      {runningId === agent.id ? 'Creating task…' : 'Run agent in Task Center'}
                    </button>
                    <button className="btn" onClick={() => navigate('/tasks')}>View tasks</button>
                  </div>
                  {!agent.builtIn && <ConfirmButton label="Delete agent" onConfirm={async () => {
                    await db.remove('agents', agent.id);
                    await audit({ action: 'agent.delete', target: agent.name });
                    setOpenId(null);
                  }} />}
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
