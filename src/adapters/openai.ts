import { interfaceOnlyStatus, notImplemented } from './base';
import type { ChatAdapter, CodingAgentAdapter, ProviderMeta } from './types';

export const openaiMeta: ProviderMeta = {
  id: 'openai',
  name: 'OpenAI / Codex',
  vendor: 'OpenAI',
  role: 'Codex coding agent, project analysis, code review',
  plannedCapabilities: ['chat', 'coding_agent', 'subagents', 'skills', 'mcp'],
  authentication: 'Supported ChatGPT sign-in where the user is eligible; otherwise API credentials.',
  references: [{ label: 'Codex', url: 'https://github.com/openai/codex' }],
  constraints: ['The ChatGPT web conversation and its private runtime cannot be embedded in AURIX.'],
};

export class OpenAiAdapter implements ChatAdapter, CodingAgentAdapter {
  readonly meta = openaiMeta;
  async getStatus() { return interfaceOnlyStatus(this.meta); }
  sendMessage() { return notImplemented<never>(this.meta, 'chat'); }
  startSession() { return notImplemented<never>(this.meta, 'coding sessions'); }
  cancelSession() { return notImplemented<never>(this.meta, 'session cancellation'); }
}
