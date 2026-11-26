import type { ProviderAdapter, ProviderId } from '../adapters/types';
import type { Db } from '../storage/db';
import { routeTask, type TaskKind } from '../router/providerRouter';
import { classifyIntent, createPlan } from './classifier';
import type {
  CreateTaskInput,
  TaskEventType,
  TaskExecutionAdapter,
  TaskExecutionContext,
  TaskExecutionRequest,
  TaskRecord,
  TaskStatus,
} from './types';

const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 10 * 60_000;

interface RunningTask {
  controller: AbortController;
  promise: Promise<void>;
}

function isExecutionAdapter(adapter: ProviderAdapter): adapter is ProviderAdapter & TaskExecutionAdapter {
  return typeof (adapter as Partial<TaskExecutionAdapter>).executeTask === 'function';
}

function routeKind(intent: TaskRecord['intent'], prompt: string): TaskKind | null {
  if (intent === 'chat') return 'chat';
  if (intent === 'coding') return 'coding';
  if (intent === 'research') return 'investigation';
  if (intent === 'media') return /\b(image|picture|illustration|logo|poster|graphic)\b/i.test(prompt)
    ? 'media_image'
    : 'media_video';
  return null;
}

function boundedTimeout(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_TIMEOUT_MS;
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.floor(value ?? DEFAULT_TIMEOUT_MS)));
}

function isTerminal(status: TaskStatus): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'timed_out';
}

export class TaskEngine {
  private readonly running = new Map<string, RunningTask>();
  private recoveryPromise: Promise<number> | null = null;

  constructor(private readonly db: Db, private readonly adapters: ProviderAdapter[]) {}

  async submit(input: CreateTaskInput): Promise<TaskRecord> {
    const prompt = input.prompt.trim();
    if (!prompt) throw new Error('Enter a task before submitting it.');
    if (prompt.length > 10_000) throw new Error('Task descriptions must be 10,000 characters or fewer.');

    const task = await this.db.create('tasks', {
      projectId: input.projectId,
      prompt,
      intent: 'unknown',
      intentReason: '',
      preferredProvider: input.preferredProvider,
      selectedProviderId: null,
      status: 'queued',
      plan: [],
      progress: 0,
      output: '',
      errorCode: '',
      errorMessage: '',
      timeoutMs: boundedTimeout(input.timeoutMs),
      startedAt: null,
      finishedAt: null,
    });
    await this.event(task.id, 'task.created', 'Task saved to this device.', null);
    return this.processTask(task.id);
  }

  /** Re-check a task that is waiting for a provider, without losing its original task ID or history. */
  async retry(taskId: string): Promise<TaskRecord | null> {
    const task = this.db.get('tasks', taskId);
    if (!task || task.status !== 'waiting_for_provider') return null;
    if (this.running.has(taskId)) return this.db.get('tasks', taskId) ?? null;

    await this.db.update('tasks', taskId, {
      status: 'queued',
      intent: 'unknown',
      intentReason: '',
      selectedProviderId: null,
      plan: [],
      progress: 0,
      output: '',
      errorCode: '',
      errorMessage: '',
      startedAt: null,
      finishedAt: null,
    });
    await this.event(taskId, 'task.retried', 'Re-checking provider availability for this saved task.', null);
    return this.processTask(taskId);
  }

