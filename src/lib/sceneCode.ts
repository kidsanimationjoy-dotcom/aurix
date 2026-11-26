import type { SceneObject, SceneSpec } from '../domain/types';

const GEOMETRY: Record<SceneObject['kind'], string> = {
  box: '<boxGeometry args={[1, 1, 1]} />',
  sphere: '<sphereGeometry args={[0.6, 48, 48]} />',
  torus: '<torusGeometry args={[0.6, 0.22, 32, 96]} />',
  plane: '<planeGeometry args={[4, 4]} />',
};
const clean = (s: string) => s.replace(/[^#a-zA-Z0-9]/g, '');
const num = (n: number) => (Number.isFinite(n) ? String(n) : '0');

/**
 * Generates React Three Fiber source for a scene spec.
 * The output is TEXT: AURIX does not compile or render it in Phase 1.
 */
export function generateSceneCode(spec: Pick<SceneSpec, 'name' | 'background' | 'camera' | 'ambient' | 'objects'>): string {
  const meshes = spec.objects.map((o, i) => {
    const pos = o.position.map(num).join(', ');
    const rot = o.kind === 'plane' ? ' rotation={[-Math.PI / 2, 0, 0]}' : '';
    return `      <Spinner key="${i}" spin={${o.spin}} position={[${pos}]}${rot}>\n        ${GEOMETRY[o.kind]}\n        <meshStandardMaterial color="${clean(o.color)}" />\n      </Spinner>`;
  });
  return `import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useRef, type ReactNode } from 'react';
import type { Mesh } from 'three';

function Spinner({ spin, children, ...props }: { spin: boolean; children: ReactNode; position: [number, number, number]; rotation?: [number, number, number] }) {
  const ref = useRef<Mesh>(null);
  useFrame((_, dt) => { if (spin && ref.current) ref.current.rotation.y += dt * 0.6; });
  return <mesh ref={ref} {...props}>{children}</mesh>;
}

export default function ${scenePascal(spec.name)}() {
  return (
    <Canvas camera={{ position: [${spec.camera.map(num).join(', ')}] }} dpr={[1, 2]} style={{ background: '${clean(spec.background)}' }}>
      <ambientLight intensity={${num(spec.ambient)}} />
      <directionalLight position={[3, 4, 2]} intensity={1.1} />
${meshes.join('\n') || '      {/* empty scene */}'}
      <OrbitControls enablePan={false} />
    </Canvas>
  );
}
`;
}
export function scenePascal(name: string): string {
  const p = name.replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map((w) => w[0]!.toUpperCase() + w.slice(1)).join('');
  return /^[A-Za-z]/.test(p) ? p : `Scene${p}`;
}
