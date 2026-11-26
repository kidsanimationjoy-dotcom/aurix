import { useEffect, useState } from 'react';
import { useApp, useCollection } from '../state/AppState';
import { Notice, PageHeader, Panel, StatusPill, fmtBytes } from '../ui/kit';

export function Usage() {
  const { adapters, statuses } = useApp();
  const projects = useCollection('projects');
  const conversations = useCollection('conversations');
  const messages = useCollection('messages');
  const files = useCollection('files');
  const assets = useCollection('assets');
  const audit = useCollection('audit');
  const [est, setEst] = useState<{ usage?: number; quota?: number } | null>(null);
  useEffect(() => { void navigator.storage?.estimate?.().then(setEst).catch(() => setEst(null)); }, [assets.length, files.length, messages.length]);

  const stats: [string, string][] = [
    ['Projects', String(projects.length)], ['Conversations', String(conversations.length)], ['Messages', String(messages.length)],
    ['Browser files', String(files.length)], ['Assets', `${assets.length} (${fmtBytes(assets.reduce((n, a) => n + a.size, 0))})`], ['Audit events', String(audit.length)],
  ];
  return (
    <>
      <PageHeader title="Usage" subtitle="What AURIX stores on this device, and what providers report." />
      <Panel title="Local storage">
        <div className="grid g3">{stats.map(([k, v]) => <div className="stat" key={k}><b>{v}</b><small>{k}</small></div>)}</div>
        <small>{est?.usage != null ? `Browser reports ${fmtBytes(est.usage)} used${est.quota ? ` of about ${fmtBytes(est.quota)}` : ''} for this site.` : 'Browser storage estimate unavailable.'}</small>
      </Panel>
      <Panel title="Provider usage and credits">
        <Notice>No provider is connected, so there are no tokens, credits or costs to report. AURIX shows these figures only when a provider supplies them.</Notice>
        <table><thead><tr><th>Provider</th><th>Status</th><th>Usage and credits</th></tr></thead><tbody>
          {adapters.map((a) => <tr key={a.meta.id}><td>{a.meta.name}</td><td>{statuses[a.meta.id] && <StatusPill state={statuses[a.meta.id]!.state} />}</td><td className="muted">Unavailable until connected</td></tr>)}
        </tbody></table>
      </Panel>
    </>
  );
}
