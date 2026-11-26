import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createCompanionServer } from '../companion/server.mjs';
import { probeCompanion } from '../src/companion/client';

async function withServer<T>(fn: (url: string) => Promise<T>): Promise<T> {
  const server = createCompanionServer({ token: 'secret-token', origin: 'http://localhost:5173' });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try { return await fn(url); } finally { await new Promise((r) => server.close(r)); }
}

test('probe connects with the right token and reports only health capability', async () => {
  await withServer(async (url) => {
    const s = await probeCompanion({ url, token: 'secret-token' });
    assert.equal(s.state, 'connected');
    assert.deepEqual(s.health?.capabilities, ['health']);
    assert.deepEqual(s.health?.grantedRoots, []);
  });
});

test('probe reports unauthorized for a wrong token', async () => {
  await withServer(async (url) => {
    assert.equal((await probeCompanion({ url, token: 'wrong' })).state, 'unauthorized');
  });
});

test('probe reports unreachable when nothing listens, and not_configured without a URL', async () => {
  assert.equal((await probeCompanion({ url: 'http://127.0.0.1:1', token: 'x', timeoutMs: 800 })).state, 'unreachable');
  assert.equal((await probeCompanion({ url: '', token: 'x' })).state, 'not_configured');
});

test('companion does not implement filesystem or terminal endpoints', async () => {
  await withServer(async (url) => {
    for (const path of ['/v1/fs/read', '/v1/terminal/exec']) {
      const r = await fetch(url + path, { headers: { Authorization: 'Bearer secret-token' } });
      assert.equal(r.status, 501);
    }
  });
});

test('companion answers CORS only for the configured origin', async () => {
  await withServer(async (url) => {
    const ok = await fetch(url + '/v1/health', { headers: { Authorization: 'Bearer secret-token', Origin: 'http://localhost:5173' } });
    assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const bad = await fetch(url + '/v1/health', { headers: { Authorization: 'Bearer secret-token', Origin: 'https://evil.example' } });
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
  });
});
