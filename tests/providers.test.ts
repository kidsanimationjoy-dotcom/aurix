import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultAdapters } from '../src/adapters/registry';
import { routeTask } from '../src/router/providerRouter';
import type { ChatAdapter, ProviderAdapter, ProviderStatus } from '../src/adapters/types';
import { claudeMeta } from '../src/adapters/claude';
import { grokMeta } from '../src/adapters/grok';
import { HiggsfieldAdapter } from '../src/adapters/higgsfield';
import { ReaAdapter } from '../src/adapters/rea';
import { TwentyFirstAdapter } from '../src/adapters/twentyfirst';
import { ClaudeAdapter } from '../src/adapters/claude';

test('all six providers are registered, interface-only and not connected', async () => {
  const adapters = createDefaultAdapters();
  assert.deepEqual(adapters.map((a) => a.meta.id), ['claude', 'grok', 'openai', 'higgsfield', 'twentyfirst', 'rea']);
  for (const a of adapters) {
    const s = await a.getStatus();
    assert.equal(s.state, 'not_configured');
    assert.equal(s.implementation, 'interface_only');
  }
});

test('adapter operations never return ok:true while disconnected', async () => {
  const results = await Promise.all([
    new ClaudeAdapter().sendMessage(),
    new ClaudeAdapter().startSession(),
    new HiggsfieldAdapter().listModels(),
    new HiggsfieldAdapter().submitJob(),
    new HiggsfieldAdapter().getJob(),
    new TwentyFirstAdapter().searchComponents(),
    new ReaAdapter().createInvestigation(),
  ]);
  for (const r of results) {
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error.code, 'NOT_CONNECTED');
  }
});

test('router refuses when nothing is connected and explains why', async () => {
  const d = await routeTask(createDefaultAdapters(), { kind: 'chat', preferred: 'auto' });
  assert.equal(d.ok, false);
  if (!d.ok) {
    assert.match(d.reason, /No connected provider/);
    assert.ok(d.considered.some((c) => c.providerId === 'higgsfield' && c.state === 'incapable'));
  }
});

// Test double: a connected provider. Lives only in tests; the app ships no connected adapters.
function connected(meta: typeof claudeMeta): ChatAdapter {
  const status: ProviderStatus = { state: 'connected', implementation: 'implemented_tested', summary: 'ok', checkedAt: 0 };
  return { meta, getStatus: async () => status, sendMessage: async () => ({ ok: true, value: { sessionId: 's', content: 'x' } }) };
}

test('auto picks the first connected capable provider', async () => {
  const list: ProviderAdapter[] = [...createDefaultAdapters().slice(0, 1), connected(grokMeta)];
  const d = await routeTask(list, { kind: 'chat', preferred: 'auto' });
  assert.equal(d.ok && d.providerId, 'grok');
});

test('a selected provider is never silently replaced', async () => {
  const list: ProviderAdapter[] = [new ClaudeAdapter(), connected(grokMeta)];
  const d = await routeTask(list, { kind: 'chat', preferred: 'claude' });
  assert.equal(d.ok, false);
  const ok = await routeTask(list, { kind: 'chat', preferred: 'grok' });
  assert.equal(ok.ok && ok.mode, 'selected');
});

test('capability gating: a chat-only provider cannot take media tasks', async () => {
  const d = await routeTask([connected(claudeMeta)], { kind: 'media_video', preferred: 'auto' });
  assert.equal(d.ok, false);
});
