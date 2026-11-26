import { useEffect, useState } from 'react';
import { routeTask, type RouteDecision } from '../router/providerRouter';
import { useApp, useAudit, useCollection, useProviderStatus } from '../state/AppState';
import { ConfirmButton, EmptyState, Field, Notice, PageHeader, Panel, StatusPill, fmtTime } from '../ui/kit';

type Q = 'active' | 'completed' | 'failed';

export function Media() {
  const { db, adapters } = useApp();
  const audit = useAudit();
  const status = useProviderStatus('higgsfield');
  const drafts = useCollection('mediaDrafts');
  const [kind, setKind] = useState<'video' | 'image'>('video');
  const [prompt, setPrompt] = useState('');
  const [queue, setQueue] = useState<Q>('active');
  const [route, setRoute] = useState<RouteDecision | null>(null);

  useEffect(() => { void routeTask(adapters, { kind: kind === 'video' ? 'media_video' : 'media_image', preferred: 'higgsfield' }).then(setRoute); }, [adapters, kind]);

  return (
    <>
      <PageHeader title="Media Studio" subtitle="AI video and image generation through Higgsfield." actions={status && <StatusPill state={status.state} />} />
      <Notice tone="warn">
        Higgsfield is not connected. Generation, model discovery and credit balance are unavailable. Nothing on this page produces media until Higgsfield accepts a job and returns a result file.
      </Notice>
      <div className="grid g2">
        <Panel title="Prompt">
          <Field label="Type">
            <select value={kind} onChange={(e) => setKind(e.target.value as 'video' | 'image')}><option value="video">Video</option><option value="image">Image</option></select>
          </Field>
          <Field label="Prompt"><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the shot, subject, motion and mood" /></Field>
          <div className="row">
            <button className="btn primary" disabled title={route && !route.ok ? route.reason : undefined}>Generate {kind}</button>
            <button className="btn" disabled={!prompt.trim()} onClick={async () => {
              const d = await db.create('mediaDrafts', { kind, prompt: prompt.trim(), notes: '' });
              await audit({ action: 'media.draft.save', target: d.id, detail: kind });
              setPrompt('');
            }}>Save as draft</button>
          </div>
          <small>{route && !route.ok ? `Generate is disabled: ${route.reason}` : ''} Drafts stay on this device.</small>
        </Panel>
        <Panel title="Models and settings">
          <EmptyState icon="film" title="No models loaded">
            Models, aspect ratios, durations, resolutions and costs come from Higgsfield after you connect. AURIX does not ship a model list, so it cannot go out of date.
          </EmptyState>
        </Panel>
      </div>
      <Panel title="Generation queue">
        <div className="tabs">{(['active', 'completed', 'failed'] as const).map((q) => <button key={q} className={`tab ${queue === q ? 'on' : ''}`} onClick={() => setQueue(q)}>{q[0]!.toUpperCase() + q.slice(1)} (0)</button>)}</div>
        <EmptyState icon="list" title={`No ${queue} jobs`}>A job moves to Completed only when Higgsfield confirms it and the result file is available.</EmptyState>
      </Panel>
      <Panel title="Saved drafts">
        {drafts.length === 0 ? <small>No drafts saved.</small> : (
          <div className="stack">
            {[...drafts].reverse().map((d) => (
              <div className="item" key={d.id}>
                <div><h3>{d.kind === 'video' ? 'Video' : 'Image'} draft</h3><p>{d.prompt}</p><small>{fmtTime(d.createdAt)}</small></div>
                <ConfirmButton label="Delete" onConfirm={async () => { await db.remove('mediaDrafts', d.id); await audit({ action: 'media.draft.delete', target: d.id }); }} />
              </div>
            ))}
          </div>
        )}
      </Panel>
    </>
  );
}
