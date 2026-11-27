import {
  getCodexStatus,
  sendCodexMessage,
  startCodexAgent,
  getCodexAgentStatus,
  respondCodexAgentApproval,
  interruptCodexAgent,
  closeCodexAgent,
} from '../companion/client';
import type { CodexAgentEvent, LocalCompanionConfig } from '../companion/protocol';
import type { Capability, ChatAdapter, CodingAgentAdapter, ChatRequest, ProviderMeta } from './types';
import type { TaskActionApproval, TaskActionApprovalDecision, TaskExecutionAdapter, TaskExecutionContext, TaskExecutionRequest, TaskExecutionResult } from '../tasks/types';

const MAX_TASK_OUTPUT = 200_000;
const POLL_INTERVAL_MS = 900;

function delay(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function textValue(value: unknown, max = 12_000): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function actionApprovalFromEvent(event: CodexAgentEvent): Omit<TaskActionApproval, 'id'> {
  const kindValue = event.kind;
  const kind = kindValue === 'network' || kindValue === 'file_change' || kindValue === 'filesystem'
    ? kindValue
    : 'command';
  const changes = Array.isArray(event.changes)
    ? event.changes.slice(0, 30).flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const change = entry as Record<string, unknown>;
      return [{
        path: textValue(change.path, 500),
        kind: textValue(change.kind, 80),
        diff: textValue(change.diff, 6000),
      }];
    })
    : [];
  return {
    kind,
    reason: textValue(event.reason, 1000),
    command: Array.isArray(event.command) ? event.command.slice(0, 40).map((part) => String(part).slice(0, 500)) : [],
    cwd: textValue(event.cwd, 2048),
    changes,
    requestedPermissions: event.requestedPermissions,
    grantRoot: textValue(event.grantRoot, 2048),
    network: event.network && typeof event.network === 'object'
      ? { host: textValue((event.network as Record<string, unknown>).host, 255), protocol: textValue((event.network as Record<string, unknown>).protocol, 40) }
      : null,
    commandActions: Array.isArray(event.commandActions) ? event.commandActions.slice(0, 20) : [],
  };
}

function approvalMayBeGranted(event: CodexAgentEvent): boolean {
  if (event.kind === 'network') return false;
  if (typeof event.grantRoot === 'string' && event.grantRoot.length > 0) return false;
  if (event.kind === 'file_change' && (!Array.isArray(event.changes) || event.changes.length === 0)) return false;
  return true;
}

export const openaiMeta: ProviderMeta = {
  id: 'openai',
  name: 'OpenAI / Codex',
  vendor: 'OpenAI',
  role: 'Codex local chat and project-scoped coding agent',
  plannedCapabilities: ['chat', 'coding_agent', 'subagents', 'skills', 'mcp'],
  authentication: 'Official Codex CLI sign-in with ChatGPT; AURIX does not require an API key.',
  references: [{ label: 'Codex CLI and App Server', url: 'https://github.com/openai/codex' }],
  constraints: [
    'The ChatGPT web conversation and its private runtime cannot be embedded in AURIX.',
    'AURIX provides local Codex-backed read-only chat after a fresh sandbox verification.',
    'Task Center coding tasks run only in a project folder explicitly included in AURIX_CODEX_ROOTS.',
    'Codex command and file-write requests are shown as one-time Task Center approvals; network access and session-wide root grants are refused.',
    'AURIX never reads, copies, or exports Codex credentials.',
  ],
};

export class OpenAiAdapter implements ChatAdapter, CodingAgentAdapter, TaskExecutionAdapter {
  readonly meta = openaiMeta;
  private getConfig: () => LocalCompanionConfig = () => ({ url: '', token: '' });
  private getProjectPath: (projectId: string) => string | null = () => null;
  private readonly sessions = new Map<string, string>();

  setCompanionConfigProvider(provider: () => LocalCompanionConfig): void {
    this.getConfig = provider;
  }

  setProjectPathProvider(provider: (projectId: string) => string | null): void {
    this.getProjectPath = provider;
  }

