import { useState } from 'react';
import { getCodexStatus, startCodexLogin } from '../companion/client';
import type { CodexStatus } from '../companion/protocol';
import { companionToken, useApp, useAudit, useSettings } from '../state/AppState';
import { ConfirmButton, Field, ImplPill, Notice, PageHeader, Panel, StatusPill, download } from '../ui/kit';

type Section = 'providers' | 'companion' | 'appearance' | 'workspace' | 'security';
const SECTIONS: [Section, string][] = [['providers', 'Providers'], ['companion', 'Local companion'], ['appearance', 'Appearance'], ['workspace', 'Workspace data'], ['security', 'Security']];

export function Settings() {
  const [section, setSection] = useState<Section>('providers');
  return (
    <>
      <PageHeader title="Settings" subtitle="Connection status, local companion, appearance and data." />
      <div className="tabs" role="tablist">{SECTIONS.map(([id, label]) => <button key={id} role="tab" aria-selected={section === id} className={`tab ${section === id ? 'on' : ''}`} onClick={() => setSection(id)}>{label}</button>)}</div>
      {section === 'providers' && <Providers />}
      {section === 'companion' && <Companion />}
      {section === 'appearance' && <Appearance />}
      {section === 'workspace' && <WorkspaceData />}
      {section === 'security' && <Security />}
    </>
  );
}

function Providers() {
  const { adapters, statuses } = useApp();
  return (
    <>
      <Notice>Codex now has local CLI installation and sign-in detection. Its AI task execution is still disabled pending a verified, narrowly scoped sandbox. The other provider adapters remain disconnected.</Notice>
      <div className="stack">
        {adapters.map((a) => {
          const s = statuses[a.meta.id];
          return (
            <Panel key={a.meta.id} title={`${a.meta.name} · ${a.meta.vendor}`} aside={<div className="row tight">{s && <StatusPill state={s.state} />}{s && <ImplPill level={s.implementation} />}</div>}>
              <p className="muted">{a.meta.role}</p>
              {s?.detail && <small>{s.detail}</small>}
              <div className="grid g2">
                <div><h3>Authentication</h3><small>{a.meta.authentication}</small></div>
                <div><h3>Constraints</h3><ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{a.meta.constraints.map((c) => <li key={c}><small>{c}</small></li>)}</ul></div>
              </div>
              <div className="row tight"><small>Planned: {a.meta.plannedCapabilities.join(', ')}</small></div>
              {a.meta.references.length > 0 && <div className="row">{a.meta.references.map((r) => <a key={r.url} href={r.url} target="_blank" rel="noreferrer noopener">{r.label}</a>)}</div>}
            </Panel>
          );
        })}
      </div>
    </>
  );
}

function Companion() {
  const { db, companion, checkCompanion, refreshStatuses } = useApp();
  const audit = useAudit();
  const settings = useSettings();
  const [url, setUrl] = useState(settings.companionUrl);
  const [token, setToken] = useState(companionToken.get());
  const [busy, setBusy] = useState(false);
  const [codexBusy, setCodexBusy] = useState(false);
  const [codexStatus, setCodexStatus] = useState<CodexStatus | null>(null);
  const [codexMessage, setCodexMessage] = useState('');
  const localConfig = { url, token };
  const checkCodex = async () => {
    setCodexBusy(true);
    setCodexMessage('');
    const result = await getCodexStatus(localConfig);
    setCodexStatus(result);
    await refreshStatuses();
    setCodexBusy(false);
  };
  return (
    <>
      <Notice>The companion runs on your own computer. It provides health checks and official Codex CLI status/sign-in only. It has no filesystem access and cannot run AURIX tasks yet. See <code>companion/README.md</code>.</Notice>
      <Panel title="Connection" aside={<StatusPill state={companion.state === 'connected' ? 'connected' : companion.state === 'unauthorized' ? 'awaiting_authentication' : companion.state === 'unreachable' || companion.state === 'incompatible' ? 'error' : 'not_configured'} />}>
        <div className="grid g2">
          <Field label="Companion URL" hint="Loopback address printed by the companion, e.g. http://127.0.0.1:4317"><input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://127.0.0.1:4317" /></Field>
          <Field label="Pairing token" hint="Kept for this browser session only. Never saved or exported."><input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /></Field>
        </div>
        <div className="row">
          <button className="btn primary" disabled={busy} onClick={async () => {
            setBusy(true);
            companionToken.set(token.trim());
            await db.update('settings', settings.id, { companionUrl: url.trim() });
            await checkCompanion();
            await audit({ action: 'companion.test', target: url.trim() || 'none' });
            const status = await getCodexStatus(localConfig);
            setCodexStatus(status);
            setBusy(false);
          }}>Save and test</button>
          <small>{companion.message}</small>
        </div>
        {companion.health && <small>Companion v{companion.health.version} · capabilities: {companion.health.capabilities.join(', ')} · granted folders: {companion.health.grantedRoots.length || 'none'}</small>}
      </Panel>

      <Panel title="OpenAI Codex CLI" aside={codexStatus && <span className="pill">{codexStatus.state.replace('_', ' ')}</span>}>
        <p className="muted">AURIX checks the official CLI on this computer. Sign-in happens through Codex itself in the companion terminal; AURIX never reads the local credential store.</p>
        {codexStatus && (
          <Notice tone={codexStatus.state === 'ready' ? 'info' : codexStatus.state === 'error' ? 'bad' : 'warn'}>
            {codexStatus.message}
            {codexStatus.version ? ' · Version ' + codexStatus.version : ''}
            {codexStatus.signedIn ? ' · Sign-in: ' + codexStatus.authMode.replace('_', ' ') : ''}
          </Notice>
        )}
        {codexMessage && <Notice tone="info">{codexMessage}</Notice>}
        <div className="row">
          <button className="btn" disabled={codexBusy} onClick={() => void checkCodex()}>
            {codexBusy ? 'Checking…' : 'Check Codex status'}
          </button>
          <button className="btn primary" disabled={codexBusy || !companionToken.get() || codexStatus?.installed === false || codexStatus?.signedIn === true} onClick={async () => {
            setCodexBusy(true);
            setCodexMessage('');
            try {
              const message = await startCodexLogin(localConfig);
              setCodexMessage(message);
              await audit({ action: 'codex.login.start', target: 'local companion', outcome: 'info' });
            } catch (error) {
              setCodexMessage(error instanceof Error ? error.message : 'Could not start Codex sign-in.');
            } finally {
              setCodexBusy(false);
            }
          }}>Sign in with ChatGPT</button>
        </div>
        <small>Sign-in is only a connection check. AURIX task execution remains disabled until restricted filesystem access is verified.</small>
      </Panel>
    </>
  );
}

