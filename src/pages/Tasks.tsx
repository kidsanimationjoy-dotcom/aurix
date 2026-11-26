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
        This task engine is local and transparent. At present, provider integrations do not expose AURIX's task-execution contract, so tasks will wait rather than pretend an AI model has completed them.
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
                      <small className="muted">{fmtTime(task.createdAt)} · {task.intent} · {task.intentReason}</small>
                    </div>
                    <span className={`pill task-status ${task.status}`}>{STATUS_LABEL[task.status]}</span>
                  </div>

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

                  <div className="row">
                    {task.status === 'waiting_for_provider' && (
                      <button className="btn sm" onClick={async () => {
                        const retried = await engine.retry(task.id);
                        if (retried) await audit({ action: 'task.retry', target: task.id, outcome: 'info' });
                      }}>Check provider again</button>
                    )}
                    {!isTerminal(task.status) && (
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