  async getStatus() {
    const config = this.getConfig();
    if (!config.url || !config.token) {
      return {
        state: 'not_configured' as const,
        implementation: 'implemented_untested' as const,
        summary: 'Codex companion not paired',
        detail: 'Pair AURIX with the local companion in Settings to check the official Codex CLI.',
        checkedAt: Date.now(),
      };
    }
    const status = await getCodexStatus(config);
    if (status.state === 'missing') {
      return {
        state: 'not_configured' as const,
        implementation: 'implemented_untested' as const,
        summary: 'Codex CLI not found',
        detail: status.message,
        checkedAt: Date.now(),
      };
    }
    if (status.state === 'needs_login') {
      return {
        state: 'awaiting_authentication' as const,
        implementation: 'implemented_untested' as const,
        summary: 'Codex CLI needs sign-in',
        detail: status.message,
        checkedAt: Date.now(),
      };
    }
    if (status.state === 'ready') {
      return {
        state: 'connected' as const,
        implementation: 'implemented_untested' as const,
        summary: 'Codex CLI signed in',
        detail: 'Version ' + (status.version ?? 'unknown') + '; signed in with the separate AURIX profile. ' +
          (status.sandboxVerified
            ? 'Local sandbox verified. Read-only chat is available; project coding needs ' + String(status.codexApprovedRootCount ?? 0) + ' approved root(s).'
            : 'Run Prepare AURIX profile & verify sandbox in Settings to enable chat and coding.'),
        checkedAt: Date.now(),
      };
    }
    return {
      state: 'error' as const,
      implementation: 'implemented_untested' as const,
      summary: 'Codex status check failed',
      detail: status.message,
      checkedAt: Date.now(),
    };
  }

  /** Advertise only capabilities that are backed by the local CLI and verified sandbox. */
  async getCapabilities(): Promise<Capability[]> {
    try {
      const config = this.getConfig();
      if (!config.url || !config.token) return [];
      const status = await getCodexStatus(config);
      if (status.state !== 'ready' || status.sandboxVerified !== true) return [];
      return [
        'chat',
        ...(Number(status.codexApprovedRootCount ?? 0) > 0 ? ['coding_agent' as const] : []),
      ];
    } catch {
      return [];
    }
  }

  async sendMessage(request: ChatRequest) {
    try {
      const config = this.getConfig();
      if (!config.url || !config.token) {
        return { ok: false as const, error: { code: 'NOT_CONNECTED' as const, message: 'Pair the AURIX local companion first.' } };
      }
      const status = await getCodexStatus(config);
      if (status.state !== 'ready') {
        return { ok: false as const, error: { code: 'NOT_CONNECTED' as const, message: status.message } };
      }
      if (status.sandboxVerified !== true) {
        return { ok: false as const, error: { code: 'NOT_CONNECTED' as const, message: 'Run the local Codex sandbox verification in Settings before using chat.' } };
      }
      const reply = await sendCodexMessage(config, request.messages);
      return { ok: true as const, value: reply };
    } catch (error) {
      return { ok: false as const, error: { code: 'PROVIDER_ERROR' as const, message: error instanceof Error ? error.message : 'Codex chat failed.' } };
    }
  }

  async checkTaskReadiness(request: TaskExecutionRequest): Promise<string | null> {
    const config = this.getConfig();
    if (!config.url || !config.token) return 'Pair the local AURIX companion in Settings before using Codex.';
    const status = await getCodexStatus(config);
    if (status.state !== 'ready' || status.sandboxVerified !== true) {
      return 'Prepare and verify the AURIX Codex profile, then sign in to the separate local Codex profile.';
    }
    if (request.intent === 'chat') return null;
    if (request.intent !== 'coding') return 'The local Codex Task Center executor currently supports chat and coding tasks only.';
    if (!request.projectId) return 'Select a project before creating a coding task.';
    const projectPath = this.getProjectPath(request.projectId);
    if (!projectPath) return 'Link this project to its real local folder in Projects before starting a Codex coding task.';
    if (Number(status.codexApprovedRootCount ?? 0) < 1) {
      return 'No approved project roots are configured. Set AURIX_CODEX_ROOTS, restart the local companion, and prepare the AURIX profile again.';
    }
    return null;
  }

