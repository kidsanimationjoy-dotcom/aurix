import { useCallback, useEffect, useState } from 'react';
import { HiggsfieldAdapter } from '../adapters/higgsfield';
import type { MediaJob, MediaModel } from '../adapters/types';
import type { HiggsfieldQuote, HiggsfieldStatus } from '../companion/protocol';
import { useApp, useAudit, useCollection, useProviderStatus } from '../state/AppState';
import { ConfirmButton, EmptyState, Field, Notice, PageHeader, Panel, StatusPill, fmtTime } from '../ui/kit';

type Q = 'active' | 'completed' | 'failed';

function accountCredits(account: Record<string, unknown>): string | null {
  for (const key of ['available_credits', 'credits', 'credit_balance', 'remaining_credits', 'balance']) {
    const value = account[key];
    if (typeof value === 'number' || typeof value === 'string') return String(value);
  }
  return null;
}

export function Media() {
  const { db, adapters, refreshStatuses } = useApp();
  const audit = useAudit();
  const status = useProviderStatus('higgsfield');
  const drafts = useCollection('mediaDrafts');
  const higgsfield = adapters.find((adapter) => adapter.meta.id === 'higgsfield') as HiggsfieldAdapter | undefined;
  const [prompt, setPrompt] = useState('');
  const [queue, setQueue] = useState<Q>('active');
  const [models, setModels] = useState<MediaModel[]>([]);
  const [account, setAccount] = useState<HiggsfieldStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginMessage, setLoginMessage] = useState('');
  const [modelId, setModelId] = useState('seedance_2_0');
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  const [quote, setQuote] = useState<HiggsfieldQuote | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [jobId, setJobId] = useState('');
  const [job, setJob] = useState<MediaJob | null>(null);
  const [jobError, setJobError] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    if (!higgsfield) return;
    setLoading(true);
    setLoadError('');
    try {
      const nextAccount = await higgsfield.getAccountStatus();
      setAccount(nextAccount);
      if (nextAccount.signedIn) {
        const result = await higgsfield.listModels();
        if (!result.ok) throw new Error(result.error.message);
        setModels(result.value);
        if (!result.value.some((item) => item.id === modelId)) {
          const supported = result.value.find((item) => item.id === 'seedance_2_0');
          if (supported) setModelId(supported.id);
        }
      } else {
        setModels([]);
      }
      await refreshStatuses();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load Higgsfield account or model details.');
    } finally {
      setLoading(false);
    }
  }, [higgsfield, modelId, refreshStatuses, status?.state]);

  useEffect(() => { void reload(); }, [reload]);

  useEffect(() => {
    if (!jobId || job?.status === 'completed' || job?.status === 'failed' || job?.status === 'cancelled') return;
    let active = true;
    const poll = async () => {
      if (!higgsfield) return;
      const result = await higgsfield.getJob(jobId);
      if (!active) return;
      if (result.ok) {
        setJob(result.value);
        if (result.value.status === 'failed' || result.value.status === 'cancelled') {
          setJobError(result.value.error);
        }
      } else {
        setJobError(result.error.message);
      }
    };
    void poll();
    const timer = window.setInterval(() => { void poll(); }, 7000);
    return () => { active = false; window.clearInterval(timer); };
  }, [higgsfield, jobId, job?.status]);

  const supportedModel = models.find((item) => item.id === 'seedance_2_0' && item.kinds.includes('video'));
  const currentModel = models.find((item) => item.id === modelId);
  const hasCredits = account ? accountCredits(account.account) : null;

  async function startLogin() {
    if (!higgsfield) return;
    setLoginBusy(true); setLoginMessage(''); setLoadError('');
    const result = await higgsfield.startLogin();
    if (result.ok) setLoginMessage(result.value.message);
    else setLoadError(result.error.message);
    setLoginBusy(false);
  }

  async function requestQuote() {
    if (!higgsfield || !supportedModel || !prompt.trim() || busy) return;
    setBusy(true); setLoadError(''); setQuote(null); setConfirmed(false); setJobError('');
    const result = await higgsfield.quoteJob({
      modelId,
      kind: 'video',
      prompt: prompt.trim(),
      settings: { duration, resolution, aspectRatio },
    });
    if (result.ok) {
      setQuote(result.value);
      await audit({ action: 'media.cost.quoted', target: result.value.quoteId, detail: modelId });
    } else {
      setLoadError(result.error.message);
    }
    setBusy(false);
  }

  async function createJob() {
    if (!higgsfield || !quote || !confirmed || busy) return;
    setBusy(true); setLoadError(''); setJobError('');
    const result = await higgsfield.confirmAndSubmitJob(quote.quoteId, true);
    if (result.ok) {
      setJobId(result.value.jobId);
      setJob({ id: result.value.jobId, status: 'queued' });
      setQuote(null);
      setConfirmed(false);
      await audit({ action: 'media.generation.started', target: result.value.jobId, detail: modelId });
    } else {
      setLoadError(result.error.message);
    }
    setBusy(false);
  }

  async function saveDraft() {
    const d = await db.create('mediaDrafts', { kind: 'video', prompt: prompt.trim(), notes: '' });
    await audit({ action: 'media.draft.save', target: d.id, detail: 'video' });
    setPrompt('');
  }

  const quoteExpiry = quote ? Math.max(0, Math.ceil((quote.expiresAt - Date.now()) / 1000)) : 0;

  return (
    <>
      <PageHeader title="Media Studio" subtitle="Higgsfield video generation through the official local CLI." actions={status && <StatusPill state={status.state} />} />
      {!account?.signedIn ? (
        <Panel title="Connect Higgsfield">
          <Notice tone="warn">
            {account?.message ?? 'Pair the local AURIX companion, install the official Higgsfield CLI, and sign in using its browser OAuth flow.'}
          </Notice>
          <p>Install the official CLI in the local terminal with <code>npm install -g @higgsfield/cli</code>, then use the button below. The official sign-in opens in the companion terminal and browser. AURIX never asks you to paste an API key or access token.</p>
          <div className="row">
            <button className="btn primary" disabled={!higgsfield || loginBusy || !status || status.state === 'not_configured'} onClick={() => void startLogin()}>
              {loginBusy ? 'Starting sign-in…' : 'Sign in with Higgsfield'}
            </button>
            <button className="btn" disabled={loading || !higgsfield} onClick={() => void reload()}>Refresh status</button>
          </div>
          {loginMessage && <Notice>{loginMessage}</Notice>}
          {loadError && <Notice tone="bad">{loadError}</Notice>}
        </Panel>
      ) : (
        <>
          <Panel title="Higgsfield account">
            <div className="row wrap">
              <span><b>{typeof account.account.email === 'string' ? account.account.email : 'Signed in account'}</b></span>
              {account.account.plan !== undefined && <span>Plan: {String(account.account.plan)}</span>}
              {hasCredits !== null && <span>Available credits: <b>{hasCredits}</b></span>}
              {account.version !== undefined && account.version !== null && <span>CLI: {String((account.version as Record<string, unknown>).version ?? account.version)}</span>}
            </div>
            <div className="row">
              <button className="btn" disabled={loading} onClick={() => void reload()}>{loading ? 'Refreshing…' : 'Refresh account and models'}</button>
            </div>
            <small>Generation uses credits from the signed-in Higgsfield account. No job is submitted until you approve a fresh cost estimate.</small>
          </Panel>
          <div className="grid g2">
            <Panel title="Video prompt">
              <Field label="Model">
                <select value={modelId} onChange={(e) => { setModelId(e.target.value); setQuote(null); setConfirmed(false); }}>
                  {supportedModel ? <option value="seedance_2_0">{supportedModel.name} ({supportedModel.id})</option> : <option value="">No enabled video model found</option>}
                </select>
              </Field>
              <Field label="Describe the video"><textarea value={prompt} onChange={(e) => { setPrompt(e.target.value); setQuote(null); setConfirmed(false); }} placeholder="Describe subject, movement, camera and visual style." rows={6} /></Field>
              <div className="grid g2">
                <Field label="Duration"><select value={duration} onChange={(e) => { setDuration(Number(e.target.value)); setQuote(null); setConfirmed(false); }}><option value={5}>5 seconds</option><option value={10}>10 seconds</option></select></Field>
                <Field label="Resolution"><select value={resolution} onChange={(e) => { setResolution(e.target.value as '720p' | '1080p'); setQuote(null); setConfirmed(false); }}><option value="720p">720p</option><option value="1080p">1080p</option></select></Field>
                <Field label="Aspect ratio"><select value={aspectRatio} onChange={(e) => { setAspectRatio(e.target.value as '16:9' | '9:16' | '1:1'); setQuote(null); setConfirmed(false); }}><option value="16:9">16:9 landscape</option><option value="9:16">9:16 vertical</option><option value="1:1">1:1 square</option></select></Field>
              </div>
              <div className="row">
                <button className="btn primary" disabled={!supportedModel || !prompt.trim() || busy} onClick={() => void requestQuote()}>{busy ? 'Estimating…' : 'Estimate credit cost'}</button>
                <button className="btn" disabled={!prompt.trim()} onClick={() => void saveDraft()}>Save as draft</button>
              </div>
              {!supportedModel && <Notice tone="warn">AURIX enables only Seedance 2.0 video generation in this first release. The live model catalog did not return that model, so generation remains disabled.</Notice>}
              {currentModel && <small>Model details are from the live Higgsfield catalog. Generation options are validated again by the companion before a quote is requested.</small>}
            </Panel>
            <Panel title="Cost estimate and confirmation">
              {!quote ? (
                <EmptyState icon="list" title="No cost estimate yet">First request a cost estimate. It does not create a job or spend credits.</EmptyState>
              ) : (
                <div className="stack">
                  <Notice tone="warn">Review this estimate before generating. It expires in approximately {quoteExpiry} seconds. The companion checks the price again when you confirm.</Notice>
                  <p><b>Model:</b> {quote.modelId}</p>
                  <p><b>Settings:</b> {quote.settings.duration}s · {quote.settings.resolution} · {quote.settings.aspectRatio}</p>
                  <h3>Credit estimate returned by Higgsfield</h3>
                  <pre className="code-block">{JSON.stringify(quote.raw, null, 2)}</pre>
                  <label className="check">
                    <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                    I have reviewed the current estimate and agree to spend the displayed Higgsfield credits on this generation.
                  </label>
                  <button className="btn primary" disabled={!confirmed || busy || quoteExpiry <= 0} onClick={() => void createJob()}>
                    {busy ? 'Submitting…' : 'Confirm cost and generate'}
                  </button>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
      {loadError && account?.signedIn && <Notice tone="bad">{loadError}</Notice>}
      <Panel title="Generation queue">
        <div className="tabs">{(['active', 'completed', 'failed'] as const).map((q) => <button key={q} className={`tab ${queue === q ? 'on' : ''}`} onClick={() => setQueue(q)}>{q[0]!.toUpperCase() + q.slice(1)} ({job && ((q === 'active' && (job.status === 'queued' || job.status === 'running')) || (q === 'completed' && job.status === 'completed') || (q === 'failed' && (job.status === 'failed' || job.status === 'cancelled'))) ? 1 : 0})</button>)}</div>
        {!job || (queue === 'active' && !['queued', 'running'].includes(job.status)) || (queue === 'completed' && job.status !== 'completed') || (queue === 'failed' && !['failed', 'cancelled'].includes(job.status)) ? (
          <EmptyState icon="list" title={`No ${queue} jobs`}>Jobs appear here after Higgsfield returns a job ID. A job is completed only when a result file is available.</EmptyState>
        ) : (
          <div className="stack">
            <p>Job <code>{job.id}</code> · Status: <b>{job.status}</b></p>
            {job.status === 'completed' && job.outputs.map((output, index) => <p key={index}><a href={output.url} target="_blank" rel="noreferrer">Open generated video {index + 1}</a></p>)}
            {job.status === 'failed' && <Notice tone="bad">{job.error}</Notice>}
            {jobError && <Notice tone="warn">{jobError}</Notice>}
            {job.status === 'queued' || job.status === 'running' ? <small>Checking job status automatically while this page is open. You can leave and return later using the job ID: {jobId}.</small> : null}
          </div>
        )}
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
