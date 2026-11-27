import type { ProviderId } from '../adapters/types';
import type { ProviderChoice } from '../domain/types';

export type TaskIntent = 'chat' | 'coding' | 'research' | 'media' | 'unknown';
export type TaskStatus =
  | 'queued'
  | 'classifying'
  | 'planning'
  | 'needs_clarification'
  | 'waiting_for_provider'
  | 'awaiting_approval'
  | 'awaiting_action_approval'
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

export type TaskApprovalStatus = 'not_required' | 'pending' | 'approved' | 'declined';


export type TaskActionApprovalKind = 'command' | 'file_change' | 'filesystem' | 'network';
export type TaskActionApprovalDecision = 'accept' | 'decline' | 'cancel';
export interface TaskActionApproval {
  id: string;
  expiresAt: number;
  kind: TaskActionApprovalKind;
  reason: string;
  command: string[];
  cwd: string;
  changes: { path: string; kind: string; diff: string }[];
  requestedPermissions?: unknown;
  grantRoot?: string;
  network?: { host: string; protocol: string } | null;
  commandActions?: unknown[];
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
  /** Optional for records created by earlier AURIX versions. */
  approvalStatus?: TaskApprovalStatus;
  approvedAt?: number | null;
  /** A pending, one-time local Codex action approval; never restored after a reload. */
  pendingActionApproval?: TaskActionApproval | null;
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
  | 'task.approval.requested'
  | 'task.approval.granted'
  | 'task.approval.denied'
  | 'task.action_approval.requested'
  | 'task.action_approval.granted'
  | 'task.action_approval.denied'
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
  requestApproval: (request: Omit<TaskActionApproval, 'id' | 'expiresAt'>) => Promise<TaskActionApprovalDecision>;
}

export interface TaskExecutionResult {
  output: string;
}

export interface TaskExecutionAdapter {
  /** Returns a user-facing blocker before the task is offered for approval. */
  checkTaskReadiness?(request: TaskExecutionRequest): Promise<string | null>;
  executeTask(
    request: TaskExecutionRequest,
    context: TaskExecutionContext,
  ): Promise<TaskExecutionResult>;
}
