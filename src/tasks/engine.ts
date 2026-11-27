import type { ProviderAdapter, ProviderId } from '../adapters/types';
import type { Db } from '../storage/db';
import { routeTask, type TaskKind } from '../router/providerRouter';
import { classifyIntent, createPlan } from './classifier';
import { newId } from '../lib/id';
import type {
  CreateTaskInput,
  TaskEventType,
  TaskExecutionAdapter,
  TaskExecutionContext,
  TaskExecutionRequest,
  TaskActionApproval,
  TaskActionApprovalDecision,
  TaskRecord,
  TaskStatus,
} from './types';

const DEFAULT_TIMEOUT_MS = 120_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 10 * 60_000;
const MAX_OUTPUT_CHARS = 200_000;
const ACTION_APPROVAL_TIMEOUT_MS = 100_000;

interface RunningTask {
  controller: AbortController;
  promise: Promise<void>;
}

interface PendingActionApproval {
  id: string;
  resolve: (decision: TaskActionApprovalDecision) => void;
  signal: AbortSignal;
  onAbort: () => void;
  timer: ReturnType<typeof setTimeout> | undefined;
  settled: boolean;
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
  private readonly approving = new Set<string>();
  private readonly pendingActionApprovals = new Map<string, PendingActionApproval>();
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
      approvalStatus: 'not_required',
      approvedAt: null,
      pendingActionApproval: null,
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
      approvalStatus: 'not_required',
      approvedAt: null,
      pendingActionApproval: null,
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

