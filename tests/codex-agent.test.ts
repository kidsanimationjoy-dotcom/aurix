import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, chmod, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCodexAgentManager } from '../companion/codex-agent.mjs';

async function makeFakeAppServer(): Promise<{ directory: string; command: string }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'aurix-fake-app-server-'));
  const command = path.join(directory, 'codex');
  const source = `#!/usr/bin/env node
const readline = require('node:readline');
const args = process.argv.slice(2);
if (args[0] !== 'app-server' || args[1] !== '--listen' || args[2] !== 'stdio://') process.exit(90);
if (process.env.OPENAI_API_KEY) process.exit(91);
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
const send = (value) => process.stdout.write(JSON.stringify(value) + '\\n');
let root = process.cwd();
let scenario = 'command';
rl.on('line', (line) => {
  let message;
  try { message = JSON.parse(line); } catch { process.exit(92); }
  if (message.method === 'initialize') {
    send({ id: message.id, result: { userAgent: 'fake-app-server' } });
    return;
  }
  if (message.method === 'thread/start') {
    root = message.params.cwd;
    send({ id: message.id, result: { thread: { id: 'thread-aurix-test' } } });
    return;
  }
  if (message.method === 'turn/start') {
    const text = message.params.input?.[0]?.text ?? '';
    scenario = text.includes('filesystem') ? 'filesystem' : text.includes('network') ? 'network' : 'command';
    send({ id: message.id, result: { turn: { id: 'turn-aurix-test', status: 'inProgress' } } });
    send({ method: 'turn/started', params: { turn: { id: 'turn-aurix-test', status: 'inProgress' } } });
    if (scenario === 'filesystem') {
      send({
        id: 42,
        method: 'item/permissions/requestApproval',
        params: {
          itemId: 'item-1', threadId: 'thread-aurix-test', turnId: 'turn-aurix-test',
          cwd: root, startedAtMs: Date.now(),
          permissions: {
            fileSystem: { entries: [{ access: 'write', path: { type: 'path', path: root } }] },
            network: { enabled: false }
          }
        }
      });
    } else {
      send({
        method: 'item/started',
        params: { item: { id: 'item-1', type: 'commandExecution', command: 'node --version', cwd: root, status: 'inProgress' } }
      });
      send({
        id: 42,
        method: 'item/commandExecution/requestApproval',
        params: {
          itemId: 'item-1', threadId: 'thread-aurix-test', turnId: 'turn-aurix-test',
          command: 'node --version', cwd: root,
          ...(scenario === 'network' ? { networkApprovalContext: { host: 'example.invalid', protocol: 'https' } } : {})
        }
      });
    }
    return;
  }
  if (message.id === 42 && message.result) {
    send({ method: 'serverRequest/resolved', params: { threadId: 'thread-aurix-test', requestId: 42 } });
    send({ method: 'turn/completed', params: { turn: { id: 'turn-aurix-test', status: 'completed', items: [] } } });
    setTimeout(() => process.exit(0), 20);
    return;
  }
  if (message.method === 'turn/interrupt') {
    send({ id: message.id, result: {} });
    send({ method: 'turn/completed', params: { turn: { id: 'turn-aurix-test', status: 'interrupted' } } });
    setTimeout(() => process.exit(0), 20);
  }
});
`;
  await writeFile(command, source);
  await chmod(command, 0o700);
  return { directory, command };
}

async function waitForApproval(manager: ReturnType<typeof createCodexAgentManager>, sessionId: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const snapshot = manager.snapshot(sessionId);
    const approval = snapshot?.events.find((event) => event.type === 'agent.approval.required');
    if (approval) return approval;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('The fake App Server did not request approval.');
}

async function waitForStatus(manager: ReturnType<typeof createCodexAgentManager>, sessionId: string, status: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const snapshot = manager.snapshot(sessionId);
    if (snapshot?.status === status) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('The Codex App Server did not reach ' + status + '.');
}

