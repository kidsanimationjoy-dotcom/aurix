import { useState, type ReactNode } from 'react';
import type { ConnectionState, ImplementationLevel } from '../adapters/types';
import { Icon, type IconName } from './Icon';

export function PageHeader(p: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{p.title}</h1>
        {p.subtitle && <p className="sub">{p.subtitle}</p>}
      </div>
      {p.actions && <div className="row">{p.actions}</div>}
    </header>
  );
}

export function Panel(p: { title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${p.className ?? ''}`}>
      {(p.title || p.aside) && (
        <div className="panel-head">
          <h2>{p.title}</h2>
          {p.aside}
        </div>
      )}
      {p.children}
    </section>
  );
}

export function EmptyState(p: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      {p.icon && <span className="empty-icon"><Icon name={p.icon} size={22} /></span>}
      <strong>{p.title}</strong>
      {p.children && <p>{p.children}</p>}
      {p.action}
    </div>
  );
}

export function Notice(p: { tone?: 'info' | 'warn' | 'bad'; children: ReactNode }) {
  return (
    <div className={`notice ${p.tone ?? 'info'}`} role={p.tone === 'bad' ? 'alert' : 'note'}>
      <Icon name="alert" size={16} />
      <div>{p.children}</div>
    </div>
  );
}

const STATE_LABEL: Record<ConnectionState, [string, string]> = {
  not_configured: ['○', 'Not connected'],
  awaiting_authentication: ['◐', 'Needs sign-in'],
  connected: ['●', 'Connected'],
  blocked: ['▲', 'Blocked'],
  error: ['✕', 'Error'],
};
export function StatusPill({ state }: { state: ConnectionState }) {
  const [glyph, label] = STATE_LABEL[state];
  return <span className={`pill s-${state}`}><span aria-hidden="true">{glyph}</span>{label}</span>;
}
const IMPL_LABEL: Record<ImplementationLevel, string> = {
  interface_only: 'Interface only',
  implemented_untested: 'Implemented, untested',
  implemented_tested: 'Implemented and tested',
};
export function ImplPill({ level }: { level: ImplementationLevel }) {
  return <span className="pill impl">{IMPL_LABEL[level]}</span>;
}

/** Two-step destructive action. Nothing is deleted on the first click. */
export function ConfirmButton(p: { label: string; confirmLabel?: string; onConfirm: () => void | Promise<void>; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return <button type="button" className="btn ghost danger" disabled={p.disabled} onClick={() => setArmed(true)}><Icon name="trash" size={15} />{p.label}</button>;
  }
  return (
    <span className="row tight">
      <button type="button" className="btn danger-solid" onClick={async () => { setArmed(false); await p.onConfirm(); }}>{p.confirmLabel ?? 'Confirm delete'}</button>
      <button type="button" className="btn ghost" onClick={() => setArmed(false)}>Cancel</button>
    </span>
  );
}

export function Field(p: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{p.label}</span>
      {p.children}
      {p.hint && <small>{p.hint}</small>}
    </label>
  );
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
export function download(name: string, mime: string, data: string | Blob) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