    // A real adapter may be available, but AURIX must show the selected provider
    // and the complete plan before it dispatches any task to that adapter.
    await this.db.update('tasks', taskId, {
      status: 'awaiting_approval',
      approvalStatus: 'pending',
      approvedAt: null,
      startedAt: null,
      progress: 0,
      plan: plan.map((step) => ({ ...step, status: 'pending' as const })),
      errorCode: '',
      errorMessage: '',
    });
    await this.event(
      taskId,
      'task.approval.requested',
      'Review the selected provider and plan. No provider task has been started.',
      decision.providerId,
    );
    return this.db.get('tasks', taskId)!;
  }

  /** Re-check the same selected provider, then execute only after a fresh user approval. */
  async approve(taskId: string): Promise<TaskRecord | null> {
    const task = this.db.get('tasks', taskId);
    if (!task || task.status !== 'awaiting_approval' || task.approvalStatus !== 'pending') return null;
    if (this.approving.has(taskId)) return this.db.get('tasks', taskId) ?? null;

    this.approving.add(taskId);
    try {
      const providerId = task.selectedProviderId;
      const kind = routeKind(task.intent, task.prompt);
      if (!providerId || !kind) return null;

      let decision;
      try {
        // A specific provider choice is binding. Never route approval to a replacement.
        decision = await routeTask(this.adapters, { kind, preferred: providerId });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Provider status check failed during approval.';
        await this.finishWithoutExecution(
          taskId, 'waiting_for_provider', 'PROVIDER_CHECK_FAILED_AT_APPROVAL',
          message, 'task.waiting_for_provider', providerId,
        );
        return this.db.get('tasks', taskId) ?? null;
      }

      if (!decision.ok || decision.providerId !== providerId) {
        await this.finishWithoutExecution(
          taskId, 'waiting_for_provider', 'PROVIDER_NOT_READY_AT_APPROVAL',
          decision.ok ? 'The selected provider changed. Review the task again before running it.' : decision.reason,
          'task.waiting_for_provider', providerId,
        );
        return this.db.get('tasks', taskId) ?? null;
      }

      const adapter = this.adapters.find((candidate) => candidate.meta.id === providerId);
      if (!adapter || !isExecutionAdapter(adapter)) {
        await this.finishWithoutExecution(
          taskId, 'waiting_for_provider', 'EXECUTOR_NOT_IMPLEMENTED',
          'The selected provider no longer exposes a real AURIX task executor. No work was sent.',
          'task.waiting_for_provider', providerId,
        );
        return this.db.get('tasks', taskId) ?? null;
      }

      // A decline/cancel may have happened while the provider was being re-checked.
      const stillPending = this.db.get('tasks', taskId);
      if (!stillPending || stillPending.status !== 'awaiting_approval' || stillPending.approvalStatus !== 'pending') {
        return stillPending ?? null;
      }

      const startedAt = Date.now();
      const planInProgress = stillPending.plan.map((step, index) => ({
        ...step,
        status: index === 0 ? 'running' as const : 'pending' as const,
      }));
      await this.db.update('tasks', taskId, {
        status: 'running',
        approvalStatus: 'approved',
        approvedAt: startedAt,
        startedAt,
        plan: planInProgress,
        errorCode: '',
        errorMessage: '',
      });
      await this.event(taskId, 'task.approval.granted', 'You approved this task for the selected provider.', providerId);
      // Cancellation can arrive while the approval event is being persisted.
      // Re-check immediately before dispatch so a task cancelled in that window never runs.
      const readyToDispatch = this.db.get('tasks', taskId);
      if (!readyToDispatch || readyToDispatch.status !== 'running' || readyToDispatch.approvalStatus !== 'approved') {
        return readyToDispatch ?? null;
      }
      void this.execute(taskId, adapter, providerId);
      return this.db.get('tasks', taskId) ?? null;
    } finally {
      this.approving.delete(taskId);
    }
  }

  /** Decline a pending task plan without sending the prompt to the provider. */
  async decline(taskId: string): Promise<boolean> {
    const task = this.db.get('tasks', taskId);
    if (!task || task.status !== 'awaiting_approval' || task.approvalStatus !== 'pending') return false;
    await this.db.update('tasks', taskId, {
      status: 'cancelled',
      approvalStatus: 'declined',
      approvedAt: null,
      errorCode: 'APPROVAL_DECLINED',
      errorMessage: 'You declined this task. No work was sent to the provider.',
      finishedAt: Date.now(),
    });
    await this.event(taskId, 'task.approval.denied', 'You declined the task plan. No work was sent to the provider.', task.selectedProviderId);
    await this.event(taskId, 'task.cancelled', 'Task declined before provider execution.', task.selectedProviderId);
    return true;
  }

  async cancel(taskId: string): Promise<boolean> {
    const task = this.db.get('tasks', taskId);
    if (!task || isTerminal(task.status)) return false;
    if (task.status === 'awaiting_approval') return this.decline(taskId);

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
        || task.status === 'running' || task.status === 'cancelling' || task.status === 'awaiting_action_approval'
      );
      for (const task of interrupted) {
        await this.db.update('tasks', task.id, {
          status: 'failed',
          pendingActionApproval: null,
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
      emitOutput: async (delta) => {
        if (controller.signal.aborted || !delta) return;
        const latest = this.db.get('tasks', taskId);
        if (!latest || isTerminal(latest.status)) return;
        const remaining = MAX_OUTPUT_CHARS - latest.output.length;
        if (remaining <= 0) return;
        const safeDelta = delta.slice(0, remaining);
        await this.db.update('tasks', taskId, { output: latest.output + safeDelta });
        await this.event(taskId, 'task.output.delta', `Received ${safeDelta.length} output characters.`, providerId);
      },
      requestApproval: (request) => this.requestActionApproval(taskId, providerId, request, controller.signal),
    };

    const promise = (async () => {
      try {
        // Invoke the adapter first so the started event cannot claim execution began
        // when the task was cancelled before the provider call was dispatched.
        const execution = adapter.executeTask(request, context);
        await this.event(taskId, 'task.started', 'Provider execution started after your approval.', providerId);
        const result = await execution;
        if (controller.signal.aborted) {
          await this.finishAborted(taskId, controller.signal.reason, providerId);
          return;
        }
        const latest = this.db.get('tasks', taskId);
        await this.db.update('tasks', taskId, {
          status: 'succeeded',
          progress: 100,
          output: (result.output || latest?.output || '').slice(0, MAX_OUTPUT_CHARS),
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

  /**
   * Pause a running task while Codex asks for a narrowly scoped local action.
   * The task remains cancellable and the decision is one-time; no grant is cached.
   */
  private async requestActionApproval(
    taskId: string,
    providerId: ProviderId,
    request: Omit<TaskActionApproval, 'id'>,
    signal: AbortSignal,
  ): Promise<TaskActionApprovalDecision> {
    const current = this.db.get('tasks', taskId);
    if (!current || current.status !== 'running' || signal.aborted) return 'cancel';
    if (this.pendingActionApprovals.has(taskId)) {
      throw new Error('A local permission request is already awaiting a decision for this task.');
    }

    const approval: TaskActionApproval = {
      ...request,
      id: newId('taskapproval'),
      expiresAt: Date.now() + ACTION_APPROVAL_TIMEOUT_MS,
      reason: String(request.reason ?? '').slice(0, 1000),
      command: Array.isArray(request.command) ? request.command.slice(0, 40).map((item) => String(item).slice(0, 500)) : [],
      cwd: String(request.cwd ?? '').slice(0, 2048),
      changes: Array.isArray(request.changes) ? request.changes.slice(0, 30).map((change) => ({
        path: String(change.path ?? '').slice(0, 500),
        kind: String(change.kind ?? '').slice(0, 80),
        diff: String(change.diff ?? '').slice(0, 6000),
      })) : [],
      grantRoot: typeof request.grantRoot === 'string' ? request.grantRoot.slice(0, 2048) : undefined,
      network: request.network && typeof request.network.host === 'string'
        ? { host: request.network.host.slice(0, 255), protocol: String(request.network.protocol ?? '').slice(0, 40) }
        : null,
      commandActions: Array.isArray(request.commandActions) ? request.commandActions.slice(0, 20) : [],
    };

    let resolvePromise!: (decision: TaskActionApprovalDecision) => void;
    const decisionPromise = new Promise<TaskActionApprovalDecision>((resolve) => { resolvePromise = resolve; });
    let abortBeforeRegistration = false;
    const pending: PendingActionApproval = {
      id: approval.id,
      resolve: resolvePromise,
      signal,
      timer: undefined,
      settled: false,
      onAbort: () => {
        if (!this.pendingActionApprovals.has(taskId)) {
          abortBeforeRegistration = true;
          return;
        }
        void this.settleActionApproval(taskId, approval.id, 'cancel').catch(() => undefined);
      },
    };
    signal.addEventListener('abort', pending.onAbort, { once: true });

    try {
      const latest = this.db.get('tasks', taskId);
      if (!latest || latest.status !== 'running' || signal.aborted) {
        signal.removeEventListener('abort', pending.onAbort);
        return 'cancel';
      }
      await this.db.update('tasks', taskId, {
        status: 'awaiting_action_approval',
        pendingActionApproval: approval,
      });
      clearTimeout(pending.timer);
      pending.timer = setTimeout(() => {
        void this.settleActionApproval(taskId, approval.id, 'decline').catch(() => undefined);
      }, Math.max(1, approval.expiresAt - Date.now()));
      this.pendingActionApprovals.set(taskId, pending);
      await this.event(
        taskId,
        'task.action_approval.requested',
        'Codex requested a local action. Review its exact scope before allowing it.',
        providerId,
      );
      if (abortBeforeRegistration || signal.aborted) {
        await this.settleActionApproval(taskId, approval.id, 'cancel');
      }
      return await decisionPromise;
    } catch (error) {
      clearTimeout(pending.timer);
      signal.removeEventListener('abort', pending.onAbort);
      this.pendingActionApprovals.delete(taskId);
      if (!pending.settled) {
        pending.settled = true;
        pending.resolve('cancel');
      }
      throw error;
    }
  }

  async resolveActionApproval(
    taskId: string,
    approvalId: string,
    decision: Exclude<TaskActionApprovalDecision, 'cancel'>,
  ): Promise<boolean> {
    const task = this.db.get('tasks', taskId);
    const pending = this.pendingActionApprovals.get(taskId);
    if (!task || task.status !== 'awaiting_action_approval' ||
        task.pendingActionApproval?.id !== approvalId || !pending || pending.id !== approvalId) {
      return false;
    }
    return this.settleActionApproval(taskId, approvalId, decision);
  }

  private async settleActionApproval(
    taskId: string,
    approvalId: string,
    decision: TaskActionApprovalDecision,
  ): Promise<boolean> {
    const pending = this.pendingActionApprovals.get(taskId);
    if (!pending || pending.id !== approvalId || pending.settled) return false;
    pending.settled = true;
    clearTimeout(pending.timer);
    this.pendingActionApprovals.delete(taskId);
    pending.signal.removeEventListener('abort', pending.onAbort);

    try {
      const latest = this.db.get('tasks', taskId);
      if (latest?.pendingActionApproval?.id === approvalId) {
        const patch: Partial<TaskRecord> = { pendingActionApproval: null };
        if (latest.status === 'awaiting_action_approval') {
          patch.status = decision === 'cancel' ? 'cancelling' : 'running';
        }
        await this.db.update('tasks', taskId, patch);
      }
      if (decision === 'accept') {
        await this.event(taskId, 'task.action_approval.granted', 'You approved this one-time local action.', latest?.selectedProviderId ?? null);
      } else if (decision === 'decline') {
        await this.event(taskId, 'task.action_approval.denied', 'You declined this local action. Codex was told not to perform it.', latest?.selectedProviderId ?? null);
      }
      pending.resolve(decision);
      return true;
    } catch (error) {
      pending.resolve('cancel');
      throw error;
    }
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