function Appearance() {
  const { db } = useApp();
  const audit = useAudit();
  const s = useSettings();
  return (
    <Panel title="Appearance">
      <Field label="Density"><select value={s.density} onChange={async (e) => { await db.update('settings', s.id, { density: e.target.value as 'comfortable' | 'compact' }); await audit({ action: 'settings.density', detail: e.target.value }); }}><option value="comfortable">Comfortable</option><option value="compact">Compact</option></select></Field>
      <label className="check"><input type="checkbox" checked={s.reduceMotion} onChange={async (e) => { await db.update('settings', s.id, { reduceMotion: e.target.checked }); await audit({ action: 'settings.motion', detail: String(e.target.checked) }); }} />Reduce motion</label>
      <small>AURIX also follows your system’s reduced-motion setting.</small>
    </Panel>
  );
}

function WorkspaceData() {
  const { db } = useApp();
  const audit = useAudit();
  return (
    <Panel title="Workspace data">
      <p className="muted">Everything lives in this browser’s IndexedDB. Clearing site data or switching browsers removes it.</p>
      <div className="row">
        <button className="btn" onClick={async () => { download('aurix-export.json', 'application/json', db.exportJson()); await audit({ action: 'workspace.export' }); }}>Export as JSON</button>
        <ConfirmButton label="Erase workspace data" confirmLabel="Erase everything except the audit log" onConfirm={async () => { const n = await db.eraseWorkspace(); await audit({ action: 'workspace.erase', detail: `${n} collections cleared`, outcome: 'success' }); location.hash = '/'; location.reload(); }} />
      </div>
      <small>Export excludes uploaded file contents. Erase keeps the audit log.</small>
    </Panel>
  );
}

function Security() {
  const rows: [string, string, string][] = [
    ['Agent permissions', 'Ask or deny only', 'Implemented. No “allow always” option exists.'],
    ['Destructive actions', 'Two-step confirmation', 'Implemented for deletes in this browser.'],
    ['Audit log', 'Append-only, local', 'Implemented. Not tamper-proof against someone with access to this browser profile.'],
    ['Secrets', 'Pairing token in session memory only; Codex credentials stay with the official CLI', 'Implemented. AURIX never reads or exports Codex credentials.'],
    ['Command approval, sandboxing, network controls', 'Per-command approval via companion', 'Not built. Needs the companion.'],
    ['Emergency stop, rate limiting, authentication', 'Planned for the security phase', 'Not built.'],
  ];
  return (
    <Panel title="Security and permissions">
      <table><thead><tr><th>Control</th><th>Design</th><th>Status</th></tr></thead><tbody>{rows.map((r) => <tr key={r[0]}><td>{r[0]}</td><td>{r[1]}</td><td className="muted">{r[2]}</td></tr>)}</tbody></table>
    </Panel>
  );
}
