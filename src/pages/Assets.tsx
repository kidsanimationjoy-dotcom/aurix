import { useEffect, useMemo, useState } from 'react';
import type { Asset } from '../domain/types';
import { useActiveProject, useApp, useAudit, useCollection } from '../state/AppState';
import { Icon } from '../ui/Icon';
import { ConfirmButton, EmptyState, Notice, PageHeader, Panel, download, fmtBytes } from '../ui/kit';

const MAX = 100 * 1024 * 1024;

function Thumb({ asset }: { asset: Asset }) {
  const url = useMemo(() => (asset.mime.startsWith('image/') ? URL.createObjectURL(asset.blob) : null), [asset.blob, asset.mime]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return <div className="thumb">{url ? <img src={url} alt={asset.name} /> : <Icon name="file" size={28} />}</div>;
}

export function Assets() {
  const { db } = useApp();
  const audit = useAudit();
  const project = useActiveProject();
  const assets = useCollection('assets');
  const [errors, setErrors] = useState<string[]>([]);

  async function onFiles(list: FileList | null) {
    if (!list) return;
    const errs: string[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX) { errs.push(`${f.name} is over 100 MB and was skipped.`); continue; }
      try {
        const a = await db.create('assets', { projectId: project?.id ?? null, name: f.name, mime: f.type || 'application/octet-stream', size: f.size, blob: f });
        await audit({ action: 'asset.add', target: a.name, detail: `${f.size} bytes` });
      } catch { errs.push(`${f.name} could not be saved. Browser storage may be full.`); }
    }
    setErrors(errs);
  }

  return (
    <>
      <PageHeader title="Asset Library" subtitle="Files you upload, stored in this browser." actions={
        <label className="btn primary"><Icon name="upload" size={16} />Upload files<input type="file" multiple hidden onChange={(e) => { void onFiles(e.target.files); e.target.value = ''; }} /></label>
      } />
      <Notice>Generated media from Higgsfield will appear here once that integration exists. Today this library only holds files you upload. Exports do not include file contents.</Notice>
      {errors.map((e) => <div key={e} className="notice bad" role="alert"><div>{e}</div></div>)}
      {assets.length === 0 ? <Panel><EmptyState icon="image" title="No assets yet">Upload images, video, documents or models to keep them with your projects.</EmptyState></Panel> : (
        <div className="grid g3">
          {[...assets].reverse().map((a) => (
            <Panel key={a.id}>
              <Thumb asset={a} />
              <div style={{ minWidth: 0 }}><h3 style={{ overflowWrap: 'anywhere' }}>{a.name}</h3><small>{fmtBytes(a.size)} · {a.projectId ? (db.get('projects', a.projectId)?.name ?? 'Project') : 'No project'}</small></div>
              <div className="row tight">
                <button className="btn sm" onClick={() => download(a.name, a.mime, a.blob)}><Icon name="download" size={14} />Download</button>
                <ConfirmButton label="Delete" onConfirm={async () => { await db.remove('assets', a.id); await audit({ action: 'asset.delete', target: a.name }); }} />
              </div>
            </Panel>
          ))}
        </div>
      )}
    </>
  );
}
