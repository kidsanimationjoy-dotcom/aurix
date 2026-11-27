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
  options: { codexCommand?: string; codexPaths?: ReturnType<typeof resolveCodexPaths>; reaCommand?: string; reaRoots?: string[]; codexRoots?: string[]; higgsfieldCommand?: string } = {},
): Promise<T> {
  const server = createCompanionServer({
    token: 'secret-token',
    origin: 'http://localhost:5173',
    ...(options.codexCommand ? { codexCommand: options.codexCommand } : {}),
    ...(options.codexPaths ? { codexPaths: options.codexPaths } : {}),
    ...(options.reaCommand ? { reaCommand: options.reaCommand } : {}),
    ...(options.reaRoots ? { reaRoots: options.reaRoots } : {}),
    ...(options.codexRoots ? { codexRoots: options.codexRoots } : {}),
    ...(options.higgsfieldCommand ? { higgsfieldCommand: options.higgsfieldCommand } : {}),
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
if (args[0] === 'sandbox') {
  const separator = args.indexOf('--');
  if (separator >= 0 && args[separator + 2] === 'exec') {
    const profileIndex = args.indexOf('--permission-profile');
    if (profileIndex < 0 || args[profileIndex + 1] !== 'aurix-chat-readonly') process.exit(21);
    if (!args.includes('--include-managed-config') || !args.includes('--cd')) process.exit(22);
    if (!args.includes('--ephemeral') || !args.includes('--json')) process.exit(23);
    if (args.includes('--sandbox') || Object.hasOwn(process.env, 'OPENAI_API_KEY')) process.exit(24);
    console.log(JSON.stringify({ type: 'thread.started', thread_id: 'thread-test-123' }));
    console.log(JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Hello from isolated Codex chat.' } }));
    process.exit(0);
  }
  console.log('AURIX_SANDBOX_CANARY_OK');
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
    assert.deepEqual(status.health?.capabilities, ['health', 'cli.codex.status', 'cli.codex.login', 'cli.codex.profile.prepare', 'cli.codex.sandbox.verify', 'cli.codex.chat', 'cli.codex.agent', 'rea.status', 'rea.javascript.analyze', 'rea.desktop.inspect', 'rea.android.inspect', 'rea.browser.targets', 'rea.browser.inspect', 'higgsfield.login', 'higgsfield.status', 'higgsfield.models', 'higgsfield.quote', 'higgsfield.generate', 'higgsfield.job']);
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



test('Higgsfield local OAuth bridge discovers models and requires a fresh confirmed credit quote before job creation', async () => {
  if (process.platform === 'win32') return;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aurix-higgsfield-fake-'));
  const command = path.join(directory, 'higgsfield');
  const logPath = path.join(directory, 'calls.txt');
  const script = `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
const log = (value) => fs.appendFileSync(${JSON.stringify(logPath)}, value + '\\n');
if (process.env.OPENAI_API_KEY || process.env.HIGGSFIELD_API_KEY || process.env.HF_API_KEY) process.exit(90);
if (args[0] === 'version' && args.includes('--json')) { console.log(JSON.stringify({ version: '1.2.2' })); process.exit(0); }
if (args[0] === 'account' && args[1] === 'status' && args.includes('--json')) { console.log(JSON.stringify({ email: 'user@example.test', plan: 'Creator', available_credits: 120 })); process.exit(0); }
if (args[0] === 'model' && args[1] === 'list' && args.includes('--json')) {
  console.log(JSON.stringify({ models: [{ job_set_type: 'seedance_2_0', name: 'Seedance 2.0', categories: ['video'] }, { job_set_type: 'gpt_image_2_5', name: 'GPT Image 2.5', categories: ['image'] }] }));
  process.exit(0);
}
if (args[0] === 'generate' && args[1] === 'cost') {
  if (args[2] === 'seedance_2_0') {
    if (!args.includes('--mode') || args[args.indexOf('--mode') + 1] !== 'std') process.exit(91);
  } else if (args[2] === 'gpt_image_2_5') {
    if (!args.includes('--quality') || args[args.indexOf('--quality') + 1] !== 'high' || !args.includes('--variant') || args[args.indexOf('--variant') + 1] !== 'flare') process.exit(93);
  } else process.exit(94);
  if (!args.includes('--json') || !args.includes('--prompt') || args.includes('--wait')) process.exit(91);
  log('cost');
  console.log(JSON.stringify({ estimated_credits: args[2] === 'gpt_image_2_5' ? 6 : 10 }));
  process.exit(0);
}
if (args[0] === 'generate' && args[1] === 'create') {
  if (args[2] === 'seedance_2_0' && (!args.includes('--mode') || args[args.indexOf('--mode') + 1] !== 'std')) process.exit(92);
  if (args[2] === 'gpt_image_2_5' && (!args.includes('--quality') || args[args.indexOf('--quality') + 1] !== 'high' || !args.includes('--variant') || args[args.indexOf('--variant') + 1] !== 'flare')) process.exit(95);
  if (!args.includes('--json') || args.includes('--wait')) process.exit(92);
  log('create');
  console.log(JSON.stringify({ job_id: args[2] === 'gpt_image_2_5' ? 'job-image-abc' : 'job-abc', status: 'queued' }));
  process.exit(0);
}
if (args[0] === 'generate' && args[1] === 'get' && args[2] === 'job-abc') {
  console.log(JSON.stringify({ id: 'job-abc', status: 'completed', result_url: 'https://media.example.test/output.mp4' }));
  process.exit(0);
}
if (args[0] === 'generate' && args[1] === 'get' && args[2] === 'job-image-abc') {
  console.log(JSON.stringify({ id: 'job-image-abc', status: 'completed', image_url: 'https://media.example.test/output.png' }));
  process.exit(0);
}
process.exit(2);
`;
  await writeFile(command, script);
  await chmod(command, 0o700);
  try {
    await withServer(async (url) => {
      const headers = { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' };
      const status = await fetch(url + '/v1/higgsfield/status', { headers: { Authorization: 'Bearer secret-token' } });
      assert.equal(status.status, 200);
      const account = (await status.json()).result;
      assert.equal(account.signedIn, true);
      assert.equal(account.account.available_credits, 120);

      const modelsResponse = await fetch(url + '/v1/higgsfield/models', { headers: { Authorization: 'Bearer secret-token' } });
      assert.equal(modelsResponse.status, 200);
      const models = (await modelsResponse.json()).result.models;
      assert.equal(models[0].id, 'seedance_2_0');
      assert.equal(models[1].id, 'gpt_image_2_5');

      const quoted = await fetch(url + '/v1/higgsfield/quote', {
        method: 'POST', headers,
        body: JSON.stringify({ modelId: 'seedance_2_0', prompt: 'A sunrise over a calm ocean', duration: 5, resolution: '720p', aspectRatio: '16:9' }),
      });
      assert.equal(quoted.status, 200);
      const quote = (await quoted.json()).result;
      assert.equal(quote.raw.estimated_credits, 10);
      assert.ok(quote.quoteId);

      const refused = await fetch(url + '/v1/higgsfield/create', {
        method: 'POST', headers, body: JSON.stringify({ quoteId: quote.quoteId, confirmed: false }),
      });
      assert.equal(refused.status, 409);
      assert.match((await refused.json()).message, /explicit confirmation/);
      assert.equal((await readFile(logPath, 'utf8')).includes('create'), false);

      const created = await fetch(url + '/v1/higgsfield/create', {
        method: 'POST', headers, body: JSON.stringify({ quoteId: quote.quoteId, confirmed: true }),
      });
      assert.equal(created.status, 202);
      const job = (await created.json()).result;
      assert.equal(job.jobId, 'job-abc');

      const polled = await fetch(url + '/v1/higgsfield/job?id=job-abc', {
        headers: { Authorization: 'Bearer secret-token' },
      });
      assert.equal(polled.status, 200);
      assert.equal((await polled.json()).result.status, 'completed');

      const calls = (await readFile(logPath, 'utf8')).trim().split(/\r?\n/u);
      assert.deepEqual(calls, ['cost', 'cost', 'create']);

      const imageQuoted = await fetch(url + '/v1/higgsfield/quote', {
        method: 'POST', headers,
        body: JSON.stringify({ kind: 'image', modelId: 'gpt_image_2_5', prompt: 'A detailed blue robot mascot', resolution: '2k', aspectRatio: '1:1', quality: 'high', variant: 'flare' }),
      });
      assert.equal(imageQuoted.status, 200);
      const imageQuote = (await imageQuoted.json()).result;
      assert.equal(imageQuote.kind, 'image');
      assert.equal(imageQuote.raw.estimated_credits, 6);

      const imageRefused = await fetch(url + '/v1/higgsfield/create', {
        method: 'POST', headers, body: JSON.stringify({ quoteId: imageQuote.quoteId, confirmed: false }),
      });
      assert.equal(imageRefused.status, 409);
      assert.equal((await readFile(logPath, 'utf8')).trim().split(/\\r?\\n/u).filter((line) => line === 'create').length, 1);

      const imageCreated = await fetch(url + '/v1/higgsfield/create', {
        method: 'POST', headers, body: JSON.stringify({ quoteId: imageQuote.quoteId, confirmed: true }),
      });
      assert.equal(imageCreated.status, 202);
      const imageJob = (await imageCreated.json()).result;
      assert.equal(imageJob.jobId, 'job-image-abc');

      const imagePolled = await fetch(url + '/v1/higgsfield/job?id=job-image-abc', {
        headers: { Authorization: 'Bearer secret-token' },
      });
      assert.equal(imagePolled.status, 200);
      assert.equal((await imagePolled.json()).result.image_url, 'https://media.example.test/output.png');

      const allCalls = (await readFile(logPath, 'utf8')).trim().split(/\\r?\\n/u);
      assert.deepEqual(allCalls, ['cost', 'cost', 'create', 'cost', 'cost', 'create']);
    }, { higgsfieldCommand: command });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('REA browser inspection is loopback-only, requires authorisation, and uses fixed passive commands', async () => {
  if (process.platform === 'win32') return;
  const endpoint = 'http://127.0.0.1:9222';
  const targetId = 'page-target-01';
  const fake = await makeFakeCodex(`
const args = process.argv.slice(2);
if (args[0] === '--help') { console.log('rea-agents help'); process.exit(0); }
if (args[0] === 'list-browser-targets' && args[1] === 'http://127.0.0.1:9222' && args[2] === '--json') {
  console.log(JSON.stringify({ normalized_result: { browser: { product: 'Chrome', version: 'test' }, targets: [{ target_id: 'page-target-01', type: 'page', title: 'Local test app', url: 'http://localhost:5173/', origin: 'http://localhost:5173' }], excluded: { disallowed_origin: 0, unsupported_url: 0, non_page: 0 }, limitations: [] } }));
  process.exit(0);
}
if (args[0] === 'inspect-web-page' && args[1] === 'http://127.0.0.1:9222' && args[2] === 'page-target-01' && args.includes('--observation-ms') && args.includes('500') && args.includes('--json')) {
  console.log(JSON.stringify({ normalized_result: { target: { title: 'Local test app', url: 'http://localhost:5173/' }, completeness: { status: 'complete' }, dom: { node_count: 12 }, accessibility: { total_nodes: 8 }, limitations: [] } }));
  process.exit(0);
}
if (args[0] === 'analyze-web-bundle' && args[1] === 'http://127.0.0.1:9222' && args[2] === 'page-target-01' && args.includes('--json')) {
  console.log(JSON.stringify({ normalized_result: { capture: { target_url: 'http://localhost:5173/', scripts_observed: 3, scripts_analyzed: 3 }, observations: { chunks: { nodes: [], edges: [] }, routes: [], endpoints: [], webmcp_declarations: [], source_maps: {} }, unknowns: [], completeness: { status: 'complete' }, limitations: [] } }));
  process.exit(0);
}
process.exit(2);
`);
  const authorization = { statement: 'I own or have permission to inspect this local browser session.', confirmedAt: Date.now() };
  try {
    await withServer(async (url) => {
      const headers = { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' };
      const denied = await fetch(url + '/v1/rea/browser/targets', {
        method: 'POST', headers, body: JSON.stringify({ endpoint }),
      });
      assert.equal(denied.status, 403);
      assert.equal((await denied.json()).error, 'AUTHORIZATION_REQUIRED');

      const discovered = await fetch(url + '/v1/rea/browser/targets', {
        method: 'POST', headers, body: JSON.stringify({ endpoint, authorization }),
      });
      assert.equal(discovered.status, 200);
      const targetBody = await discovered.json();
      assert.equal(targetBody.ok, true);
      assert.equal(targetBody.result.report.normalized_result.targets[0].target_id, targetId);

      const inspected = await fetch(url + '/v1/rea/browser/inspect', {
        method: 'POST', headers, body: JSON.stringify({ endpoint, targetId, kind: 'page', authorization }),
      });
      assert.equal(inspected.status, 200);
      const pageBody = await inspected.json();
      assert.equal(pageBody.ok, true);
      assert.equal(pageBody.result.report.normalized_result.dom.node_count, 12);

      const bundle = await fetch(url + '/v1/rea/browser/inspect', {
        method: 'POST', headers, body: JSON.stringify({ endpoint, targetId, kind: 'bundle', authorization }),
      });
      assert.equal(bundle.status, 200);
      const bundleBody = await bundle.json();
      assert.equal(bundleBody.ok, true);
      assert.equal(bundleBody.result.report.normalized_result.capture.scripts_analyzed, 3);

      const remote = await fetch(url + '/v1/rea/browser/targets', {
        method: 'POST', headers, body: JSON.stringify({ endpoint: 'http://example.com:9222', authorization }),
      });
      assert.equal(remote.status, 400);
      assert.ok((await remote.json()).message.includes('127.0.0.1'));
    }, { reaCommand: fake.command });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
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


test('Codex project agent refuses to start until the local sandbox is freshly verified', async () => {
  const profile = await makeCodexProfile();
  const root = await mkdtemp(path.join(os.tmpdir(), 'aurix-codex-agent-allowlist-'));
  try {
    await withServer(async (url) => {
      const response = await fetch(url + '/v1/codex/agent/start', {
        method: 'POST',
        headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: root, prompt: 'Inspect the project safely.' }),
      });
      assert.equal(response.status, 409);
      assert.equal((await response.json()).error, 'CODEX_SANDBOX_NOT_VERIFIED');
    }, { codexPaths: profile.paths, codexRoots: [root] });
  } finally {
    await rm(profile.root, { recursive: true, force: true });
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
      assert.match(status.detail ?? '', /sandbox/i);
      assert.deepEqual(await adapter.getCapabilities(), []);
    }, { codexCommand: fake.command, codexPaths: profile.paths });
  } finally {
    await rm(fake.directory, { recursive: true, force: true });
    await rm(profile.root, { recursive: true, force: true });
  }
});
