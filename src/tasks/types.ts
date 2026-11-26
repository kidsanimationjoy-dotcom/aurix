import type { ProviderId } from '../adapters/types';
import type { ProviderChoice } from '../domain/types';

export type TaskIntent = 'chat' | 'coding' | 'research' | 'media' | 'unknown';
export type TaskStatus =
  | 'queued'
  | 'classifying'
  | 'planning'
  | 'needs_clarification'
  | 'waiting_for_provider'
  | 'running'
  | 'cancelling'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export interface TaskPlanStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
}

export interface TaskRecord {
  id: string;
  createdAt: number;
  updatedAt: number;
  projectId: string | null;
  prompt: string;
  intent: TaskIntent;
  intentReason: string;
  preferredProvider: ProviderChoice;
  selectedProviderId: ProviderId | null;
  status: TaskStatus;
  plan: TaskPlanStep[];
  progress: number;
  output: string;
  errorCode: string;
  errorMessage: string;
  timeoutMs: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export type TaskEventType =
  | 'task.created'
  | 'task.retried'
  | 'task.classified'
  | 'task.plan.created'
  | 'provider.checked'
  | 'provider.selected'
  | 'task.waiting_for_clarification'
  | 'task.waiting_for_provider'
  | 'task.started'
  | 'task.progress'
  | 'task.output.delta'
  | 'task.cancel.requested'
  | 'task.timeout.requested'
  | 'task.completed'
  | 'task.failed'
  | 'task.cancelled'
  | 'task.timed_out'
  | 'task.interrupted';

export interface TaskEvent {
  id: string;
  createdAt: number;
  updatedAt: number;
  taskId: string;
  type: TaskEventType;
  message: string;
  providerId: ProviderId | null;
}

export interface CreateTaskInput {
  projectId: string | null;
  prompt: string;
  preferredProvider: ProviderChoice;
  timeoutMs?: number;
}

export interface TaskExecutionRequest {
  taskId: string;
  projectId: string | null;
  prompt: string;
  intent: TaskIntent;
  plan: TaskPlanStep[];
}

export interface TaskExecutionContext {
  signal: AbortSignal;
  emitProgress: (message: string, progress?: number) => Promise<void>;
  emitOutput: (delta: string) => Promise<void>;
}

export interface TaskExecutionResult {
  output: string;
}

export interface TaskExecutionAdapter {
  executeTask(
    request: TaskExecutionRequest,
    context: TaskExecutionContext,
  ): Promise<TaskExecutionResult>;
}
