import { useEffect, useState, type ReactNode } from 'react';
import { NAV } from '../router/routes';
import { navigate } from '../router/useRoute';
import { useApp, useAudit, useCollection, useSettings } from '../state/AppState';
import { Icon } from './Icon';
import { StatusPill } from './kit';

export function Shell({ route, children }: { route: string; children: ReactNode }) {
  const { db, adapters, statuses, persistent, companion } = useApp();
  const settings = useSettings();
  const projects = useCollection('projects');
  const audit = useAudit();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [route]);
  useEffect(() => {
    document.documentElement.dataset.density = settings.density;
    document.documentElement.dataset.motion = settings.reduceMotion ? 'reduced' : 'full';
  }, [settings.density, settings.reduceMotion]);

  const groups = [...new Set(NAV.map((n) => n.group))];
  const connected = adapters.filter((a) => statuses[a.meta.id]?.state === 'connected').length;

  return (
    <div className={`app ${open ? 'nav-open' : ''}`}>
      <a className="skip" href="#main">Skip to content</a>
      <aside className="sidebar" aria-label="Primary">
        <div className="brand">
          <span className="mark" aria-hidden="true" />
          <span>AURIX</span>
        </div>
        <nav>
          {groups.map((g) => (
            <div className="nav-group" key={g}>
              <div className="nav-title">{g}</div>
              {NAV.filter((n) => n.group === g).map((n) => (
                <a key={n.path} href={`#${n.path}`} className={n.path === route ? 'active' : ''} aria-current={n.path === route ? 'page' : undefined}>
                  <Icon name={n.icon} size={17} />{n.label}
                </a>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">Phase 1 foundation. Providers are not connected yet.</div>
      </aside>
      {open && <button className="scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <div className="main-col">
        <div className="topbar">
          <button className="btn icon menu-btn" aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <label className="project-switch">
            <span className="sr">Active project</span>
            <select
              value={settings.activeProjectId ?? ''}
              onChange={async (e) => {
                const id = e.target.value || null;
                await db.update('settings', settings.id, { activeProjectId: id });
                await audit({ action: 'project.switch', target: id ?? 'none' });
              }}
            >
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div className="spacer" />
          <button className="ledger" onClick={() => navigate('/settings')} title="Provider connections">
            <span className="ledger-cells" aria-hidden="true">
              {adapters.map((a) => <i key={a.meta.id} className={`cell ${statuses[a.meta.id]?.state ?? ''}`} />)}
            </span>
            <span>{connected} of {adapters.length} providers connected</span>
          </button>
          <span className="companion-chip" title={companion.message}>
            Companion <StatusPill state={companion.state === 'connected' ? 'connected' : companion.state === 'unauthorized' ? 'awaiting_authentication' : 'not_configured'} />
          </span>
        </div>
        {!persistent && (
          <div className="banner-bad" role="alert">This browser blocked local storage. Your work will not be saved after you close this tab.</div>
        )}
        <main id="main" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}