  async executeTask(request: TaskExecutionRequest, context: TaskExecutionContext): Promise<TaskExecutionResult> {
    const config = this.getConfig();
    const blocker = await this.checkTaskReadiness(request);
    if (blocker) throw new Error(blocker);

    if (request.intent === 'chat') {
      const reply = await sendCodexMessage(config, [{ role: 'user', content: request.prompt }]);
      await context.emitOutput(reply.content);
      await context.emitProgress('Read-only Codex response completed.', 95);
      return { output: reply.content };
    }

    const projectPath = this.getProjectPath(request.projectId!);
    if (!projectPath) throw new Error('This project no longer has a linked local folder.');
    const instruction = [
      'You are executing an AURIX Task Center coding task in the selected project folder.',
      'Work only inside the selected project. Start with inspection and a short plan.',
      'Do not use network access. Do not read credentials, tokens, secrets, browser profiles, or files outside the selected project.',
      'Ask AURIX before any command execution, file modification, or extra filesystem permission. AURIX will show the exact requested action to the user.',
      'Do not claim that a change or test was completed unless the local App Server reports the relevant result.',
      '',
      'User task:',
      request.prompt,
    ].join('\n');

    const session = await startCodexAgent(config, projectPath, instruction);
    this.sessions.set(request.taskId, session.id);
    let cursor = 0;
    let collectedOutput = '';
    let sawAssistantDelta = false;

    const appendOutput = async (value: string) => {
      if (!value || context.signal.aborted) return;
      const remaining = MAX_TASK_OUTPUT - collectedOutput.length;
      if (remaining <= 0) return;
      const safeText = value.slice(0, remaining);
      collectedOutput += safeText;
      await context.emitOutput(safeText);
    };

    const consumeEvents = async (events: CodexAgentEvent[]) => {
      for (const event of events) {
        if (context.signal.aborted) return;
        if (event.type === 'agent.output.delta') {
          const delta = textValue(event.text);
          if (delta) {
            sawAssistantDelta = true;
            await appendOutput(delta);
          }
        } else if (event.type === 'agent.command.output') {
          const output = textValue(event.text);
          if (output) await appendOutput(output);
        } else if (event.type === 'agent.plan.updated') {
          const plan = Array.isArray(event.plan) ? event.plan as Array<Record<string, unknown>> : [];
          const completed = plan.filter((step) => step.status === 'completed').length;
          const progress = plan.length ? Math.min(90, Math.floor((completed / plan.length) * 90)) : undefined;
          await context.emitProgress(
            plan.map((step) => textValue(step.step, 120)).filter(Boolean).join(' · ') || 'Codex is working through the task plan.',
            progress,
          );
        } else if (event.type === 'agent.approval.required') {
          const approvalId = textValue(event.id, 160);
          if (!approvalId) throw new Error('Codex sent a permission request without an approval identifier.');
          const requestApproval = actionApprovalFromEvent(event);
          const decision: TaskActionApprovalDecision = await context.requestApproval(requestApproval);
          if (decision === 'cancel' || context.signal.aborted) {
            await interruptCodexAgent(config, session.id).catch(() => undefined);
            return;
          }
          if (decision === 'accept' && !approvalMayBeGranted(event)) {
            await respondCodexAgentApproval(config, session.id, approvalId, 'decline');
            continue;
          }
          await respondCodexAgentApproval(config, session.id, approvalId, decision);
        } else if (event.type === 'agent.approval.error' || event.type === 'agent.failed') {
          throw new Error(textValue(event.message, 800) || 'The local Codex coding agent failed.');
        } else if (event.type === 'agent.item.completed' && !sawAssistantDelta) {
          const text = textValue(event.text);
          if (text) await appendOutput(text);
        }
      }
    };

    try {
      await consumeEvents(session.events);
      cursor = session.nextCursor;
      let snapshot = session;
      while (!['completed', 'failed', 'interrupted', 'stopped'].includes(snapshot.status)) {
        if (context.signal.aborted) {
          await interruptCodexAgent(config, session.id).catch(() => undefined);
          break;
        }
        await delay(POLL_INTERVAL_MS, context.signal);
        if (context.signal.aborted) {
          await interruptCodexAgent(config, session.id).catch(() => undefined);
          break;
        }
        snapshot = await getCodexAgentStatus(config, session.id, cursor);
        cursor = snapshot.nextCursor;
        await consumeEvents(snapshot.events);
      }

      if (context.signal.aborted) return { output: collectedOutput };
      if (snapshot.status !== 'completed') {
        throw new Error(snapshot.error || 'The local Codex coding session ended before the task completed.');
      }
      return { output: collectedOutput || 'Codex completed the task without returning a text summary.' };
    } finally {
      this.sessions.delete(request.taskId);
      await closeCodexAgent(config, session.id).catch(() => undefined);
    }
  }

  async startSession() {
    return {
      ok: false as const,
      error: { code: 'NOT_IMPLEMENTED' as const, message: 'Use Task Center to launch a project-scoped Codex coding task, or Coding Studio for a standalone session.' },
    };
  }

  async cancelSession(sessionId: string) {
    const taskId = [...this.sessions.entries()].find(([, activeSessionId]) => activeSessionId === sessionId)?.[0];
    if (!taskId) {
      return { ok: false as const, error: { code: 'NOT_CONNECTED' as const, message: 'No active AURIX Codex session matches that identifier.' } };
    }
    try {
      const config = this.getConfig();
      await interruptCodexAgent(config, sessionId);
      return { ok: true as const, value: undefined };
    } catch (error) {
      return { ok: false as const, error: { code: 'PROVIDER_ERROR' as const, message: error instanceof Error ? error.message : 'Could not stop the Codex session.' } };
    }
  }
}
