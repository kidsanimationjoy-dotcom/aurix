import { useState } from 'react';
import { ReaAdapter } from '../adapters/rea';
import type { ClaimStatus } from '../domain/types';
import { researchToMarkdown } from '../lib/researchExport';
import { useActiveProject, useApp, useAudit, useCollection, useSettings } from '../state/AppState';
import { ConfirmButton, EmptyState, Field, Notice, PageHeader, Panel, download } from '../ui/kit';

type LocalBrowserTarget = {
  target_id: string;
  type: string;
  title: string;
  url: string;
  origin: string;
  attached: boolean | null;
};

function readBrowserTargets(value: unknown): LocalBrowserTarget[] {
  if (!value || typeof value !== 'object') return [];
  const report = (value as { report?: { normalized_result?: { targets?: unknown[] } } }).report;
  const targets = report?.normalized_result?.targets;
  if (!Array.isArray(targets)) return [];
  return targets.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const item = entry as Record<string, unknown>;
    if (typeof item.target_id !== 'string' || typeof item.url !== 'string') return [];
    return [{
      target_id: item.target_id,
      type: typeof item.type === 'string' ? item.type : 'page',
      title: typeof item.title === 'string' ? item.title : item.url,
      url: item.url,
      origin: typeof item.origin === 'string' ? item.origin : '',
      attached: typeof item.attached === 'boolean' ? item.attached : null,
    }];
  });
}

const EMPTY = { title: '', claim: '', status: 'unverified' as ClaimStatus, sourceTitle: '', sourceUrl: '', notes: '' };

function validUrl(u: string): boolean {
  try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:'; } catch { return false; }
}

