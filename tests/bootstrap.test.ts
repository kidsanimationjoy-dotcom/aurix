import test from 'node:test';
import assert from 'node:assert/strict';
import { Db } from '../src/storage/db';
import { MemoryBackend } from '../src/storage/backend';
import { bootstrap, SETTINGS_ID } from '../src/state/bootstrap';
import { validateRelativePath } from '../src/lib/paths';

test('bootstrap seeds settings and agents once, and records the session in the audit log', async () => {
  const backend = new MemoryBackend();
  const db = new Db(backend);
  await db.load();
  await bootstrap(db, true);
  const again = new Db(backend);
  await again.load();
  await bootstrap(again, true);
  assert.equal(again.snapshot('agents').length, 8);
  assert.equal(again.snapshot('settings').length, 1);
  assert.ok(again.get('settings', SETTINGS_ID));
  assert.equal(again.snapshot('audit').filter((e) => e.action === 'workspace.opened').length, 2);
  assert.equal(again.snapshot('audit').filter((e) => e.action === 'agents.seeded').length, 1);
});

test('bootstrap flags missing persistence as an error event', async () => {
  const db = new Db(new MemoryBackend());
  await db.load();
  await bootstrap(db, false);
  assert.equal(db.snapshot('audit').find((e) => e.action === 'workspace.opened')?.outcome, 'error');
});

test('relative path validation blocks traversal, absolute paths and junk', () => {
  for (const bad of ['', '  ', '/etc/passwd', 'C:\\x', '../a', 'a/../b', 'a//b', 'a\\b', './a', 'a/', 'x'.repeat(201)]) {
    assert.notEqual(validateRelativePath(bad), null, JSON.stringify(bad));
  }
  for (const good of ['a.ts', 'src/app/main.tsx', 'docs/README.md']) assert.equal(validateRelativePath(good), null);
});
