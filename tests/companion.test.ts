import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, chmod, rm, readdir, lstat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createCompanionServer } from '../companion/server.mjs';
import { getCodexStatus, isLoopbackCompanionUrl, probeCompanion, startCodexLogin } from '../src/companion/client';
import type { TaskExecutionContext, TaskExecutionRequest } from '../src/tasks/types';
import { OpenAiAdapter } from '../src/adapters/openai';
import { routeTask } from '../src/router/providerRouter';
import { checkLegacySystemConfig, hasLegacySandboxSetting, prepareCodexHome, renderCodexProfileConfig, resolveCodexPaths, validateCodexHome, buildCodexSandboxArgs, systemCodexConfigPaths } from '../companion/codex-profile.mjs';

async function withServer<T>(
  fn: (url: string) => Promise<T>,
  options: { codexCommand?: string; codexPaths?: ReturnType<typeof resolveCodexPaths> } = {},
): Promise<T> {
  const server = createCompanionServer({
    token: 'secret-token',
    origin: 'http://localhost:5173',
    ...(options.codexCommand ? { codexCommand: options.codexCommand } : {}),
    ...(options.codexPaths ? { codexPaths: options.codexPaths } : {}),
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

test('probe connects with the correct token and reports only implemented capabilities', async () => {
  await withServer(async (url) => {
    const status = await probeCompanion({ url, token: 'secret-token' });
    assert.equal(status.state, 'connected');
    assert.deepEqual(status.health?.capabilities, ['health', 'cli.codex.status', 'cli.codex.login', 'cli.codex.profile.prepare', 'cli.codex.sandbox.verify', 'cli.codex.chat.readonly']);
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
    assert.equal(post.status, 400);
    assert.deepEqual(await post.json(), { error: 'INVALID_REQUEST', message: 'A valid task ID and a prompt of 1 to 9,000 characters are required.' });
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


test('Codex exposes read-only chat only after a successful local sandbox check', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Fake CLI uses a POSIX shebang; Windows sandbox must be tested with the native Codex executable.');
    return;
  }
  const profile = await makeCodexProfile();
  const executionLog = path.join(profile.root, 'read-only-chat.json');
  const fake = await makeFakeCodex(`
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('codex-cli 0.42.1');
  process.exit(0);
}
if (args[0] === 'login' && args[1] === 'status') {
  console.log('Logged in using ChatGPT');
  process.exit(0);
}
if (args[0] === 'sandbox') {
  console.log('AURIX_SANDBOX_CANARY_OK');
  process.exit(0);
}
if (args[0] === 'exec') {
  let prompt = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { prompt += chunk; });
  process.stdin.on('end', () => {
    fs.writeFileSync(${JSON.stringify(executionLog)}, JSON.stringify({
      args,
      prompt,
      apiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
    }));
    const emit = event => process.stdout.write(JSON.stringify(event) + '\\n');
    emit({ type: 'thread.started', thread_id: 'fake-thread' });
    emit({ type: 'item.completed', item: { type: 'agent_message', text: 'A read-only answer from fake Codex.' } });
    emit({ type: 'turn.completed' });
  });
  process.exitCode = 0;
  return;
}
process.exit(2);
`);
  try {
    await prepareCodexHome(profile.paths);
    await withServer(async (url) => {
      const prepare = await fetch(url + '/v1/codex/prepare', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
        body: '{}',
      });
      assert.equal(prepare.status, 200);
      const prepared = await prepare.json() as { sandboxVerified: boolean; version: string | null };
      assert.equal(prepared.sandboxVerified, true);
      assert.equal(prepared.version, '0.42.1');

      const adapter = new OpenAiAdapter();
      adapter.setCompanionConfigProvider(() => ({ url, token: 'secret-token' }));
      const status = await getCodexStatus({ url, token: 'secret-token' });
      assert.equal(status.sandboxVerified, true);
      assert.deepEqual(await adapter.getCapabilities(), []);
      assert.deepEqual(await adapter.getTaskCapabilities(), ['chat']);
      assert.equal((await routeTask([adapter], { kind: 'chat', preferred: 'openai' })).ok, false);
      assert.equal((await routeTask([adapter], { kind: 'chat', preferred: 'openai', execution: true })).ok, true);

      const emitted: string[] = [];
      const request: TaskExecutionRequest = {
        taskId: 'task_readonly_chat',
        projectId: null,
        prompt: 'Explain how a simple gear train works.',
        intent: 'chat',
        plan: [],
      };
      const context: TaskExecutionContext = {
        signal: new AbortController().signal,
        emitProgress: async () => undefined,
        emitOutput: async (delta) => { emitted.push(delta); },
      };
      const result = await adapter.executeTask(request, context);
      assert.equal(result.output, 'A read-only answer from fake Codex.');
      assert.deepEqual(emitted, ['A read-only answer from fake Codex.']);

      const log = JSON.parse(await readFile(executionLog, 'utf8')) as {
        args: string[];
        prompt: string;
        apiKeyPresent: boolean;
      };
      assert.match(log.prompt, /AURIX read-only chat mode/);
      assert.match(log.prompt, /User request:/);
      assert.match(log.prompt, /Explain how a simple gear train works/);
      assert.equal(log.apiKeyPresent, false);
      assert.ok(log.args.includes('--json'));
      assert.ok(log.args.includes('--ephemeral'));
      assert.ok(log.args.includes('default_permissions=aurix-chat-readonly'));
      assert.equal(log.args.includes('--dangerously-bypass-approvals-and-sandbox'), false);
      assert.equal(log.args.includes('--add-dir'), false);
      assert.equal(log.args.includes(request.prompt), false);
      const cdIndex = log.args.indexOf('--cd');
      assert.ok(cdIndex >= 0);
      const taskWorkspace = log.args[cdIndex + 1]!;
      const relativeWorkspace = path.relative(profile.paths.workspaceRoot, taskWorkspace);
      assert.ok(relativeWorkspace.length > 0 && !relativeWorkspace.startsWith('..') && !path.isAbsolute(relativeWorkspace));
      await assert.rejects(lstat(taskWorkspace), { code: 'ENOENT' });
      assert.deepEqual(await readdir(profile.paths.workspaceRoot), []);

      // The next request must be denied if the supposedly empty chat root has unexpected data.
      await rm(executionLog, { force: true });
      await writeFile(path.join(profile.paths.workspaceRoot, 'unexpected-note.txt'), 'private local note');
      const denied = await fetch(url + '/v1/codex/exec', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: 'task_unexpected_data', prompt: 'Summarize the note.' }),
      });
      assert.equal(denied.status, 409);
      const deniedBody = await denied.json() as { error: string; message: string };
      assert.equal(deniedBody.error, 'CODEX_CHAT_WORKSPACE_NOT_EMPTY');
      assert.match(deniedBody.message, /No prompt was sent to Codex/);
      await assert.rejects(readFile(executionLog, 'utf8'), { code: 'ENOENT' });
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
      assert.match(status.detail ?? '', /local sandbox check in Settings/i);
      assert.deepEqual(await adapter.getTaskCapabilities(), []);
      assert.deepEqual(await adapter.getCapabilities(), []);
    }, { codexCommand: fake.command, codexPaths: profile.paths });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
    await rm(profile.root, { recursive: true, force: true });
  }
});
