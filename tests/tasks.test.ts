import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/storage/backend';
import { Db } from '../src/storage/db';
import { claudeMeta } from '../src/adapters/claude';
import type { ProviderAdapter, ProviderStatus } from '../src/adapters/types';
import type { TaskExecutionAdapter } from '../src/tasks/types';
import { classifyIntent, createPlan } from '../src/tasks/classifier';
import { TaskEngine } from '../src/tasks/engine';

async function freshDb() {
  const db = new Db(new MemoryBackend());
  await db.load();
  return db;
}

function adapter(executeTask?: TaskExecutionAdapter['executeTask'], connected = false): ProviderAdapter & Partial<TaskExecutionAdapter> {
  const status: ProviderStatus = {
    state: connected ? 'connected' : 'not_configured',
    implementation: connected ? 'implemented_tested' : 'interface_only',
    summary: connected ? 'Connected in test' : 'Not connected',
    checkedAt: Date.now(),
  };
  const base = { meta: claudeMeta, getStatus: async () => status };
  return executeTask ? { ...base, executeTask } : base;
}

test('classifier recognises software, research, media and conversational requests transparently', () => {
  assert.equal(classifyIntent('Debug this TypeScript function').intent, 'coding');
  assert.equal(classifyIntent('Research the history of robotics').intent, 'research');
  assert.equal(classifyIntent('Create an animated video').intent, 'media');
  assert.equal(classifyIntent('Hello there').intent, 'chat');
  assert.equal(classifyIntent('x').intent, 'unknown');
  assert.equal(createPlan('coding').length, 3);
});

test('task submission persists a plan and clearly waits when no provider is connected', async () => {
  const db = await freshDb();
  const engine = new TaskEngine(db, [adapter()]);
  const task = await engine.submit({ projectId: null, prompt: 'Explain how a gearbox works', preferredProvider: 'auto' });
  assert.equal(task.intent, 'chat');
  assert.equal(task.status, 'waiting_for_provider');
  assert.equal(task.plan.length, 3);
  assert.equal(task.output, '');
  assert.ok(db.snapshot('taskEvents').some((e) => e.type === 'task.classified'));
  assert.ok(db.snapshot('taskEvents').some((e) => e.type === 'task.waiting_for_provider'));
});

test('connected provider without a real task executor is never treated as executed', async () => {
  const db = await freshDb();
  const engine = new TaskEngine(db, [adapter(undefined, true)]);
  const task = await engine.submit({ projectId: null, prompt: 'Hello, how are you?', preferredProvider: 'claude' });
  assert.equal(task.status, 'waiting_for_provider');
  assert.equal(task.errorCode, 'EXECUTOR_NOT_IMPLEMENTED');
  assert.equal(task.output, '');
});