export function Research() {
  const { db, adapters } = useApp();
  const rea = adapters.find((adapter) => adapter.meta.id === 'rea') as ReaAdapter | undefined;
  const audit = useAudit();
  const project = useActiveProject();
  const settings = useSettings();
  const scope = settings.activeProjectId ?? null;
  const items = useCollection('research').filter((r) => r.projectId === scope);
  const [form, setForm] = useState(EMPTY);
  const [filter, setFilter] = useState<ClaimStatus | 'all'>('all');
  const [reaTarget, setReaTarget] = useState('');
  const [reaKind, setReaKind] = useState<'javascript' | 'desktop' | 'android'>('javascript');
  const [reaAuthorized, setReaAuthorized] = useState(false);
  const [reaBusy, setReaBusy] = useState(false);
  const [reaError, setReaError] = useState('');
  const [browserEndpoint, setBrowserEndpoint] = useState('http://127.0.0.1:9222');
  const [browserTargets, setBrowserTargets] = useState<LocalBrowserTarget[]>([]);
  const [browserTargetId, setBrowserTargetId] = useState('');
  const [browserKind, setBrowserKind] = useState<'page' | 'bundle'>('page');
  const [browserAuthorized, setBrowserAuthorized] = useState(false);
  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserError, setBrowserError] = useState('');
  const [browserResult, setBrowserResult] = useState<unknown | null>(null);
  const [reaReport, setReaReport] = useState<{ findings: { claim: string; evidence: { id: string; description: string }[] }[]; unknowns: string[]; graphSummary?: { nodes: number; edges: number; coverage: string }; graphNodes?: { id: string; kind: string; path?: string }[]; desktopSummary?: unknown; artifactSummary?: unknown } | null>(null);

  const needsSource = form.status === 'verified' && !validUrl(form.sourceUrl);
  const urlBad = form.sourceUrl !== '' && !validUrl(form.sourceUrl);
  const canSave = form.title.trim() && form.claim.trim() && !needsSource && !urlBad;
  const shown = items.filter((i) => filter === 'all' || i.status === filter);

  return (
    <>
      <PageHeader
        title="Research"
        subtitle={project ? `Research board for ${project.name}` : 'Research board (no project selected)'}
        actions={<button className="btn" disabled={!items.length} onClick={() => { download('research.md', 'text/markdown', researchToMarkdown(project ? `${project.name}: research` : 'Research', [...items])); void audit({ action: 'research.export', detail: `${items.length} items` }); }}>Export Markdown</button>}
      />
      <Notice>Web search is not connected, so sources are added by hand. A claim can only be marked <b>verified</b> when it has a valid source link; everything else stays unverified or an assumption in exports.</Notice>
      <Panel title="Inspect an application with REA">
        <p className="muted">Run the real REA engine on a JavaScript/Electron application folder or .asar archive inside an approved AURIX companion folder. Desktop installation discovery accepts folders only; Android inspection accepts APK files. No API key is used.</p>
        <Field label="Analysis workflow">
          <select value={reaKind} onChange={(e) => setReaKind(e.target.value as 'javascript' | 'desktop' | 'android')}>
            <option value="javascript">JavaScript / Electron application graph</option>
            <option value="desktop">Desktop installation discovery</option>
            <option value="android">Android APK static inspection</option>
          </select>
        </Field>
        <Field label="Application folder, .asar archive or APK file path" hint="The target must be inside a folder configured in AURIX_REA_ROOTS on the computer running the companion. Desktop installation discovery requires a folder; JavaScript analysis also accepts .asar archives.">
          <input value={reaTarget} onChange={(e) => setReaTarget(e.target.value)} placeholder="D:\\AppsToInspect\\ExampleApp" />
        </Field>
        <label className="check"><input type="checkbox" checked={reaAuthorized} onChange={(e) => setReaAuthorized(e.target.checked)} /> I own this application or have permission to inspect it.</label>
        {reaError ? <Notice>{reaError}</Notice> : null}
        <div><button className="btn primary" disabled={!rea || !reaTarget.trim() || !reaAuthorized || reaBusy} onClick={async () => {
          if (!rea) return;
          setReaBusy(true); setReaError(''); setReaReport(null);
          try {
            const created = await rea.createInvestigation(reaTarget.trim(), {
              statement: 'I own this application or have permission to inspect it.',
              confirmedAt: Date.now(),
            }, reaKind);
            if (!created.ok) throw new Error(created.error.message);
            const report = await rea.getReport(created.value.id);
            if (!report.ok) throw new Error(report.error.message);
            setReaReport(report.value);
            await audit({ action: 'rea.investigation.completed', detail: reaTarget.trim() });
          } catch (error) {
            setReaError(error instanceof Error ? error.message : 'REA investigation failed.');
          } finally { setReaBusy(false); }
        }}>{reaBusy ? 'Inspecting application…' : 'Run REA investigation'}</button></div>
        {reaReport ? <div className="stack">
          {reaReport.desktopSummary !== undefined || reaReport.artifactSummary !== undefined ? <><h3>{reaReport.desktopSummary !== undefined ? 'Desktop installation inspection' : 'Android APK static inspection'}</h3><pre className="code-block">{JSON.stringify(reaReport.desktopSummary ?? reaReport.artifactSummary, null, 2)}</pre></> : null}
          {reaReport.desktopSummary === undefined && reaReport.artifactSummary === undefined ? <><h3>Recovered application graph</h3>
          {reaReport.graphSummary ? <p>{reaReport.graphSummary.nodes} nodes · {reaReport.graphSummary.edges} relationships · coverage: <b>{reaReport.graphSummary.coverage}</b></p> : null}
          {reaReport.graphNodes?.length ? <ul>{reaReport.graphNodes.map((node) => <li key={node.id}><b>{node.kind}</b>{node.path ? ' — ' + node.path : ''} <code>{node.id}</code></li>)}</ul> : <p>No graph nodes were returned.</p>}
          {reaReport.graphNodes && reaReport.graphNodes.length === 200 ? <p className="muted">Showing the first 200 nodes. The full graph remains in the REA result.</p> : null}
          <h3>Unknowns and limitations ({reaReport.unknowns.length})</h3>
          {reaReport.unknowns.length ? <ul>{reaReport.unknowns.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No unknowns were reported by REA.</p>}
          </> : null}
        </div> : null}
      </Panel>

      <Panel title="Inspect a local browser tab with REA">
        <p className="muted">Passively inspect an existing Chrome-family browser tab through its local DevTools endpoint. This does not navigate, click, execute page scripts or change the page. The endpoint must be bound to localhost; remote browser hosts are refused.</p>
        <Field label="Local Chrome DevTools endpoint" hint="Example: http://127.0.0.1:9222. The local browser must already expose a DevTools endpoint on this computer.">
          <input value={browserEndpoint} onChange={(e) => setBrowserEndpoint(e.target.value)} placeholder="http://127.0.0.1:9222" />
        </Field>
        <label className="check"><input type="checkbox" checked={browserAuthorized} onChange={(e) => setBrowserAuthorized(e.target.checked)} /> I own this browser session or have permission to inspect it.</label>
        {browserError ? <Notice>{browserError}</Notice> : null}
        <div className="row">
          <button className="btn" disabled={!rea || !browserEndpoint.trim() || !browserAuthorized || browserBusy} onClick={async () => {
            if (!rea) return;
            setBrowserBusy(true); setBrowserError(''); setBrowserResult(null); setBrowserTargets([]); setBrowserTargetId('');
            try {
              const discovered = await rea.listBrowserTargets(browserEndpoint.trim(), {
                statement: 'I own or have permission to inspect this local browser session.',
                confirmedAt: Date.now(),
              });
              if (!discovered.ok) throw new Error(discovered.error.message);
              const targets = readBrowserTargets(discovered.value);
              setBrowserTargets(targets);
              setBrowserTargetId(targets[0]?.target_id ?? '');
              if (!targets.length) setBrowserError('REA found no eligible page tabs. Confirm the local DevTools endpoint and open an eligible page.');
              await audit({ action: 'rea.browser.targets', detail: targets.length + ' local browser target(s)' });
            } catch (error) {
              setBrowserError(error instanceof Error ? error.message : 'Could not list local browser tabs.');
            } finally { setBrowserBusy(false); }
          }}>{browserBusy ? 'Listing tabs…' : 'List local browser tabs'}</button>
        </div>
        {browserTargets.length > 0 ? <>
          <Field label="Browser tab">
            <select value={browserTargetId} onChange={(e) => { setBrowserTargetId(e.target.value); setBrowserResult(null); }}>
              {browserTargets.map((target) => <option key={target.target_id} value={target.target_id}>{target.title} — {target.url}</option>)}
            </select>
          </Field>
          <Field label="Inspection type">
            <select value={browserKind} onChange={(e) => setBrowserKind(e.target.value as 'page' | 'bundle')}>
              <option value="page">Page structure and accessibility inspection</option>
              <option value="bundle">Static JavaScript bundle, route and endpoint analysis</option>
            </select>
          </Field>
          <div className="row">
            <button className="btn primary" disabled={!browserAuthorized || !browserTargetId || browserBusy} onClick={async () => {
              if (!rea) return;
              setBrowserBusy(true); setBrowserError(''); setBrowserResult(null);
              try {
                const inspected = await rea.inspectBrowserTarget(browserEndpoint.trim(), browserTargetId, browserKind, {
                  statement: 'I own or have permission to inspect this local browser session.',
                  confirmedAt: Date.now(),
                });
                if (!inspected.ok) throw new Error(inspected.error.message);
                setBrowserResult(inspected.value);
                await audit({ action: browserKind === 'bundle' ? 'rea.browser.bundle' : 'rea.browser.page', target: browserTargetId, detail: browserEndpoint.trim() });
              } catch (error) {
                setBrowserError(error instanceof Error ? error.message : 'REA could not inspect this browser tab.');
              } finally { setBrowserBusy(false); }
            }}>{browserBusy ? 'Inspecting tab…' : browserKind === 'bundle' ? 'Analyze selected tab bundle' : 'Inspect selected tab'}</button>
          </div>
        </> : null}
        {browserResult !== null ? <div className="stack">
          <h3>{browserKind === 'bundle' ? 'Static browser bundle analysis' : 'Passive page inspection'}</h3>
          <p className="muted">REA evidence is an observation of the selected tab and capture window. Missing or partial evidence does not prove a feature is absent.</p>
          <pre className="code-block">{JSON.stringify((browserResult as { report?: unknown }).report ?? browserResult, null, 2)}</pre>
        </div> : null}
      </Panel>
      <Panel title="Add a claim">
        <div className="grid g2">
          <Field label="Title"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ClaimStatus })}>
              <option value="unverified">Unverified</option><option value="verified">Verified (needs source)</option><option value="assumption">Assumption</option>
            </select>
          </Field>
        </div>
        <Field label="Claim"><textarea value={form.claim} onChange={(e) => setForm({ ...form, claim: e.target.value })} /></Field>
        <div className="grid g2">
          <Field label="Source title"><input value={form.sourceTitle} onChange={(e) => setForm({ ...form, sourceTitle: e.target.value })} /></Field>
          <Field label="Source URL" hint={needsSource ? 'Verified claims need an http(s) link.' : urlBad ? 'That is not a valid http(s) URL.' : undefined}>
            <input value={form.sourceUrl} placeholder="https://" onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })} />
          </Field>
        </div>
        <Field label="Notes"><input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        <div><button className="btn primary" disabled={!canSave} onClick={async () => {
          const r = await db.create('research', { projectId: scope, ...form, title: form.title.trim(), claim: form.claim.trim() });
          await audit({ action: 'research.add', target: r.id, detail: r.status });
          setForm(EMPTY);
        }}>Add claim</button></div>
      </Panel>
      <div className="row">
        {(['all', 'verified', 'unverified', 'assumption'] as const).map((f) => <button key={f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>{f === 'all' ? `All (${items.length})` : f}</button>)}
      </div>
      {shown.length === 0 ? <Panel><EmptyState icon="search" title="Nothing here yet">Add a claim with its source to start building a report.</EmptyState></Panel> : (
        <div className="stack">
          {[...shown].reverse().map((r) => (
            <div className="item" key={r.id}>
              <div>
                <h3>{r.title} <span className={`pill ${r.status}`}>{r.status}</span></h3>
                <p>{r.claim}</p>
                <small>{r.sourceUrl ? <a href={r.sourceUrl} target="_blank" rel="noreferrer noopener">{r.sourceTitle || r.sourceUrl}</a> : 'No source recorded'}</small>
              </div>
              <ConfirmButton label="Delete" onConfirm={async () => { await db.remove('research', r.id); await audit({ action: 'research.delete', target: r.id }); }} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
