import { useMemo, useState, type FormEvent } from 'react';
import type { ProviderChoice } from '../domain/types';
import { useActiveProject, useApp, useAudit, useCollection, useSettings } from '../state/AppState';
import { useTaskEngine } from '../state/AppState';
import { EmptyState, Notice, PageHeader, Panel, fmtTime } from '../ui/kit';
import type { TaskStatus } from '../tasks/types';

const STATUS_LABEL: Record<TaskStatus, string> = {
  queued: 'Queued',
  classifying: 'Classifying',
  planning: 'Planning',
  needs_clarification: 'Needs clarification',
  waiting_for_provider: 'Waiting for provider',
  awaiting_approval: 'Awaiting your approval',
  awaiting_action_approval: 'Local action needs approval',
  running: 'Running',
  cancelling: 'Stopping',
  succeeded: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
  timed_out: 'Timed out',
};

function isTerminal(status: TaskStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'timed_out';
}

export function Tasks() {
  const { adapters } = useApp();
  const engine = useTaskEngine();
  const audit = useAudit();
  const project = useActiveProject();
  const settings = useSettings();
  const tasks = useCollection('tasks');
  const taskEvents = useCollection('taskEvents');
  const [prompt, setPrompt] = useState('');
  const [provider, setProvider] = useState<ProviderChoice>('auto');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const orderedTasks = useMemo(
    () => [...tasks].filter((task) => task.projectId === (settings.activeProjectId ?? null)).reverse(),
    [tasks, settings.activeProjectId],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const task = await engine.submit({
        projectId: project?.id ?? null,
        prompt,
        preferredProvider: provider,
      });
      await audit({
        action: 'task.submit',
        target: task.id,
        detail: `intent=${task.intent}; status=${task.status}`,
        outcome: task.status === 'waiting_for_provider' ? 'info' : 'success',
      });
      setPrompt('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create task.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Task Center"
        subtitle="AURIX classifies, plans, routes and records work. Provider execution is only enabled through a real connected task adapter."
      />
      <Notice tone="info">
        This task engine is local and transparent. Codex coding tasks run only inside the selected approved project folder. Every command or file permission request must be reviewed separately here before Codex can continue.
      </Notice>

      <Panel title="Create a task">
        <form onSubmit={submit} className="stack">
          <label className="field">
            <span>What should AURIX do?</span>
            <textarea
              aria-label="Task description"
              rows={4}
              maxLength={10_000}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Example: Build a responsive dashboard and explain the files that need to change."
            />
            <small>{prompt.length.toLocaleString()} / 10,000 characters. The first classifier is rule-based and will show its reason.</small>
          </label>
          <label className="field">
            <span>Provider</span>
            <select value={provider} onChange={(event) => setProvider(event.target.value as ProviderChoice)}>
              <option value="auto">Automatic (only connected providers)</option>
              {adapters.map((adapter) => (
                <option key={adapter.meta.id} value={adapter.meta.id}>{adapter.meta.name}</option>
              ))}
            </select>
            <small>A selected provider will never be silently replaced by another provider.</small>
          </label>
          {error && <Notice tone="bad">{error}</Notice>}
          {project ? (
            project.localPath ? (
              <small className="muted">Active project folder: <code>{project.localPath}</code>. Codex can use it only when it is inside an AURIX_CODEX_ROOTS folder.</small>
            ) : (
              <Notice tone="warn">This project has no local folder linked. Read-only chat tasks can still run, but coding tasks need a real folder saved in Projects and included in AURIX_CODEX_ROOTS.</Notice>
            )
          ) : (
            <Notice tone="warn">No active project is selected. Read-only chat tasks can still run, but coding tasks need a selected project with a linked local folder.</Notice>
          )}
          <div className="row">
            <button type="submit" className="btn primary" disabled={!prompt.trim() || submitting}>
              {submitting ? 'Creating task…' : 'Create task'}
            </button>
            <span className="muted">{project ? `Project: ${project.name}` : 'No active project — task will be saved in the workspace.'}</span>
          </div>
        </form>
      </Panel>

      <Panel title={`Tasks · ${orderedTasks.length}`}>
        {orderedTasks.length === 0 ? (
          <EmptyState icon="list" title="No tasks yet">
            Create a task above. AURIX will show its classification, plan, provider decision and final state here.
          </EmptyState>
        ) : (
          <div className="stack">
            {orderedTasks.map((task) => {
              const events = taskEvents.filter((item) => item.taskId === task.id).slice(-5).reverse();
              return (
                <section key={task.id} className="panel task-card">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong>{task.prompt.length > 100 ? `${task.prompt.slice(0, 100)}…` : task.prompt}</strong>
                      <small className="muted">{fmtTime(task.createdAt)} · {task.intent} · {task.intentReason}{task.agentProfile ? ' · Agent: ' + task.agentProfile.name : ''}</small>
                    </div>
                    <span className={`pill task-status ${task.status}`}>{STATUS_LABEL[task.status]}</span>
                  </div>

                  {task.agentProfile && <small>Agent: {task.agentProfile.name} · File changes: {task.agentProfile.permissions.fileWrite} · Commands: {task.agentProfile.permissions.terminal} · Network: denied</small>}
                  {task.selectedProviderId && <small>Provider: {adapters.find((item) => item.meta.id === task.selectedProviderId)?.meta.name ?? task.selectedProviderId}</small>}
                  <div className="task-progress" role="progressbar" aria-label="Task progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={task.progress}>
                    <span style={{ width: `${task.progress}%` }} />
                  </div>

                  <div className="stack tight">
                    <strong>Plan</strong>
                    {task.plan.map((step) => (
                      <div key={step.id} className="row tight">
                        <span aria-hidden="true">{step.status === 'completed' ? '✓' : step.status === 'running' ? '●' : '○'}</span>
                        <span>{step.title}</span>
                        <small className="muted">{step.status}</small>
                      </div>
                    ))}
                  </div>

                  {task.errorMessage && <Notice tone={task.status === 'failed' || task.status === 'timed_out' ? 'bad' : 'warn'}>{task.errorMessage}</Notice>}
                  {task.output && <div className="task-output"><strong>Result</strong><p>{task.output}</p></div>}

                  {events.length > 0 && (
                    <details>
                      <summary>Task history ({events.length} recent events)</summary>
                      <div className="stack tight">
                        {events.map((item) => <small key={item.id}>{fmtTime(item.createdAt)} · {item.message}</small>)}
                      </div>
                    </details>
                  )}

                  {task.status === 'awaiting_approval' && (
                    <Notice tone="warn">
                      Review the selected provider and plan before starting this task. This approval only authorizes the provider to begin the task; every later file or command operation requires another one-time approval.
                    </Notice>
                  )}

                  {task.status === 'awaiting_action_approval' && task.pendingActionApproval && (() => {
                    const approval = task.pendingActionApproval;
                    const isNetwork = approval.kind === 'network';
                    const isSessionGrant = !!approval.grantRoot;
                    const isUnreviewableFileChange = approval.kind === 'file_change' && approval.changes.length === 0;
                    const canApprove = !isNetwork && !isSessionGrant && !isUnreviewableFileChange;
                    return (
                      <div className="panel" role="group" aria-label="Codex local action approval">
                        <h3>Codex requests permission: {approval.kind.replace('_', ' ')}</h3>
                        {approval.reason && <p>{approval.reason}</p>}
                        {approval.command.length > 0 && <>
                          <small>Exact command requested</small>
                          <pre className="code-block">{approval.command.join('\n')}</pre>
                        </>}
                        {approval.cwd && <small>Working directory: <code>{approval.cwd}</code></small>}
                        {approval.network && (
                          <Notice tone="warn">Network request: {approval.network.protocol}://{approval.network.host}. AURIX never approves network access.</Notice>
                        )}
                        {approval.grantRoot && (
                          <Notice tone="warn">Session-wide access request for <code>{approval.grantRoot}</code> is not allowed. Codex must request exact per-turn paths instead.</Notice>
                        )}
                        {approval.changes.map((change, index) => (
                          <div key={index}>
                            <small>{change.kind}: {change.path}</small>
                            {change.diff && <pre className="code-block">{change.diff}</pre>}
                          </div>
                        ))}
                        {approval.requestedPermissions !== undefined && approval.requestedPermissions !== null && (
                          <div>
                            <small>Requested filesystem permissions</small>
                            <pre className="code-block">{JSON.stringify(approval.requestedPermissions, null, 2)}</pre>
                          </div>
                        )}
                        {approval.commandActions && approval.commandActions.length > 0 && (
                          <div>
                            <small>Parsed command actions</small>
                            <pre className="code-block">{JSON.stringify(approval.commandActions, null, 2)}</pre>
                          </div>
                        )}
                        {isUnreviewableFileChange && <Notice tone="warn">No exact changed-file list was supplied, so AURIX will not approve this request.</Notice>}
                        <Notice tone="info">This decision applies to this request only. File-system grants are limited to the selected project and current task turn. No session-wide grants are saved.</Notice>
                        <small>Expires: {fmtTime(approval.expiresAt)}. AURIX automatically declines if no decision is made before expiry.</small>
                        <div className="row">
                          <button
                            className="btn primary sm"
                            disabled={!canApprove}
                            onClick={async () => {
                              const accepted = await engine.resolveActionApproval(task.id, approval.id, 'accept');
                              if (accepted) await audit({ action: 'task.action_approval.accept', target: approval.id, detail: approval.kind, outcome: 'success' });
                            }}
                          >Approve this action</button>
                          <button
                            className="btn sm"
                            onClick={async () => {
                              const declined = await engine.resolveActionApproval(task.id, approval.id, 'decline');
                              if (declined) await audit({ action: 'task.action_approval.decline', target: approval.id, detail: approval.kind, outcome: 'denied' });
                            }}
                          >Decline</button>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="row">
                    {task.status === 'awaiting_approval' && (
                      <>
                        <button className="btn primary sm" onClick={async () => {
                          const approved = await engine.approve(task.id);
                          if (approved) await audit({
                            action: 'task.approve',
                            target: task.id,
                            detail: `provider=${task.selectedProviderId ?? 'none'}; status=${approved.status}`,
                            outcome: approved.status === 'running' ? 'success' : 'info',
                          });
                        }}>Approve &amp; run task</button>
                        <button className="btn sm" onClick={async () => {
                          const declined = await engine.decline(task.id);
                          if (declined) await audit({ action: 'task.approval.decline', target: task.id, outcome: 'denied' });
                        }}>Decline</button>
                      </>
                    )}
                    {task.status === 'waiting_for_provider' && (
                      <button className="btn sm" onClick={async () => {
                        const retried = await engine.retry(task.id);
                        if (retried) await audit({ action: 'task.retry', target: task.id, outcome: 'info' });
                      }}>Check provider again</button>
                    )}
                    {!isTerminal(task.status) && task.status !== 'awaiting_approval' && (
                      <button className="btn sm" onClick={async () => {
                        const ok = await engine.cancel(task.id);
                        if (ok) await audit({ action: 'task.cancel', target: task.id, outcome: 'info' });
                      }}>Cancel task</button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </Panel>
    </>
  );
}
