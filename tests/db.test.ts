import test from 'node:test';
import assert from 'node:assert/strict';
import { Db } from '../src/storage/db';
import { MemoryBackend } from '../src/storage/backend';
import { recordAudit, auditNewestFirst } from '../src/audit/audit';

async function fresh() {
  const db = new Db(new MemoryBackend());
  await db.load();
  return db;
}

test('create, update, remove persist through the backend and survive reload', async () => {
  const backend = new MemoryBackend();
  const db = new Db(backend);
  await db.load();
  const p = await db.create('projects', { name: 'A', description: '', preferredProvider: 'auto', localPath: null });
  await db.update('projects', p.id, { name: 'B' });
  const reloaded = new Db(backend);
  await reloaded.load();
  assert.equal(reloaded.get('projects', p.id)?.name, 'B');
  await reloaded.remove('projects', p.id);
  assert.equal(reloaded.snapshot('projects').length, 0);
});

test('subscribers are notified and snapshots change identity only on write', async () => {
  const db = await fresh();
  let n = 0;
  db.subscribe('memory', () => n++);
  const before = db.snapshot('memory');
  assert.equal(db.snapshot('memory'), before);
  await db.create('memory', { scope: 'global', projectId: null, text: 'x' });
  assert.equal(n, 1);
  assert.notEqual(db.snapshot('memory'), before);
});

test('update on a missing record throws', async () => {
  const db = await fresh();
  await assert.rejects(() => db.update('projects', 'nope', { name: 'x' }));
});

test('writes before load are rejected', async () => {
  const db = new Db(new MemoryBackend());
  await assert.rejects(() => db.create('memory', { scope: 'global', projectId: null, text: 'x' }));
});

test('audit log is append-only and newest-first', async () => {
  const db = await fresh();
  await recordAudit(db, { action: 'a' });
  await new Promise((r) => setTimeout(r, 3));
  await recordAudit(db, { action: 'b', outcome: 'denied' });
  const log = auditNewestFirst(db);
  assert.deepEqual(log.map((e) => e.action), ['b', 'a']);
  await assert.rejects(() => db.remove('audit', log[0]!.id), /append-only/);
  await assert.rejects(() => db.update('audit', log[0]!.id, { detail: 'x' }), /append-only/);
});

test('eraseWorkspace clears user data but keeps the audit trail', async () => {
  const db = await fresh();
  await db.create('memory', { scope: 'global', projectId: null, text: 'x' });
  await recordAudit(db, { action: 'kept' });
  await db.eraseWorkspace();
  assert.equal(db.snapshot('memory').length, 0);
  assert.equal(db.snapshot('audit').length, 1);
});

test('removeWhere cascades', async () => {
  const db = await fresh();
  await db.create('files', { projectId: 'p1', path: 'a', content: '' });
  await db.create('files', { projectId: 'p2', path: 'b', content: '' });
  assert.equal(await db.removeWhere('files', (f) => f.projectId === 'p1'), 1);
  assert.equal(db.snapshot('files').length, 1);
});

test('export omits asset blobs', async () => {
  const db = await fresh();
  await db.create('assets', { projectId: null, name: 'a.png', mime: 'image/png', size: 3, blob: new Blob(['abc']) });
  const out = JSON.parse(db.exportJson());
  assert.equal(out.assets[0].name, 'a.png');
  assert.equal('blob' in out.assets[0], false);
});
