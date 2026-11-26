import { executeCodexChatTask, getCodexStatus } from '../companion/client';
import type { LocalCompanionConfig } from '../companion/protocol';
import type { Capability, ChatAdapter, CodingAgentAdapter, ChatRequest, ProviderMeta } from './types';
import type { TaskExecutionAdapter, TaskExecutionContext, TaskExecutionRequest } from '../tasks/types';

export const openaiMeta: ProviderMeta = {
  id: 'openai',
  name: 'OpenAI / Codex',
  vendor: 'OpenAI',
  role: 'Optional read-only chat through the official local Codex CLI',
  // Read-only chat is task-only and requires Task Center approval; not exposed in Home chat.
  plannedCapabilities: [],
  authentication: 'Official Codex CLI sign-in with ChatGPT; API-key setup is not required by AURIX.',
  references: [{ label: 'Codex CLI', url: 'https://github.com/openai/codex' }],
  constraints: [
    'The ChatGPT web conversation and its private runtime cannot be embedded in AURIX.',
    'Codex is not offered in Home chat: its text-only chat capability is exposed only through Task Center after explicit approval.',
    'Read-only text chat is available only after the separate AURIX profile is signed in with ChatGPT and the local OS sandbox canary has passed for the same Codex version.',
    'This adapter cannot inspect user projects, write files, run coding tasks, or access a general terminal. The chat workspace is isolated and empty.',
    'AURIX re-runs the local OS sandbox canary before every chat dispatch; task-level approval is still required in Task Center.',
    'AURIX never reads, copies, or exports Codex credentials.',
  ],
};

export class OpenAiAdapter implements ChatAdapter, CodingAgentAdapter, TaskExecutionAdapter {
  readonly meta = openaiMeta;
  private getConfig: () => LocalCompanionConfig = () => ({ url: '', token: '' });

  setCompanionConfigProvider(provider: () => LocalCompanionConfig): void {
    this.getConfig = provider;
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
        detail: 'Version ' + (status.version ?? 'unknown') + '; separate AURIX profile is signed in. ' + (status.sandboxVerified ? 'Read-only chat is available after Task Center approval.' : 'Run the local sandbox check in Settings to enable read-only chat; coding and project access remain disabled.'),
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

  /** Normal Home chat is deliberately unavailable: Codex chat must go through Task Center approval. */
  async getCapabilities(): Promise<Capability[]> {
    return [];
  }

  /** Task Center-only capability, gated by a current local sandbox verification. */
  async getTaskCapabilities(): Promise<Capability[]> {
    const config = this.getConfig();
    if (!config.url || !config.token) return [];
    const status = await getCodexStatus(config);
    if (status.state !== 'ready' || !status.installed || !status.signedIn ||
        status.authMode !== 'chatgpt' || status.profilePrepared !== true ||
        status.sandboxVerified !== true) {
      return [];
    }
    return ['chat'];
  }

  /** Text-only chat in the empty AURIX workspace. Never runs coding or project tasks. */
  async executeTask(
    request: TaskExecutionRequest,
    context: TaskExecutionContext,
  ): Promise<{ output: string }> {
    if (request.intent !== 'chat') {
      throw new Error('AURIX Codex currently supports read-only chat only. Coding and project tasks are not enabled.');
    }
    if (context.signal.aborted) {
      const error = new Error('Codex task was cancelled before it started.');
      error.name = 'AbortError';
      throw error;
    }
    const config = this.getConfig();
    await context.emitProgress('Rechecking the local sandbox before read-only chat', 10);
    const output = await executeCodexChatTask(config, request.taskId, request.prompt, context.signal);
    if (context.signal.aborted) {
      const error = new Error('Codex task was cancelled.');
      error.name = 'AbortError';
      throw error;
    }
    await context.emitProgress('Read-only Codex response received', 95);
    await context.emitOutput(output);
    return { output };
  }

  sendMessage(_request: ChatRequest) {
    return Promise.resolve({
      ok: false as const,
      error: {
        code: 'NOT_IMPLEMENTED' as const,
        message: 'Use Task Center for sandbox-gated read-only Codex chat. Home chat does not dispatch to Codex, and coding or project tasks are not enabled.',
      },
    });
  }

  startSession() {
    return Promise.resolve({
      ok: false as const,
      error: { code: 'NOT_IMPLEMENTED' as const, message: 'Codex coding sessions are not enabled until project-folder approvals are implemented.' },
    });
  }

  cancelSession() {
    return Promise.resolve({
      ok: false as const,
      error: { code: 'NOT_IMPLEMENTED' as const, message: 'No Codex task sessions are currently running through AURIX.' },
    });
  }
}
