import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createCompanionServer } from '../companion/server.mjs';
import { getCodexStatus, isLoopbackCompanionUrl, probeCompanion, startCodexLogin } from '../src/companion/client';
import { OpenAiAdapter } from '../src/adapters/openai';
import { checkLegacySystemConfig, hasLegacySandboxSetting, prepareCodexHome, renderCodexProfileConfig, resolveCodexPaths, validateCodexHome, buildCodexSandboxArgs, systemCodexConfigPaths } from '../companion/codex-profile.mjs';

async function withServer<T>(
  fn: (url: string) => Promise<T>,
  options: { codexCommand?: string; codexPaths?: ReturnType<typeof resolveCodexPaths>; reaCommand?: string; reaRoots?: string[]; codexRoots?: string[] } = {},
): Promise<T> {
  const server = createCompanionServer({
    token: 'secret-token',
    origin: 'http://localhost:5173',
    ...(options.codexCommand ? { codexCommand: options.codexCommand } : {}),
    ...(options.codexPaths ? { codexPaths: options.codexPaths } : {}),
    ...(options.reaCommand ? { reaCommand: options.reaCommand } : {}),
    ...(options.reaRoots ? { reaRoots: options.reaRoots } : {}),
    ...(options.codexRoots ? { codexRoots: options.codexRoots } : {}),
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  try { return await fn(url); } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}


async function makeCodexProfile() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aurix-codex-profile-'));
  const paths = resolveCodexPaths({ HOME: root, XDG_DATA_HOME: path.join(root, 'data') }, process.platform, root);
  return { root, paths };
}

async function makeFakeCodex(script: string): Promise<{ directory: string; command: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aurix-fake-codex-'));
  const command = path.join(directory, 'codex');
  await writeFile(command, '#!/usr/bin/env node\n' + script);
  await chmod(command, 0o700);
  return { directory, command };
}



test('Codex chat requires a verified sandbox and runs only in read-only mode', async () => {
  if (process.platform === 'win32') return;
  const profile = await makeCodexProfile();
  const fake = await makeFakeCodex(`
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('codex 1.0.0'); process.exit(0); }
if (args[0] === 'login' && args[1] === 'status') { console.log('Logged in with ChatGPT'); process.exit(0); }
if (args[0] === 'sandbox') { console.log('AURIX_SANDBOX_CANARY_OK'); process.exit(0); }
if (args[0] === 'exec') {
  if (!args.includes('--sandbox') || args[args.indexOf('--sandbox') + 1] !== 'read-only') process.exit(21);
  if (!args.includes('--ephemeral') || !args.includes('--json') || !args.includes('--cd')) process.exit(22);
  if (Object.hasOwn(process.env, 'OPENAI_API_KEY')) process.exit(23);
  console.log(JSON.stringify({ type: 'thread.started', thread_id: 'thread-test-123' }));
  console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Hello from isolated Codex chat.' } }));
  process.exit(0);
}
process.exit(2);
`);
  try {
    await withServer(async (url) => {
      const headers = { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' };
      const payload = { messages: [{ role: 'user', content: 'Hello' }] };
      const blocked = await fetch(url + '/v1/codex/chat', { method: 'POST', headers, body: JSON.stringify(payload) });
      assert.equal(blocked.status, 409);
      assert.equal((await blocked.json()).error, 'CODEX_SANDBOX_NOT_VERIFIED');

      const prepared = await fetch(url + '/v1/codex/prepare', { method: 'POST', headers, body: '{}' });
      assert.equal(prepared.status, 200);
      assert.equal((await prepared.json()).sandboxVerified, true);

      const status = await fetch(url + '/v1/codex/status', { headers: { Authorization: 'Bearer secret-token' } });
      const statusBody = await status.json();
      assert.equal(statusBody.state, 'ready');
      assert.equal(statusBody.sandboxVerified, true);

      const response = await fetch(url + '/v1/codex/chat', { method: 'POST', headers, body: JSON.stringify(payload) });
      assert.equal(response.status, 200);
      const result = await response.json();
      assert.equal(result.ok, true);
      assert.equal(result.sessionId, 'thread-test-123');
      assert.equal(result.content, 'Hello from isolated Codex chat.');
    }, { codexCommand: fake.command, codexPaths: profile.paths });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
    await rm(profile.root, { recursive: true, force: true });
  }
});

test('AURIX Codex paths keep the canary outside CODEX_HOME and the workspace inside it', () => {
  const paths = resolveCodexPaths({ HOME: '/home/tester', XDG_DATA_HOME: '/home/tester/.local/share' }, 'linux', '/home/tester');
  assert.equal(paths.platform, 'linux');
  assert.equal(paths.codexHome, '/home/tester/.local/share/aurix/Codex');
  assert.equal(paths.workspaceRoot, path.join(paths.codexHome, 'workspaces', 'chat'));
  assert.equal(paths.canaryRoot, '/home/tester/.local/share/aurix/SandboxCanary');
  assert.equal(paths.canaryRoot.startsWith(paths.codexHome + path.sep), false);
  assert.match(renderCodexProfileConfig(paths.workspaceRoot, 'linux'), /default_permissions = "aurix-chat-readonly"/);
});

test('Windows profile prefers MXC and uses elevated rather than the weaker unelevated fallback', () => {
  const config = renderCodexProfileConfig('/tmp/aurix-windows-workspace', 'win32');
  assert.ok(config.includes('[features]\nprefer_mxc = true'));
  assert.ok(config.includes('[windows]\nsandbox = "elevated"'));
  assert.doesNotMatch(config, /sandbox = "unelevated"/);
  assert.match(config, /enabled = false/);
});

test('AURIX creates and validates an immutable dedicated Codex profile', async () => {
  const profile = await makeCodexProfile();
  try {
    const result = await prepareCodexHome(profile.paths);
    assert.equal(result.ok, true);
    assert.equal(result.canaryRoot, profile.paths.canaryRoot);
    assert.equal((await validateCodexHome(profile.paths)).ok, true);
  } finally {
    await rm(profile.root, { recursive: true, force: true });
  }
});

test('AURIX refuses a modified profile config and never overwrites it', async () => {
  const profile = await makeCodexProfile();
  try {
    await prepareCodexHome(profile.paths);
    await writeFile(profile.paths.configPath, 'default_permissions = ":danger-full-access"');
    await assert.rejects(() => validateCodexHome(profile.paths), /changed outside AURIX/);
    await assert.rejects(() => prepareCodexHome(profile.paths), /changed outside AURIX/);
  } finally {
    await rm(profile.root, { recursive: true, force: true });
  }
});

test('AURIX upgrades only its exact v2 config to the platform-aware v3 profile', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'aurix-codex-v2-upgrade-'));
  const paths = resolveCodexPaths({ HOME: root, XDG_DATA_HOME: path.join(root, 'data') }, 'win32', root);
  const legacy = [
    'default_permissions = "aurix-chat-readonly"',
    '',
    '[permissions.aurix-chat-readonly]',
    'description = "AURIX isolated read-only chat profile"',
    'extends = ":read-only"',
    '',
    '[permissions.aurix-chat-readonly.workspace_roots]',
    JSON.stringify(paths.workspaceRoot) + ' = true',
    '',
    '[permissions.aurix-chat-readonly.filesystem]',
    '":root" = "deny"',
    '":minimal" = "read"',
    '":tmpdir" = "deny"',
    '":slash_tmp" = "deny"',
    '',
    '[permissions.aurix-chat-readonly.filesystem.":workspace_roots"]',
    '"." = "read"',
    '',
    '[permissions.aurix-chat-readonly.network]',
    'enabled = false',
    '',
  ].join('\n');
  try {
    await prepareCodexHome(paths);
    await writeFile(paths.configPath, legacy);
    await prepareCodexHome(paths);
    await validateCodexHome(paths);
    const upgraded = await readFile(paths.configPath, 'utf8');
    assert.match(upgraded, /prefer_mxc = true/);
    assert.match(upgraded, /sandbox = "elevated"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Codex system policy paths include requirements.toml for Windows and Unix', () => {
  assert.deepEqual(systemCodexConfigPaths({ ProgramData: 'D:\\ProgramData' }, 'win32'), [
    'D:\\ProgramData\\OpenAI\\Codex\\config.toml',
    'D:\\ProgramData\\OpenAI\\Codex\\requirements.toml',
  ]);
  assert.deepEqual(systemCodexConfigPaths({}, 'linux'), [
    '/etc/codex/config.toml',
    '/etc/codex/managed_config.toml',
    '/etc/codex/requirements.toml',
  ]);
});

test('legacy sandbox settings are detected in requirements and managed files', async () => {
  assert.equal(hasLegacySandboxSetting('sandbox_mode = "workspace-write"'), true);
  assert.equal(hasLegacySandboxSetting('[sandbox_workspace_write]\nnetwork_access = false'), true);
  assert.equal(hasLegacySandboxSetting('windows.require_mxc = true'), false);

  const profile = await makeCodexProfile();
  try {
    await prepareCodexHome(profile.paths);
    const managedPath = path.join(profile.paths.codexHome, 'managed_config.toml');
    await writeFile(managedPath, 'sandbox_mode = "workspace-write"\n');
    const result = await checkLegacySystemConfig(profile.paths, {}, process.platform, []);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'LEGACY_SYSTEM_SANDBOX_CONFIG');
  } finally {
    await rm(profile.root, { recursive: true, force: true });
  }
});

