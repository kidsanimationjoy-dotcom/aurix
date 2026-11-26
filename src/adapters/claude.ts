import { interfaceOnlyStatus, notImplemented } from './base';
import type { ChatAdapter, CodingAgentAdapter, ProviderMeta } from './types';

export const claudeMeta: ProviderMeta = {
  id: 'claude',
  name: 'Claude',
  vendor: 'Anthropic',
  role: 'Coding agent, orchestration, code review',
  plannedCapabilities: ['chat', 'coding_agent', 'subagents', 'skills', 'mcp', 'hooks'],
  authentication: 'Official Anthropic authentication only. Credentials stay server-side or in the local companion.',
  references: [],
  constraints: [
    'AURIX never extracts private Claude app credentials or bypasses subscription limits.',
    'File and terminal work needs the local companion (not built yet).',
  ],
};

export class ClaudeAdapter implements ChatAdapter, CodingAgentAdapter {
  readonly meta = claudeMeta;
  async getStatus() { return interfaceOnlyStatus(this.meta); }
  sendMessage() { return notImplemented<never>(this.meta, 'chat'); }
  startSession() { return notImplemented<never>(this.meta, 'coding sessions'); }
  cancelSession() { return notImplemented<never>(this.meta, 'session cancellation'); }
}
