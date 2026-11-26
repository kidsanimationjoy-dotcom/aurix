import { useState } from 'react';
import type { SceneKind, SceneObject, SceneSpec } from '../domain/types';
import { newId } from '../lib/id';
import { generateSceneCode, scenePascal } from '../lib/sceneCode';
import { useActiveProject, useApp, useAudit, useCollection, useSettings } from '../state/AppState';
import { ConfirmButton, EmptyState, Field, Notice, PageHeader, Panel, download } from '../ui/kit';

const KINDS: SceneKind[] = ['box', 'sphere', 'torus', 'plane'];
type Vec = [number, number, number];

export function Studio3D() {
  const { db } = useApp();
  const audit = useAudit();
  const project = useActiveProject();
  const scope = useSettings().activeProjectId ?? null;
  const scenes = useCollection('scenes').filter((s) => s.projectId === scope);
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState('');
  const scene = scenes.find((s) => s.id === sel) ?? scenes[0];

  const patch = (p: Partial<Omit<SceneSpec, 'id' | 'createdAt' | 'updatedAt'>>) => scene && db.update('scenes', scene.id, p);
  const setObj = (id: string, p: Partial<SceneObject>) => patch({ objects: scene!.objects.map((o) => (o.id === id ? { ...o, ...p } : o)) });
  const setVec = (v: Vec, i: number, raw: string): Vec => { const n = Number(raw); const c = [...v] as Vec; c[i] = Number.isFinite(n) ? n : 0; return c; };
  const code = scene ? generateSceneCode(scene) : '';

  return (
    <>
      <PageHeader title="3D Website Studio" subtitle={project ? `Scenes for ${project.name}` : 'Scenes (no project selected)'} />
      <Notice tone="warn">
        This phase edits a <b>scene description</b> and generates React Three Fiber source from it. There is no live 3D preview yet, and the generated code has not been compiled by AURIX. The layout view below is a top-down 2D diagram, not a render.
      </Notice>
      <div className="split">
        <Panel title="Scenes">
          <div className="row tight" style={{ flexWrap: 'nowrap' }}>
            <input aria-label="New scene name" placeholder="Hero scene" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn" disabled={!name.trim()} onClick={async () => {
              const s = await db.create('scenes', { projectId: scope, name: name.trim(), background: '#0b0c10', camera: [0, 1.5, 5], ambient: 0.6, objects: [] });
              await audit({ action: 'scene.create', target: s.id, detail: s.name }); setName(''); setSel(s.id);
            }}>Add</button>
          </div>
          {scenes.map((s) => <button key={s.id} className={`list-btn ${scene?.id === s.id ? 'on' : ''}`} onClick={() => setSel(s.id)}>{s.name}<small>{s.objects.length} objects</small></button>)}
          {scenes.length === 0 && <small>No scenes yet.</small>}
        </Panel>
        {!scene ? <Panel><EmptyState icon="cube" title="Create a scene">Add a scene, then place objects and set the camera and lighting.</EmptyState></Panel> : (
          <div className="stack">
            <Panel title={scene.name} aside={<ConfirmButton label="Delete scene" onConfirm={async () => { await db.remove('scenes', scene.id); await audit({ action: 'scene.delete', target: scene.id }); setSel(null); }} />}>
              <div className="grid g3">
                <Field label="Background"><input type="color" value={scene.background} onChange={(e) => void patch({ background: e.target.value })} /></Field>
                <Field label="Ambient light"><input type="number" step="0.1" min="0" max="3" value={scene.ambient} onChange={(e) => void patch({ ambient: Math.max(0, Number(e.target.value) || 0) })} /></Field>
                <Field label="Camera x, y, z">
                  <div className="row tight" style={{ flexWrap: 'nowrap' }}>{scene.camera.map((c, i) => <input key={i} type="number" step="0.5" aria-label={`Camera ${'xyz'[i]}`} value={c} onChange={(e) => void patch({ camera: setVec(scene.camera, i, e.target.value) })} />)}</div>
                </Field>
              </div>
              <div className="row"><button className="btn" onClick={async () => { await patch({ objects: [...scene.objects, { id: newId('obj'), kind: 'box', color: '#4d7cff', position: [0, 0, 0], spin: true }] }); await audit({ action: 'scene.object.add', target: scene.id }); }}>Add object</button></div>
              {scene.objects.map((o) => (
                <div className="item" key={o.id}>
                  <div className="row" style={{ flex: 1 }}>
                    <select aria-label="Shape" value={o.kind} onChange={(e) => void setObj(o.id, { kind: e.target.value as SceneKind })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
                    <input type="color" aria-label="Colour" value={o.color} onChange={(e) => void setObj(o.id, { color: e.target.value })} />
                    {o.position.map((c, i) => <input key={i} style={{ width: 70 }} type="number" step="0.5" aria-label={`Position ${'xyz'[i]}`} value={c} onChange={(e) => void setObj(o.id, { position: setVec(o.position, i, e.target.value) })} />)}
                    <label className="check"><input type="checkbox" checked={o.spin} onChange={(e) => void setObj(o.id, { spin: e.target.checked })} />Spin</label>
                  </div>
                  <button className="btn ghost danger" aria-label="Remove object" onClick={() => void patch({ objects: scene.objects.filter((x) => x.id !== o.id) })}>Remove</button>
                </div>
              ))}
            </Panel>
            <div className="grid g2">
              <Panel title="Layout view (top-down, not a render)">
                <svg viewBox="-5 -5 10 10" role="img" aria-label="Top-down layout of scene objects" style={{ background: scene.background, borderRadius: 8, width: '100%', aspectRatio: '1' }}>
                  <path d="M-5 0H5M0 -5V5" stroke="#ffffff22" strokeWidth="0.04" />
                  {scene.objects.map((o) => <circle key={o.id} cx={Math.max(-4.8, Math.min(4.8, o.position[0]))} cy={Math.max(-4.8, Math.min(4.8, o.position[2]))} r="0.5" fill={o.color} />)}
                </svg>
              </Panel>
              <Panel title={`Generated ${scenePascal(scene.name)}.tsx`} aside={<button className="btn sm" onClick={() => { download(`${scenePascal(scene.name)}.tsx`, 'text/plain', code); void audit({ action: 'scene.export', target: scene.id }); }}>Download</button>}>
                <pre className="code-view" tabIndex={0}>{code}</pre>
                <small>Needs react, three, @react-three/fiber and @react-three/drei in the target project.</small>
              </Panel>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
