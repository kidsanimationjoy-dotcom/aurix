import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, chmod, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildCodexExecArgs,
  createCodexExecManager,
} from '../companion/codex-exec.mjs';

async function makeTempRoot() {
  return mkdtemp(path.join(os.tmpdir(), 'aurix-codex-exec-'));
}

async function makeFakeCodex(root: string, script: string) {
  const command = path.join(root, 'codex');
  await writeFile(command, '#!/usr/bin/env node\n' + script, 'utf8');
  await chmod(command, 0o700);
  return command;
}

async function waitUntil(predicate: () => boolean, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for the fake Codex process.');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function safeEnv(root: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '',
    HOME: root,
    CODEX_HOME: path.join(root, 'codex-home'),
    TEMP: root,
    TMP: root,
  };
}

test('Codex exec args are fixed, read-only-profile scoped and non-interactive', () => {
  const workspaceRoot = path.join(os.tmpdir(), 'aurix-chat-workspace');
  const args = buildCodexExecArgs({
    workspaceRoot,
    profileName: 'aurix-chat-readonly',
  });
  assert.deepEqual(args, [
    'exec',
    '--json',
    '--strict-config',
    '--ephemeral',
    '--skip-git-repo-check',
    '--cd', path.resolve(workspaceRoot),
    '--ask-for-approval', 'never',
    '--config', 'default_permissions=aurix-chat-readonly',
    '-',
  ]);
  assert.equal(args.includes('--dangerously-bypass-approvals-and-sandbox'), false);
  assert.equal(args.includes('--yolo'), false);
  assert.equal(args.includes('--add-dir'), false);
  assert.throws(() => buildCodexExecArgs({
    workspaceRoot: 'relative/workspace',
    profileName: 'aurix-chat-readonly',
  }), /absolute/);
  assert.throws(() => buildCodexExecArgs({
    workspaceRoot: '/tmp/workspace',
    profileName: 'invalid profile',
  }), /profile/);
});

test('Codex exec manager reads the prompt from stdin and returns only the final assistant message', async (t) => {
  if (process.platform === 'win32') { t.skip('Fake Codex uses a POSIX shebang.'); return; }
  const root = await makeTempRoot();
  const logPath = path.join(root, 'exec-log.json');
  const command = await makeFakeCodex(root, `
const fs = require('node:fs');
const args = process.argv.slice(2);
let prompt = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => { prompt += chunk; });
process.stdin.on('end', () => {
  fs.writeFileSync(${JSON.stringify(logPath)}, JSON.stringify({
    args,
    prompt,
    openAiKeyPresent: Boolean(process.env.OPENAI_API_KEY),
  }));
  const emit = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
  emit({ type: 'thread.started', thread_id: 'fake-thread' });
  emit({ type: 'item.completed', item: { type: 'agent_message', text: 'Fake Codex reply' } });
  emit({ type: 'turn.completed' });
});
`);
  try {
    const workspaceRoot = path.join(root, 'workspace');
    await (await import('node:fs/promises')).mkdir(workspaceRoot);
    const manager = createCodexExecManager({ platform: 'linux', timeoutMs: 5000 });
    const result = await manager.run({
      taskId: 'task_success',
      command,
      workspaceRoot,
      profileName: 'aurix-chat-readonly',
      prompt: 'Explain a simple gear train.',
      env: { ...safeEnv(root), OPENAI_API_KEY: 'must-not-be-inherited' },
    });
    const log = JSON.parse(await readFile(logPath, 'utf8')) as {
      args: string[];
      prompt: string;
      openAiKeyPresent: boolean;
    };
    assert.equal(result.output, 'Fake Codex reply');
    assert.equal(log.prompt, 'Explain a simple gear train.\n');
    assert.equal(log.openAiKeyPresent, false, 'the exec manager strips any accidentally inherited API key');
    assert.ok(log.args.includes('--json'));
    assert.ok(log.args.includes('--ephemeral'));
    assert.ok(log.args.includes('--strict-config'));
    assert.ok(log.args.includes('--ask-for-approval'));
    assert.ok(log.args.includes('never'));
    assert.ok(log.args.includes('-'));
    assert.equal(log.args.includes('Explain a simple gear train.'), false);
    assert.equal(manager.size(), 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Codex exec manager blocks cancellation before process launch', async (t) => {
  if (process.platform === 'win32') { t.skip('Fake Codex uses a POSIX shebang.'); return; }
  const root = await makeTempRoot();
  const marker = path.join(root, 'was-launched');
  const command = await makeFakeCodex(root, `
require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'launched');
process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');
`);
  try {
    const workspaceRoot = path.join(root, 'workspace');
    await (await import('node:fs/promises')).mkdir(workspaceRoot);
    const manager = createCodexExecManager({ platform: 'linux', timeoutMs: 3000 });
    assert.equal(await manager.cancel('task_cancel_first'), true);
    await assert.rejects(
      manager.run({
        taskId: 'task_cancel_first',
        command,
        workspaceRoot,
        profileName: 'aurix-chat-readonly',
        prompt: 'Do not run.',
        env: safeEnv(root),
      }),
      (error: NodeJS.ErrnoException) => error.code === 'CODEX_TASK_CANCELLED',
    );
    await assert.rejects(readFile(marker, 'utf8'), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Codex exec manager cancellation waits until the local process tree has stopped', async (t) => {
  if (process.platform === 'win32') {
    t.skip('This fake executable uses a POSIX shebang; Windows native process cancellation is tested on a real .exe.');
    return;
  }
  const root = await makeTempRoot();
  const command = await makeFakeCodex(root, `
process.on('SIGTERM', () => process.exit(0));
process.stdin.resume();
setInterval(() => {}, 1000);
`);
  try {
    const workspaceRoot = path.join(root, 'workspace');
    await (await import('node:fs/promises')).mkdir(workspaceRoot);
    const manager = createCodexExecManager({ platform: 'linux', timeoutMs: 5000 });
    const running = manager.run({
      taskId: 'task_cancel_live',
      command,
      workspaceRoot,
      profileName: 'aurix-chat-readonly',
      prompt: 'This process should be stopped.',
      env: safeEnv(root),
    });
    await waitUntil(() => manager.has('task_cancel_live'));
    assert.equal(await manager.cancel('task_cancel_live'), true);
    await assert.rejects(
      running,
      (error: NodeJS.ErrnoException) => error.code === 'CODEX_TASK_CANCELLED',
    );
    assert.equal(manager.size(), 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Codex exec manager enforces its timeout and does not return incomplete output', async (t) => {
  if (process.platform === 'win32') {
    t.skip('This fake executable uses a POSIX shebang.');
    return;
  }
  const root = await makeTempRoot();
  const command = await makeFakeCodex(root, `
process.stdin.resume();
setInterval(() => {}, 1000);
`);
  try {
    const workspaceRoot = path.join(root, 'workspace');
    await (await import('node:fs/promises')).mkdir(workspaceRoot);
    const manager = createCodexExecManager({ platform: 'linux', timeoutMs: 180 });
    await assert.rejects(
      manager.run({
        taskId: 'task_timeout',
        command,
        workspaceRoot,
        profileName: 'aurix-chat-readonly',
        prompt: 'Never completes.',
        env: safeEnv(root),
      }),
      (error: NodeJS.ErrnoException) => error.code === 'CODEX_TASK_TIMEOUT',
    );
    assert.equal(manager.size(), 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
