import { getCodexStatus, sendCodexMessage } from '../companion/client';
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
    'AURIX supports read-only chat through the locally signed-in Codex CLI after a fresh companion sandbox verification.',
    'Chat runs with the explicit read-only sandbox, ephemeral session storage, bounded messages and output, and no project-folder access. Coding task execution remains disabled until its separate scoped-write approval path is implemented.',
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
        detail: 'Version ' + (status.version ?? 'unknown') + '; signed in with the separate AURIX profile. ' + (status.sandboxVerified ? 'The local OS sandbox was verified in this companion session; read-only chat is available.' : 'Run Prepare AURIX profile & verify sandbox in Settings to enable read-only chat.') + ' Coding task execution remains disabled.',
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

  /** Chat is advertised only after local sign-in and sandbox verification. */
  async getCapabilities(): Promise<Capability[]> {
    try {
      const config = this.getConfig();
      if (!config.url || !config.token) return [];
      const status = await getCodexStatus(config);
      return status.state === 'ready' && status.sandboxVerified === true ? ['chat'] : [];
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
