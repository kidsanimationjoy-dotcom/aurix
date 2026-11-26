import { interfaceOnlyStatus, notImplemented } from './base';
import type { InvestigationAdapter, ProviderMeta } from './types';

export const reaMeta: ProviderMeta = {
  id: 'rea',
  name: 'REA',
  vendor: 'morluto',
  role: 'Authorised software investigation with evidence-based reports',
  plannedCapabilities: ['investigation', 'mcp'],
  authentication: 'Runs locally via its CLI/MCP; requires the local companion.',
  references: [{ label: 'REA engine', url: 'https://github.com/morluto/rea' }],
  constraints: [
    'Only for software the user is authorised to examine.',
    'Every finding needs evidence; unknowns must be reported. Never claim hidden source or model internals were found without evidence.',
  ],
};

export class ReaAdapter implements InvestigationAdapter {
  readonly meta = reaMeta;
  async getStatus() { return interfaceOnlyStatus(this.meta); }
  createInvestigation() { return notImplemented<never>(this.meta, 'investigations'); }
  getReport() { return notImplemented<never>(this.meta, 'reports'); }
}