  private async processTask(taskId: string): Promise<TaskRecord> {
    const task = this.db.get('tasks', taskId);
    if (!task) throw new Error(`Task ${taskId} not found.`);

    await this.setStatus(taskId, 'classifying');
    const classification = classifyIntent(task.prompt);
    await this.db.update('tasks', taskId, {
      intent: classification.intent,
      intentReason: classification.reason,
    });
    await this.event(taskId, 'task.classified', `Classified as ${classification.intent}: ${classification.reason}`, null);

    const plan = createPlan(classification.intent);
    await this.db.update('tasks', taskId, { status: 'planning', plan });
    await this.event(taskId, 'task.plan.created', `Created a ${plan.length}-step plan.`, null);

    const kind = routeKind(classification.intent, task.prompt);
    if (!kind) {
      await this.finishWithoutExecution(
        taskId,
        'needs_clarification',
        'NEEDS_CLARIFICATION',
        'Please add more detail so AURIX can identify the right task type.',
        'task.waiting_for_clarification',
      );
      return this.db.get('tasks', taskId)!;
    }

    let decision;
    try {
      decision = await routeTask(this.adapters, { kind, preferred: task.preferredProvider });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider status check failed.';
      await this.finishWithoutExecution(taskId, 'waiting_for_provider', 'PROVIDER_CHECK_FAILED', message, 'task.waiting_for_provider');
      return this.db.get('tasks', taskId)!;
    }

    for (const item of decision.considered) {
      await this.event(taskId, 'provider.checked', `${item.name}: ${item.state} — ${item.why}`.slice(0, 500), item.providerId);
    }

    if (!decision.ok) {
      await this.finishWithoutExecution(taskId, 'waiting_for_provider', 'NO_PROVIDER', decision.reason, 'task.waiting_for_provider');
      return this.db.get('tasks', taskId)!;
    }

    const adapter = this.adapters.find((candidate) => candidate.meta.id === decision.providerId);
    if (!adapter) {
      await this.finishWithoutExecution(taskId, 'waiting_for_provider', 'ADAPTER_MISSING', 'The selected provider adapter is not registered.', 'task.waiting_for_provider');
      return this.db.get('tasks', taskId)!;
    }

    await this.db.update('tasks', taskId, { selectedProviderId: decision.providerId });
    await this.event(taskId, 'provider.selected', `Selected ${adapter.meta.name} (${decision.mode}).`, decision.providerId);

    if (!isExecutionAdapter(adapter)) {
      await this.finishWithoutExecution(
        taskId,
        'waiting_for_provider',
        'EXECUTOR_NOT_IMPLEMENTED',
        `${adapter.meta.name} reports a connection but has no AURIX task-execution adapter. No work was sent.`,
        'task.waiting_for_provider',
        decision.providerId,
      );
      return this.db.get('tasks', taskId)!;
    }

    const startedAt = Date.now();
    const planInProgress = plan.map((step, index) => ({ ...step, status: index === 0 ? 'running' as const : 'pending' as const }));
    await this.db.update('tasks', taskId, {
      status: 'running',
      startedAt,
      plan: planInProgress,
    });
    await this.event(taskId, 'task.started', 'Provider execution started.', decision.providerId);
    void this.execute(taskId, adapter, decision.providerId);
    return this.db.get('tasks', taskId)!;
  }

  async cancel(taskId: string): Promise<boolean> {
    const task = this.db.get('tasks', taskId);
    if (!task || isTerminal(task.status)) return false;

    const running = this.running.get(taskId);
    if (!running) {
      await this.db.update('tasks', taskId, {
        status: 'cancelled',
        errorCode: 'CANCELLED',
        errorMessage: 'Task cancelled before execution started.',
        finishedAt: Date.now(),
      });
      await this.event(taskId, 'task.cancelled', 'Task cancelled before execution started.', task.selectedProviderId);
      return true;
    }

    if (!running.controller.signal.aborted) {
      await this.db.update('tasks', taskId, {
        status: 'cancelling',
        errorCode: 'CANCEL_REQUESTED',
        errorMessage: 'Cancellation requested; waiting for the provider adapter to stop.',
      });
      await this.event(taskId, 'task.cancel.requested', 'Cancellation requested.', task.selectedProviderId);
      running.controller.abort('user');
    }
    return true;
  }

  /** Running or mid-preparation tasks cannot survive a browser reload; do not pretend they resumed. */
  recoverInterruptedTasks(): Promise<number> {
    if (this.recoveryPromise) return this.recoveryPromise;
    this.recoveryPromise = (async () => {
      const interrupted = this.db.snapshot('tasks').filter((task) =>
        task.status === 'queued' || task.status === 'classifying' || task.status === 'planning'
        || task.status === 'running' || task.status === 'cancelling'
      );
      for (const task of interrupted) {
        await this.db.update('tasks', task.id, {
          status: 'failed',
          errorCode: 'INTERRUPTED_AFTER_RELOAD',
          errorMessage: 'The browser was closed or reloaded while this task was in progress. Submit it again to retry.',
          finishedAt: Date.now(),
        });
        await this.event(task.id, 'task.interrupted', 'Task execution or preparation was interrupted by an app reload.', task.selectedProviderId);
      }
      return interrupted.length;
    })();
    return this.recoveryPromise;
  }

