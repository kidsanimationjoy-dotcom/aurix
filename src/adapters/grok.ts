import { interfaceOnlyStatus, notImplemented } from './base';
import type { ChatAdapter, CodingAgentAdapter, ProviderMeta } from './types';

export const grokMeta: ProviderMeta = {
  id: 'grok',
  name: 'Grok',
  vendor: 'xAI',
  role: 'Conversational assistant, Grok Build coding workflows',
  plannedCapabilities: ['chat', 'coding_agent', 'subagents', 'skills', 'mcp', 'hooks'],
  authentication: 'To be confirmed against the Grok Build repository before implementation.',
  references: [{ label: 'Grok Build (Apache 2.0)', url: 'https://github.com/xai-org/grok-build' }],
  constraints: ['Respect the Apache 2.0 licence and third-party notices when integrating.'],
};

export class GrokAdapter implements ChatAdapter, CodingAgentAdapter {
  readonly meta = grokMeta;
  async getStatus() { return interfaceOnlyStatus(this.meta); }
  sendMessage() { return notImplemented<never>(this.meta, 'chat'); }
  startSession() { return notImplemented<never>(this.meta, 'coding sessions'); }
  cancelSession() { return notImplemented<never>(this.meta, 'session cancellation'); }
}
