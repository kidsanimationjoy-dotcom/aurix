import type { InvestigationAdapter, InvestigationAuthorization, InvestigationReport, ProviderMeta } from './types';
import type { LocalCompanionConfig } from '../companion/protocol';
import { analyzeReaTarget, getReaStatus } from '../companion/client';

export const reaMeta: ProviderMeta = {
  id: 'rea',
  name: 'REA',
  vendor: 'morluto',
  role: 'Local, evidence-based inspection of authorised applications',
  plannedCapabilities: ['investigation', 'mcp'],
  authentication: 'Runs the official REA CLI locally through the paired AURIX companion; no API key.',
  references: [{ label: 'REA engine', url: 'https://github.com/morluto/rea' }],
  constraints: [
    'Only inspects directories explicitly allowlisted by the user on their own computer.',
    'This first implementation supports REA JavaScript/Electron application analysis.',
    'Every report is returned by the local REA engine; unknowns and missing evidence must remain visible.',
  ],
};

export class ReaAdapter implements InvestigationAdapter {
  readonly meta = reaMeta;
  private getConfig: () => LocalCompanionConfig = () => ({ url: '', token: '' });
  private reports = new Map<string, InvestigationReport>();

  setCompanionConfigProvider(provider: () => LocalCompanionConfig): void {
    this.getConfig = provider;
  }

  async getStatus() {
    const config = this.getConfig();
    if (!config.url || !config.token) {
      return {
        state: 'not_configured' as const,
        implementation: 'implemented_untested' as const,
        summary: 'REA companion not paired',
        detail: 'Pair the local companion and install the official REA CLI to inspect approved application folders.',
        checkedAt: Date.now(),
      };
    }
    try {
      const status = await getReaStatus(config);
      const ready = status.available && status.approvedRootCount > 0;
      return {
        state: ready ? 'connected' as const : 'not_configured' as const,
        implementation: 'implemented_untested' as const,
        summary: ready ? 'Local REA engine available' : status.available ? 'No approved REA folders' : 'REA CLI unavailable',
        detail: status.message ?? (ready
          ? status.version + ' · ' + status.approvedRootCount + ' approved folder(s)'
          : 'Install REA locally and configure AURIX_REA_ROOTS with folders you explicitly approve.'),
        checkedAt: Date.now(),
      };
    } catch (error) {
      return {
        state: 'error' as const,
        implementation: 'implemented_untested' as const,
        summary: 'REA status check failed',
        detail: error instanceof Error ? error.message : 'Could not check REA.',
        checkedAt: Date.now(),
      };
    }
  }

  async createInvestigation(target: string, auth: InvestigationAuthorization) {
    if (!auth || !auth.statement?.trim() || !Number.isFinite(auth.confirmedAt) || auth.confirmedAt <= 0) {
      return { ok: false as const, error: { code: 'AUTHORIZATION_REQUIRED' as const, message: 'Confirm that you are authorised to inspect this local application.' } };
    }
    try {
      const value = await analyzeReaTarget(this.getConfig(), target);
      const envelope = value as { report?: unknown };
      const reportValue = envelope.report as { normalized_result?: unknown } | undefined;
      const analysis = (reportValue?.normalized_result ?? reportValue) as {
        graph?: { nodes?: unknown[]; edges?: unknown[]; coverage?: { status?: string } };
        limitations?: unknown[];
      } | undefined;
      const graph = analysis?.graph;
      if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) {
        return { ok: false as const, error: { code: 'PROVIDER_ERROR' as const, message: 'REA returned no validated JavaScript application graph. Check the installed REA CLI version and its JSON output.' } };
      }
      const graphNodes = graph.nodes.slice(0, 200).flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const node = entry as { node_id?: unknown; kind?: unknown; observations?: unknown[] };
        if (typeof node.node_id !== 'string' || typeof node.kind !== 'string') return [];
        const observation = node.observations?.[0] as { evidence?: { location?: { available?: boolean; value?: { path?: string } } } } | undefined;
        const path = observation?.evidence?.location?.available && typeof observation.evidence.location.value?.path === 'string'
          ? observation.evidence.location.value.path : undefined;
        return [{ id: node.node_id, kind: node.kind, ...(path ? { path } : {}) }];
      });
      const unknowns = [
        ...(Array.isArray(analysis.limitations) ? analysis.limitations.filter((item): item is string => typeof item === 'string') : []),
        ...(graph.coverage?.status && graph.coverage.status !== 'complete' ? ['REA graph coverage is ' + graph.coverage.status + '; missing facts must not be treated as absent.'] : []),
      ];
      const normalized: InvestigationReport = {
        findings: [],
        unknowns: unknowns.length ? unknowns : ['Static application structure was recovered. Runtime behavior was not established by this static analysis.'],
        graphSummary: { nodes: graph.nodes.length, edges: graph.edges.length, coverage: graph.coverage?.status ?? 'not reported' },
        graphNodes,
      };
      const id = globalThis.crypto.randomUUID();
      this.reports.set(id, normalized);
      return { ok: true as const, value: { id } };
    } catch (error) {
      return { ok: false as const, error: { code: 'PROVIDER_ERROR' as const, message: error instanceof Error ? error.message : 'REA investigation failed.' } };
    }
  }

  async getReport(id: string) {
    const report = this.reports.get(id);
    return report
      ? { ok: true as const, value: report }
      : { ok: false as const, error: { code: 'UNSUPPORTED' as const, message: 'This REA report is not available in the current AURIX session.' } };
  }
}