test('Codex App Server starts read-only, shows command approvals, and accepts only one-time decisions', async () => {
  if (process.platform === 'win32') return;
  const root = await mkdtemp(path.join(os.tmpdir(), 'aurix-codex-agent-root-'));
  const fake = await makeFakeAppServer();
  const manager = createCodexAgentManager({ command: fake.command, codexHome: path.join(root, '.codex-home'), roots: [root] });
  try {
    const session = await manager.start({ target: root, prompt: 'Inspect the project and report its structure.' });
    assert.equal(session.status, 'running');
    const approval = await waitForApproval(manager, session.id);
    assert.equal(approval.kind, 'command');
    assert.deepEqual(approval.command, ['node --version']);
    await assert.rejects(
      () => manager.approve(session.id, String(approval.id), 'acceptForSession'),
      /Unsupported approval decision/,
    );
    await manager.approve(session.id, String(approval.id), 'accept');
    const completed = await waitForStatus(manager, session.id, 'completed');
    assert.equal(completed.threadId, 'thread-aurix-test');
    assert.ok(completed.events.some((event) => event.type === 'agent.approval.responded' && event.decision === 'accept'));
  } finally {
    await manager.closeAll();
    await rm(fake.directory, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('Codex filesystem permission approval grants only the approved project path for this turn', async () => {
  if (process.platform === 'win32') return;
  const root = await mkdtemp(path.join(os.tmpdir(), 'aurix-codex-permission-root-'));
  const fake = await makeFakeAppServer();
  const manager = createCodexAgentManager({ command: fake.command, codexHome: path.join(root, '.codex-home'), roots: [root] });
  try {
    const session = await manager.start({ target: root, prompt: 'Request filesystem permission for this project.' });
    const approval = await waitForApproval(manager, session.id);
    assert.equal(approval.kind, 'filesystem');
    assert.deepEqual(approval.requestedPermissions.fileSystem.entries[0].path, { type: 'path', path: root });
    await manager.approve(session.id, String(approval.id), 'accept');
    const completed = await waitForStatus(manager, session.id, 'completed');
    assert.ok(completed.events.some((event) => event.type === 'agent.approval.responded' && event.decision === 'accept'));
  } finally {
    await manager.closeAll();
    await rm(fake.directory, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});

test('Codex App Server refuses a project outside its explicit approved roots', async () => {
  if (process.platform === 'win32') return;
  const allowed = await mkdtemp(path.join(os.tmpdir(), 'aurix-codex-root-'));
  const outsideParent = await mkdtemp(path.join(os.tmpdir(), 'aurix-codex-outside-'));
  const outside = path.join(outsideParent, 'project');
  await mkdir(outside);
  const fake = await makeFakeAppServer();
  const manager = createCodexAgentManager({ command: fake.command, codexHome: path.join(allowed, '.codex-home'), roots: [allowed] });
  try {
    await assert.rejects(
      () => manager.start({ target: outside, prompt: 'Do not run.' }),
      /outside the folders explicitly approved/,
    );
    assert.equal(manager.snapshot('missing'), null);
  } finally {
    await manager.closeAll();
    await rm(fake.directory, { recursive: true, force: true });
    await rm(allowed, { recursive: true, force: true });
    await rm(outsideParent, { recursive: true, force: true });
  }
});

test('Codex refuses network approval even when the caller tries to accept it', async () => {
  if (process.platform === 'win32') return;
  const root = await mkdtemp(path.join(os.tmpdir(), 'aurix-codex-network-root-'));
  const fake = await makeFakeAppServer();
  const manager = createCodexAgentManager({ command: fake.command, codexHome: path.join(root, '.codex-home'), roots: [root] });
  try {
    const session = await manager.start({ target: root, prompt: 'Test network approval refusal.' });
    const approval = await waitForApproval(manager, session.id);
    assert.equal(approval.kind, 'network');
    await assert.rejects(
      () => manager.approve(session.id, String(approval.id), 'accept'),
      /never grants network access/,
    );
    await manager.approve(session.id, String(approval.id), 'decline');
    await waitForStatus(manager, session.id, 'completed');
  } finally {
    await manager.closeAll();
    await rm(fake.directory, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  }
});
