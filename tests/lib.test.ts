import test from 'node:test';
import assert from 'node:assert/strict';
import { diffLines, diffStats } from '../src/lib/diff';
import { generateSceneCode, scenePascal } from '../src/lib/sceneCode';
import { researchToMarkdown } from '../src/lib/researchExport';
import { parseRoute, NAV } from '../src/router/routes';
import { BUILT_IN_AGENTS } from '../src/domain/seed';
import type { ResearchItem } from '../src/domain/types';

test('diff detects additions, removals and unchanged lines', () => {
  const d = diffLines('a\nb\nc', 'a\nc\nd');
  assert.deepEqual(diffStats(d), { added: 1, removed: 1 });
  assert.deepEqual(d.filter((l) => l.kind === 'same').map((l) => l.text), ['a', 'c']);
  assert.deepEqual(diffLines('', ''), []);
  assert.deepEqual(diffStats(diffLines('', 'x\ny')), { added: 2, removed: 0 });
});

test('route parsing resolves known paths and falls back to home', () => {
  assert.equal(parseRoute(''), '/');
  assert.equal(parseRoute('#/projects'), '/projects');
  assert.equal(parseRoute('#/projects/?a=1'), '/projects');
  assert.equal(parseRoute('#/nope'), '/');
  assert.equal(new Set(NAV.map((n) => n.path)).size, NAV.length);
});

test('scene code generation sanitises values and names the component', () => {
  const code = generateSceneCode({
    name: 'my hero scene', background: '#000"; alert(1)//', camera: [0, 1, 5], ambient: 0.5,
    objects: [{ id: '1', kind: 'torus', color: '#4d7cff', position: [0, 1, 0], spin: true }],
  });
  assert.match(code, /export default function MyHeroScene/);
  assert.ok(!code.includes('alert(1)'));
  assert.match(code, /torusGeometry/);
  assert.equal(scenePascal('3d demo'), 'Scene3dDemo');
});

test('research export keeps verified, unverified and assumptions apart', () => {
  const mk = (status: ResearchItem['status'], title: string): ResearchItem => ({
    id: title, createdAt: 0, updatedAt: 0, projectId: null, title, claim: 'c', status,
    sourceTitle: '', sourceUrl: status === 'verified' ? 'https://example.com' : '', notes: '',
  });
  const md = researchToMarkdown('T', [mk('assumption', 'A1'), mk('verified', 'V1')]);
  assert.ok(md.indexOf('## Verified (1)') < md.indexOf('## Assumption (1)'));
  assert.match(md, /Source: none recorded/);
});

test('built-in agents cover the eight spec roles and default to ask-first permissions', () => {
  assert.equal(BUILT_IN_AGENTS.length, 8);
  for (const a of BUILT_IN_AGENTS) assert.deepEqual(a.permissions, { fileWrite: 'ask', terminal: 'ask', network: 'ask' });
});