test('modern managed requirements remain eligible for the effective local sandbox canary', async () => {
  const profile = await makeCodexProfile();
  const requirements = path.join(profile.root, 'requirements.toml');
  try {
    await prepareCodexHome(profile.paths);
    await writeFile(requirements, 'windows.require_mxc = true\n');
    const result = await checkLegacySystemConfig(profile.paths, {}, process.platform, [requirements]);
    assert.equal(result.ok, true);
    assert.match(result.message, /included in the real Codex sandbox canary/);
  } finally {
    await rm(profile.root, { recursive: true, force: true });
  }
});

test('Codex sandbox arguments require the explicit profile and managed config', () => {
  const args = buildCodexSandboxArgs({
    platform: 'linux',
    profileName: 'aurix-chat-readonly',
    workspaceRoot: '/tmp/aurix-workspace',
    executable: '/usr/bin/node',
    executableArgs: ['-e', 'process.exit(0)'],
  });
  assert.deepEqual(args.slice(0, 2), ['sandbox', 'linux']);
  assert.ok(args.includes('--permission-profile'));
  assert.ok(args.includes('aurix-chat-readonly'));
  assert.ok(args.includes('--include-managed-config'));
  assert.ok(args.includes('--cd'));
  assert.ok(args.includes('/tmp/aurix-workspace'));
  assert.ok(args.includes('--'));
});