test('a genuine test executor completes a task and records provenance', async () => {
  const db = await freshDb();
  const executor: TaskExecutionAdapter['executeTask'] = async (_request, context) => {
    await context.emitProgress('Working', 50);
    return { output: 'Test response' };
  };
  const engine = new TaskEngine(db, [adapter(executor, true)]);
  const task = await engine.submit({ projectId: null, prompt: 'Hello there', preferredProvider: 'claude' });
  // Execution is deliberately started through the task service; wait for its database result.
  for (let i = 0; i < 20 && db.get('tasks', task.id)?.status !== 'succeeded'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const finished = db.get('tasks', task.id)!;
  assert.equal(finished.status, 'succeeded');
  assert.equal(finished.output, 'Test response');
  assert.ok(db.snapshot('taskEvents').some((e) => e.type === 'task.completed'));
});

test('cancellation is only terminal after the adapter acknowledges its abort signal', async () => {
  const db = await freshDb();
  const executor: TaskExecutionAdapter['executeTask'] = async (_request, context) => new Promise((resolve, reject) => {
    context.signal.addEventListener('abort', () => reject(new Error('adapter stopped')), { once: true });
  });
  const engine = new TaskEngine(db, [adapter(executor, true)]);
  const task = await engine.submit({ projectId: null, prompt: 'Hello there', preferredProvider: 'claude' });
  await engine.cancel(task.id);
  for (let i = 0; i < 20 && db.get('tasks', task.id)?.status !== 'cancelled'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(db.get('tasks', task.id)?.status, 'cancelled');
});

test('timeout is distinguished from provider failure after adapter stop acknowledgement', async () => {
  const db = await freshDb();
  const executor: TaskExecutionAdapter['executeTask'] = async (_request, context) => new Promise((_resolve, reject) => {
    context.signal.addEventListener('abort', () => reject(new Error('adapter stopped')), { once: true });
  });
  const engine = new TaskEngine(db, [adapter(executor, true)]);
  const task = await engine.submit({ projectId: null, prompt: 'Hello there', preferredProvider: 'claude', timeoutMs: 1_000 });
  assert.equal(task.status, 'running');
  for (let i = 0; i < 300 && db.get('tasks', task.id)?.status !== 'timed_out'; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(db.get('tasks', task.id)?.status, 'timed_out');
  assert.equal(db.get('tasks', task.id)?.errorCode, 'TIMEOUT');
});

test('interrupted tasks are marked failed after a reload rather than shown as still running', async () => {
  const db = await freshDb();
  const record = await db.create('tasks', {
    projectId: null, prompt: 'old work', intent: 'chat', intentReason: 'test',
    preferredProvider: 'auto', selectedProviderId: 'claude', status: 'running',
    plan: [], progress: 10, output: '', errorCode: '', errorMessage: '',
    timeoutMs: 10_000, startedAt: Date.now(), finishedAt: null,
  });
  const engine = new TaskEngine(db, []);
  assert.equal(await engine.recoverInterruptedTasks(), 1);
  assert.equal(db.get('tasks', record.id)?.status, 'failed');
  assert.equal(db.get('tasks', record.id)?.errorCode, 'INTERRUPTED_AFTER_RELOAD');
});


test('retry re-checks provider availability for the same saved task', async () => {
  const db = await freshDb();
  let connected = false;
  const dynamic: ProviderAdapter = {
    meta: claudeMeta,
    getStatus: async () => ({
      state: connected ? 'connected' : 'not_configured',
      implementation: connected ? 'implemented_tested' : 'interface_only',
      summary: connected ? 'Connected in test' : 'Not connected',
      checkedAt: Date.now(),
    }),
  };
  const engine = new TaskEngine(db, [dynamic]);
  const first = await engine.submit({ projectId: null, prompt: 'Hello there', preferredProvider: 'claude' });
  assert.equal(first.status, 'waiting_for_provider');
  assert.equal(first.selectedProviderId, null);

  connected = true;
  const retried = await engine.retry(first.id);
  assert.ok(retried);
  assert.equal(retried.id, first.id);
  assert.equal(retried.selectedProviderId, 'claude');
  assert.equal(retried.status, 'waiting_for_provider');
  assert.equal(retried.errorCode, 'EXECUTOR_NOT_IMPLEMENTED');
  assert.ok(db.snapshot('taskEvents').some((event) => event.type === 'task.retried'));
  assert.ok(db.snapshot('taskEvents').some((event) => event.type === 'provider.checked'));
});

test('retry does not restart a task that is already running or completed', async () => {
  const db = await freshDb();
  const task = await db.create('tasks', {
    projectId: null, prompt: 'done', intent: 'chat', intentReason: 'test',
    preferredProvider: 'auto', selectedProviderId: null, status: 'succeeded',
    plan: [], progress: 100, output: 'done', errorCode: '', errorMessage: '',
    timeoutMs: 10_000, startedAt: Date.now(), finishedAt: Date.now(),
  });
  const engine = new TaskEngine(db, []);
  assert.equal(await engine.retry(task.id), null);
  assert.equal(db.get('tasks', task.id)?.status, 'succeeded');
});
