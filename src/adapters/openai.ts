import { getCodexStatus } from '../companion/client';
import type { LocalCompanionConfig } from '../companion/protocol';
import type { Capability, ChatAdapter, CodingAgentAdapter, ChatRequest, ProviderMeta } from './types';

export const openaiMeta: ProviderMeta = {
  id: 'openai',
  name: 'OpenAI / Codex',
  vendor: 'OpenAI',
  role: 'Codex local agent and ChatGPT-plan-backed coding workflows',
  plannedCapabilities: ['chat', 'coding_agent', 'subagents', 'skills', 'mcp'],
  authentication: 'Official Codex CLI sign-in with ChatGPT; API-key setup is not required by AURIX.',
  references: [{ label: 'Codex CLI', url: 'https://github.com/openai/codex' }],
  constraints: [
    'The ChatGPT web conversation and its private runtime cannot be embedded in AURIX.',
    'Only local CLI installation and sign-in status are integrated at this stage.',
    'Task execution remains disabled until a strictly scoped filesystem permission profile can be enforced and verified.',
    'AURIX never reads, copies, or exports Codex credentials.',
  ],
};

export class OpenAiAdapter implements ChatAdapter, CodingAgentAdapter {
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
        detail: 'Version ' + (status.version ?? 'unknown') + '; AURIX has verified sign-in status only. Task execution remains disabled pending scoped sandbox verification.',
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

  /** No task capability is advertised until a safe, tested execution profile is available. */
  async getCapabilities(): Promise<Capability[]> {
    return [];
  }

  sendMessage(_request: ChatRequest) {
    return Promise.resolve({
      ok: false as const,
      error: {
        code: 'NOT_IMPLEMENTED' as const,
        message: 'Codex sign-in is verified, but AURIX chat execution is not enabled until the filesystem permission profile is independently verified.',
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
