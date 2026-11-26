import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createCompanionServer } from '../companion/server.mjs';
import { getCodexStatus, isLoopbackCompanionUrl, probeCompanion, startCodexLogin } from '../src/companion/client';

async function withServer<T>(
  fn: (url: string) => Promise<T>,
  options: { codexCommand?: string } = {},
): Promise<T> {
  const server = createCompanionServer({
    token: 'secret-token',
    origin: 'http://localhost:5173',
    ...(options.codexCommand ? { codexCommand: options.codexCommand } : {}),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  try { return await fn(url); } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

async function makeFakeCodex(script: string): Promise<{ directory: string; command: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aurix-fake-codex-'));
  const command = path.join(directory, 'codex');
  await writeFile(command, '#!/usr/bin/env node\n' + script);
  await chmod(command, 0o700);
  return { directory, command };
}

test('probe connects with the correct token and reports only implemented capabilities', async () => {
  await withServer(async (url) => {
    const status = await probeCompanion({ url, token: 'secret-token' });
    assert.equal(status.state, 'connected');
    assert.deepEqual(status.health?.capabilities, ['health', 'cli.codex.status', 'cli.codex.login']);
    assert.deepEqual(status.health?.grantedRoots, []);
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

test('companion client rejects non-loopback destinations before making requests', async () => {
  assert.equal(isLoopbackCompanionUrl('http://127.0.0.1:4317'), true);
  assert.equal(isLoopbackCompanionUrl('http://localhost:4317'), true);
  assert.equal(isLoopbackCompanionUrl('https://localhost:4317'), false);
  assert.equal(isLoopbackCompanionUrl('http://example.com:4317'), false);
  assert.equal(isLoopbackCompanionUrl('http://127.0.0.1:4317/path'), false);
  const status = await getCodexStatus({ url: 'http://example.com:4317', token: 'secret-token' });
  assert.equal(status.state, 'error');
  assert.match(status.message, /loopback/);
});

test('companion does not expose filesystem, terminal, or Codex task execution endpoints', async () => {
  await withServer(async (url) => {
    for (const endpoint of ['/v1/fs/read', '/v1/terminal/exec']) {
      const response = await fetch(url + endpoint, { headers: { Authorization: 'Bearer secret-token' } });
      assert.equal(response.status, 501);
    }
    const get = await fetch(url + '/v1/codex/exec', { headers: { Authorization: 'Bearer secret-token' } });
    assert.equal(get.status, 405);
    const post = await fetch(url + '/v1/codex/exec', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' }),
    });
    assert.equal(post.status, 501);
  });
});

test('companion rejects foreign origins rather than merely omitting CORS headers', async () => {
  await withServer(async (url) => {
    const allowed = await fetch(url + '/v1/health', {
      headers: { Authorization: 'Bearer secret-token', Origin: 'http://localhost:5173' },
    });
    assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    const denied = await fetch(url + '/v1/health', {
      headers: { Authorization: 'Bearer secret-token', Origin: 'https://evil.example' },
    });
    assert.equal(denied.status, 403);
    assert.equal(denied.headers.get('access-control-allow-origin'), null);
  });
});

test('Codex status returns only parsed version, sign-in state and sanitised auth mode', async () => {
  const fake = await makeFakeCodex(`
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('codex-cli 0.42.1'); process.exit(0); }
if (args[0] === 'login' && args[1] === 'status') {
  console.log('Logged in using ChatGPT. access_token=do-not-return-this-value');
  process.exit(0);
}
process.exit(2);
`);
  try {
    await withServer(async (url) => {
      const status = await getCodexStatus({ url, token: 'secret-token' });
      assert.equal(status.state, 'ready');
      assert.equal(status.installed, true);
      assert.equal(status.signedIn, true);
      assert.equal(status.version, '0.42.1');
      assert.equal(status.authMode, 'chatgpt');
      assert.equal(JSON.stringify(status).includes('do-not-return-this-value'), false);
    }, { codexCommand: fake.command });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
  }
});

test('Codex status truthfully reports a missing CLI', async () => {
  await withServer(async (url) => {
    const status = await getCodexStatus({ url, token: 'secret-token' });
    assert.equal(status.state, 'missing');
    assert.equal(status.installed, false);
    assert.equal(status.signedIn, false);
  }, { codexCommand: path.join(os.tmpdir(), 'missing-aurix-codex-binary') });
});

test('official sign-in handoff starts only when Codex is installed and not signed in', async () => {
  const fake = await makeFakeCodex(`
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('codex-cli 0.42.1'); process.exit(0); }
if (args[0] === 'login' && args[1] === 'status') { console.log('Not logged in'); process.exit(1); }
if (args[0] === 'login') { console.log('Starting official sign-in'); process.exit(0); }
process.exit(2);
`);
  try {
    await withServer(async (url) => {
      const message = await startCodexLogin({ url, token: 'secret-token' });
      assert.match(message, /official browser sign-in/);
    }, { codexCommand: fake.command });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
  }
});