test('Windows sandbox argument construction refuses command shell shims', () => {
  assert.throws(() => buildCodexSandboxArgs({
    platform: 'win32',
    profileName: 'aurix-chat-readonly',
    workspaceRoot: '/tmp/aurix-workspace',
    executable: '/tmp/codex.cmd',
  }), /native Codex/);
});

test('profile preparation uses a separate CODEX_HOME and fails closed when the sandbox canary fails', async () => {
  const profile = await makeCodexProfile();
  const logPath = path.join(profile.root, 'sandbox-args.json');
  const fake = await makeFakeCodex(`
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') {
  if (!process.env.CODEX_HOME) process.exit(91);
  console.log('codex-cli 0.42.1'); process.exit(0);
}
if (args[0] === 'sandbox') {
  fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify(args));
  process.exit(77);
}
if (args[0] === 'login' && args[1] === 'status') { console.log('Not logged in'); process.exit(1); }
process.exit(2);
`);
  try {
    await withServer(async (url) => {
      const response = await fetch(url + '/v1/codex/prepare', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(response.status, 200);
      const result = await response.json() as {
        profilePrepared: boolean; sandboxVerified: boolean; profileName: string; code: string;
      };
      assert.equal(result.profilePrepared, true);
      assert.equal(result.sandboxVerified, false);
      assert.equal(result.profileName, 'aurix-chat-readonly');
      assert.equal(result.code, 'SANDBOX_CANARY_FAILED');
      const args = JSON.parse(await readFile(logPath, 'utf8')) as string[];
      assert.deepEqual(args.slice(0, 2), ['sandbox', process.platform === 'darwin' ? 'macos' : 'linux']);
      assert.ok(args.includes('--permission-profile'));
      assert.ok(args.includes('--include-managed-config'));
      assert.ok(args.includes(profile.paths.workspaceRoot));
      assert.ok(args.includes('--'));
      assert.match(args.at(-1) ?? '', /^\d+$/); // local loopback probe port is passed to the sandboxed canary
      const status = await getCodexStatus({ url, token: 'secret-token' });
      assert.equal(status.profilePrepared, true);
      assert.equal(status.state, 'needs_login');
    }, { codexCommand: fake.command, codexPaths: profile.paths });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
    await rm(profile.root, { recursive: true, force: true });
  }
});

test('profile preparation rejects malformed and oversized JSON without crashing the companion', async () => {
  await withServer(async (url) => {
    const malformed = await fetch(url + '/v1/codex/prepare', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error, 'INVALID_REQUEST');

    const oversized = await fetch(url + '/v1/codex/prepare', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ padding: 'x'.repeat(5000) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal((await oversized.json()).error, 'INVALID_REQUEST');

    const health = await fetch(url + '/v1/health', {
      headers: { Authorization: 'Bearer secret-token' },
    });
    assert.equal(health.status, 200);
  });
});

test('probe connects with the correct token and reports only implemented capabilities', async () => {
  await withServer(async (url) => {
    const status = await probeCompanion({ url, token: 'secret-token' });
    assert.equal(status.state, 'connected');
    assert.deepEqual(status.health?.capabilities, ['health', 'cli.codex.status', 'cli.codex.login', 'cli.codex.profile.prepare', 'cli.codex.sandbox.verify', 'cli.codex.chat', 'cli.codex.agent', 'rea.status', 'rea.javascript.analyze', 'rea.desktop.inspect', 'rea.android.inspect']);
    assert.deepEqual(status.health?.grantedRoots, []);
  });
});


test('REA companion analyses only a directory inside an explicitly approved root', async () => {
  if (process.platform === 'win32') return;
  const root = await mkdtemp(path.join(os.tmpdir(), 'aurix-rea-root-'));
  const target = path.join(root, 'sample-app');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(target));
  const fake = await makeFakeCodex(`
const args = process.argv.slice(2);
if (args[0] === '--help') { console.log('rea-agents help'); process.exit(0); }
if (args[0] === 'analyze-javascript-application' && args[2] === '--json') {
  console.log(JSON.stringify({ findings: [{ claim: 'Sample application has a module entry point', evidence: [{ id: 'src/main.js', description: 'Entry module' }] }], unknowns: [] }));
  process.exit(0);
}
process.exit(2);
`);
  try {
    await withServer(async (url) => {
      const status = await fetch(url + '/v1/rea/status', { headers: { Authorization: 'Bearer secret-token' } });
      assert.equal(status.status, 200);
      assert.equal((await status.json()).available, true);
      const response = await fetch(url + '/v1/rea/analyze', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ target }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.result.report.findings.length, 1);
      const outside = await fetch(url + '/v1/rea/analyze', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: os.tmpdir() }),
      });
      assert.equal(outside.status, 400);
      assert.match((await outside.json()).message, /outside the folders explicitly approved/);
    }, { reaCommand: fake.command, reaRoots: [root] });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('REA desktop inspection uses its fixed command and the same approved-root boundary', async () => {
  if (process.platform === 'win32') return;
  const root = await mkdtemp(path.join(os.tmpdir(), 'aurix-rea-desktop-root-'));
  const target = path.join(root, 'installed-app');
  await import('node:fs/promises').then(({ mkdir }) => mkdir(target));
  const fake = await makeFakeCodex(`
const args = process.argv.slice(2);
if (args[0] === '--help') { console.log('rea-agents help'); process.exit(0); }
if (args[0] === 'inspect-desktop-application' && args[2] === '--json') {
  console.log(JSON.stringify({ normalized_result: { candidates: [{ family: 'electron', supporting_paths: ['resources/app.asar'] }] } }));
  process.exit(0);
}
process.exit(2);
`);
  try {
    await withServer(async (url) => {
      const response = await fetch(url + '/v1/rea/analyze', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, kind: 'desktop' }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.result.report.normalized_result.candidates[0].family, 'electron');
    }, { reaCommand: fake.command, reaRoots: [root] });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('REA JavaScript analysis accepts an ASAR file inside an explicitly approved root', async () => {
  if (process.platform === 'win32') return;
  const root = await mkdtemp(path.join(os.tmpdir(), 'aurix-rea-asar-root-'));
  const target = path.join(root, 'sample-app.asar');
  await writeFile(target, 'test archive placeholder');
  const fake = await makeFakeCodex(`
const args = process.argv.slice(2);
if (args[0] === '--help') { console.log('rea-agents help'); process.exit(0); }
if (args[0] === 'analyze-javascript-application' && args[2] === '--json') {
  console.log(JSON.stringify({ graph: { nodes: [], edges: [] }, limitations: [] }));
  process.exit(0);
}
process.exit(2);
`);
  try {
    await withServer(async (url) => {
      const response = await fetch(url + '/v1/rea/analyze', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, kind: 'javascript' }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.result.target, target);
    }, { reaCommand: fake.command, reaRoots: [root] });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('REA Android APK inspection uses a fixed static command and approved file roots', async () => {
  if (process.platform === 'win32') return;
  const root = await mkdtemp(path.join(os.tmpdir(), 'aurix-rea-apk-root-'));
  const target = path.join(root, 'sample.apk');
  await writeFile(target, 'test apk placeholder');
  const fake = await makeFakeCodex(`
const args = process.argv.slice(2);
if (args[0] === '--help') { console.log('rea-agents help'); process.exit(0); }
if (args[0] === 'inspect-android-package' && args[2] === '--json') {
  console.log(JSON.stringify({ normalized_result: { package: 'example.test', manifest: { components: [] }, coverage: { status: 'complete' } } }));
  process.exit(0);
}
process.exit(2);
`);
  try {
    await withServer(async (url) => {
      const response = await fetch(url + '/v1/rea/analyze', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ target, kind: 'android' }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.result.report.normalized_result.package, 'example.test');
      const outside = await fetch(url + '/v1/rea/analyze', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: os.tmpdir() + path.sep + 'outside.apk', kind: 'android' }),
      });
      assert.equal(outside.status, 400);
    }, { reaCommand: fake.command, reaRoots: [root] });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
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

test('Codex status returns only parsed sign-in data from the separate AURIX profile', async () => {
  const fake = await makeFakeCodex(`
const args = process.argv.slice(2);
if (args[0] === '--version') {
  if (!process.env.CODEX_HOME) process.exit(90);
  console.log('codex-cli 0.42.1'); process.exit(0);
}
if (args[0] === 'login' && args[1] === 'status') {
  console.log('Logged in using ChatGPT. access_token=do-not-return-this-value');
  process.exit(0);
}
process.exit(2);
`);
  const profile = await makeCodexProfile();
  await prepareCodexHome(profile.paths);
  try {
    await withServer(async (url) => {
      const status = await getCodexStatus({ url, token: 'secret-token' });
      assert.equal(status.state, 'ready');
      assert.equal(status.installed, true);
      assert.equal(status.signedIn, true);
      assert.equal(status.version, '0.42.1');
      assert.equal(status.authMode, 'chatgpt');
      assert.equal(status.profilePrepared, true);
      assert.equal(status.profileName, 'aurix-chat-readonly');
      assert.equal(JSON.stringify(status).includes('do-not-return-this-value'), false);
    }, { codexCommand: fake.command, codexPaths: profile.paths });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
    await rm(profile.root, { recursive: true, force: true });
  }
});

test('Codex status truthfully reports a missing CLI in the dedicated profile', async () => {
  const profile = await makeCodexProfile();
  await prepareCodexHome(profile.paths);
  try {
    await withServer(async (url) => {
      const status = await getCodexStatus({ url, token: 'secret-token' });
      assert.equal(status.state, 'missing');
      assert.equal(status.installed, false);
      assert.equal(status.signedIn, false);
      assert.equal(status.profilePrepared, true);
    }, { codexCommand: path.join(os.tmpdir(), 'missing-aurix-codex-binary'), codexPaths: profile.paths });
  } finally {
    await rm(profile.root, { recursive: true, force: true });
  }
});

test('official sign-in handoff starts only inside the prepared AURIX profile', async () => {
  const profile = await makeCodexProfile();
  const loginDone = path.join(profile.root, 'login-done');
  const fake = await makeFakeCodex(`
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('codex-cli 0.42.1'); process.exit(0); }
if (args[0] === 'login' && args[1] === 'status') { console.log('Not logged in'); process.exit(1); }
if (args[0] === 'login') {
  if (!process.env.CODEX_HOME) process.exit(90);
  require('node:fs').writeFileSync(${JSON.stringify(loginDone)}, 'done');
  console.log('Starting official sign-in'); process.exit(0);
}
process.exit(2);
`);
  await prepareCodexHome(profile.paths);
  try {
    await withServer(async (url) => {
      const message = await startCodexLogin({ url, token: 'secret-token' });
      assert.match(message, /separate profile/);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        try { await readFile(loginDone, 'utf8'); break; }
        catch { await new Promise((resolve) => setTimeout(resolve, 25)); }
      }
      assert.equal(await readFile(loginDone, 'utf8'), 'done');
    }, { codexCommand: fake.command, codexPaths: profile.paths });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
    await rm(profile.root, { recursive: true, force: true });
  }
});


test('OpenAI adapter exposes profile sign-in but no task capability before execution is approved', async () => {
  const fake = await makeFakeCodex(`
const args = process.argv.slice(2);
if (args[0] === '--version') { console.log('codex-cli 0.42.1'); process.exit(0); }
if (args[0] === 'login' && args[1] === 'status') { console.log('Logged in using ChatGPT'); process.exit(0); }
process.exit(2);
`);
  const profile = await makeCodexProfile();
  await prepareCodexHome(profile.paths);
  try {
    await withServer(async (url) => {
      const adapter = new OpenAiAdapter();
      adapter.setCompanionConfigProvider(() => ({ url, token: 'secret-token' }));
      const status = await adapter.getStatus();
      assert.equal(status.state, 'connected');
      assert.equal(status.implementation, 'implemented_untested');
      assert.match(status.detail ?? '', /task execution remains disabled/i);
      assert.deepEqual(await adapter.getCapabilities(), []);
    }, { codexCommand: fake.command, codexPaths: profile.paths });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
    await rm(profile.root, { recursive: true, force: true });
  }
});
