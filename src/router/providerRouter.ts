import type { Capability, ConnectionState, ProviderAdapter, ProviderId } from '../adapters/types';

export type TaskKind = 'chat' | 'coding' | 'media_video' | 'media_image' | 'ui_components' | 'investigation';

const REQUIRED: Record<TaskKind, Capability> = {
  chat: 'chat',
  coding: 'coding_agent',
  media_video: 'media_video',
  media_image: 'media_image',
  ui_components: 'ui_components',
  investigation: 'investigation',
};

export interface Considered {
  providerId: ProviderId;
  name: string;
  state: ConnectionState | 'incapable';
  why: string;
}
export type RouteDecision =
  | { ok: true; providerId: ProviderId; mode: 'selected' | 'auto'; reason: string; considered: Considered[] }
  | { ok: false; reason: string; considered: Considered[] };

/**
 * Picks a provider for a task.
 * Only connected providers with an actual runtime capability are eligible.
 * Legacy adapters without runtime capability discovery use their planned capability list.
 * A user-selected provider is never silently replaced.
 */
export async function routeTask(
  adapters: ProviderAdapter[],
  task: { kind: TaskKind; preferred?: ProviderId | 'auto'; execution?: boolean },
): Promise<RouteDecision> {
  const need = REQUIRED[task.kind];
  const considered: Considered[] = [];
  const usable: ProviderAdapter[] = [];

  for (const adapter of adapters) {
    const taskOnly = task.execution === true && typeof adapter.getTaskCapabilities === 'function';
    if (!taskOnly && !adapter.meta.plannedCapabilities.includes(need)) {
      considered.push({ providerId: adapter.meta.id, name: adapter.meta.name, state: 'incapable', why: 'Does not provide ' + need });
      continue;
    }
    try {
      const status = await adapter.getStatus();
      if (status.state !== 'connected') {
        considered.push({ providerId: adapter.meta.id, name: adapter.meta.name, state: status.state, why: status.summary });
        continue;
      }
      const actual = task.execution === true
        ? (adapter.getTaskCapabilities ? await adapter.getTaskCapabilities() : adapter.getCapabilities ? await adapter.getCapabilities() : adapter.meta.plannedCapabilities)
        : (adapter.getCapabilities ? await adapter.getCapabilities() : adapter.meta.plannedCapabilities);
      if (!actual.includes(need)) {
        considered.push({
          providerId: adapter.meta.id,
          name: adapter.meta.name,
          state: 'incapable',
          why: 'Connected, but AURIX has not enabled a tested ' + need + ' execution path for this provider.',
        });
        continue;
      }
      considered.push({ providerId: adapter.meta.id, name: adapter.meta.name, state: 'connected', why: status.summary });
      usable.push(adapter);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Provider status or capability check failed.';
      considered.push({ providerId: adapter.meta.id, name: adapter.meta.name, state: 'error', why: detail });
    }
  }

  const preferred = task.preferred ?? 'auto';
  if (preferred !== 'auto') {
    const hit = usable.find((adapter) => adapter.meta.id === preferred);
    if (hit) return { ok: true, providerId: hit.meta.id, mode: 'selected', reason: hit.meta.name + ' selected by you', considered };
    const result = considered.find((item) => item.providerId === preferred);
    return {
      ok: false,
      reason: result ? result.name + ' cannot take this task: ' + result.why : preferred + ' is not a registered provider',
      considered,
    };
  }

  const first = usable[0];
  if (first) return { ok: true, providerId: first.meta.id, mode: 'auto', reason: first.meta.name + ' is the first connected provider with ' + need, considered };
  return { ok: false, reason: 'No connected provider can take this task.', considered };
}