  private async execute(taskId: string, adapter: ProviderAdapter & TaskExecutionAdapter, providerId: ProviderId): Promise<void> {
    const controller = new AbortController();
    const task = this.db.get('tasks', taskId);
    if (!task) return;
    const timeout = setTimeout(() => {
      void (async () => {
        const latest = this.db.get('tasks', taskId);
        if (!latest || isTerminal(latest.status)) return;
        await this.db.update('tasks', taskId, {
          status: 'cancelling',
          errorCode: 'TIMEOUT_REQUESTED',
          errorMessage: 'Time limit reached; waiting for the provider adapter to acknowledge the stop.',
        });
        await this.event(taskId, 'task.timeout.requested', 'Task timeout reached; stop requested.', providerId);
        const current = this.db.get('tasks', taskId);
        if (current && !isTerminal(current.status)) controller.abort('timeout');
      })().catch((error) => {
        const message = error instanceof Error ? error.message : 'Timeout handling failed.';
        void this.db.update('tasks', taskId, {
          status: 'failed',
          errorCode: 'TIMEOUT_HANDLING_FAILED',
          errorMessage: message,
          finishedAt: Date.now(),
        }).then(() => this.event(taskId, 'task.failed', message.slice(0, 500), providerId)).catch(() => undefined);
      });
    }, task.timeoutMs);
    const request: TaskExecutionRequest = {
      taskId,
      projectId: task.projectId,
      prompt: task.prompt,
      intent: task.intent,
      plan: task.plan,
    };
    const context: TaskExecutionContext = {
      signal: controller.signal,
      emitProgress: async (message, progress) => {
        if (controller.signal.aborted) return;
        const latest = this.db.get('tasks', taskId);
        if (!latest || isTerminal(latest.status)) return;
        const value = Number.isFinite(progress) ? Math.max(0, Math.min(99, Math.floor(progress!))) : latest.progress;
        await this.db.update('tasks', taskId, { progress: value });
        await this.event(taskId, 'task.progress', message.slice(0, 500), providerId);
      },
    };

    const promise = (async () => {
      try {
        const result = await adapter.executeTask(request, context);
        if (controller.signal.aborted) {
          await this.finishAborted(taskId, controller.signal.reason, providerId);
          return;
        }
        const latest = this.db.get('tasks', taskId);
        await this.db.update('tasks', taskId, {
          status: 'succeeded',
          progress: 100,
          output: result.output,
          errorCode: '',
          errorMessage: '',
          finishedAt: Date.now(),
          plan: (latest?.plan ?? []).map((step) => ({ ...step, status: 'completed' })),
        });
        await this.event(taskId, 'task.completed', 'Provider returned a completed result.', providerId);
      } catch (error) {
        if (controller.signal.aborted) {
          await this.finishAborted(taskId, controller.signal.reason, providerId);
          return;
        }
        const message = error instanceof Error ? error.message : 'Provider task failed.';
        const latest = this.db.get('tasks', taskId);
        await this.db.update('tasks', taskId, {
          status: 'failed',
          errorCode: 'PROVIDER_EXECUTION_FAILED',
          errorMessage: message,
          finishedAt: Date.now(),
          plan: (latest?.plan ?? []).map((step) => step.status === 'running' ? { ...step, status: 'failed' as const } : step),
        });
        await this.event(taskId, 'task.failed', message.slice(0, 500), providerId);
      } finally {
        clearTimeout(timeout);
        this.running.delete(taskId);
      }
    })();

    this.running.set(taskId, { controller, promise });
    await promise;
  }

  private async finishAborted(taskId: string, reason: unknown, providerId: ProviderId): Promise<void> {
    const timedOut = reason === 'timeout';
    const status = timedOut ? 'timed_out' : 'cancelled';
    const message = timedOut
      ? 'The task timed out and the provider adapter acknowledged the stop.'
      : 'The provider adapter acknowledged cancellation.';
    const latest = this.db.get('tasks', taskId);
    await this.db.update('tasks', taskId, {
      status,
      errorCode: timedOut ? 'TIMEOUT' : 'CANCELLED',
      errorMessage: message,
      finishedAt: Date.now(),
      plan: (latest?.plan ?? []).map((step) => step.status === 'running' ? { ...step, status: 'skipped' as const } : step),
    });
    await this.event(taskId, timedOut ? 'task.timed_out' : 'task.cancelled', message, providerId);
  }

  private async finishWithoutExecution(
    taskId: string,
    status: 'needs_clarification' | 'waiting_for_provider',
    code: string,
    message: string,
    eventType: Extract<TaskEventType, 'task.waiting_for_clarification' | 'task.waiting_for_provider'>,
    providerId: ProviderId | null = null,
  ): Promise<void> {
    await this.db.update('tasks', taskId, {
      status,
      errorCode: code,
      errorMessage: message,
      finishedAt: null,
      selectedProviderId: providerId,
    });
    await this.event(taskId, eventType, message.slice(0, 500), providerId);
  }

  private async setStatus(taskId: string, status: TaskStatus): Promise<void> {
    await this.db.update('tasks', taskId, { status });
  }

  private async event(taskId: string, type: TaskEventType, message: string, providerId: ProviderId | null): Promise<void> {
    await this.db.create('taskEvents', { taskId, type, message, providerId });
  }
}
