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
  | { ok: true; providerId: ProviderId; mode: 'selected' | 'auto'; reason: string }
  | { ok: false; reason: string; considered: Considered[] };

/**
 * Picks a provider for a task. Rules:
 *  - Only providers whose status is 'connected' are ever chosen.
 *  - A user-selected provider is never silently replaced by another one.
 *  - 'auto' takes the first connected, capable provider in registry order.
 */
export async function routeTask(
  adapters: ProviderAdapter[],
  task: { kind: TaskKind; preferred?: ProviderId | 'auto' },
): Promise<RouteDecision> {
  const need = REQUIRED[task.kind];
  const considered: Considered[] = [];
  const usable: ProviderAdapter[] = [];

  for (const a of adapters) {
    if (!a.meta.plannedCapabilities.includes(need)) {
      considered.push({ providerId: a.meta.id, name: a.meta.name, state: 'incapable', why: `Does not provide ${need}` });
      continue;
    }
    const s = await a.getStatus();
    considered.push({ providerId: a.meta.id, name: a.meta.name, state: s.state, why: s.summary });
    if (s.state === 'connected') usable.push(a);
  }

  const preferred = task.preferred ?? 'auto';
  if (preferred !== 'auto') {
    const hit = usable.find((a) => a.meta.id === preferred);
    if (hit) return { ok: true, providerId: hit.meta.id, mode: 'selected', reason: `${hit.meta.name} selected by you` };
    const c = considered.find((x) => x.providerId === preferred);
    return {
      ok: false,
      reason: c ? `${c.name} cannot take this task: ${c.why}` : `${preferred} is not a registered provider`,
      considered,
    };
  }
  const first = usable[0];
  if (first) return { ok: true, providerId: first.meta.id, mode: 'auto', reason: `${first.meta.name} is the first connected provider with ${need}` };
  return { ok: false, reason: 'No connected provider can take this task.', considered };
}
