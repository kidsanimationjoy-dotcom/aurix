import {
  COMPANION_API_VERSION,
  type CompanionStatus,
  type CodexStatus,
  type CodexPrepareResult,
  type CodexAgentSession,
  type HealthResponse,
  type LocalCompanionConfig,
  type HiggsfieldStatus,
  type HiggsfieldQuote,
} from './protocol';

export interface ProbeOptions {
  url: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function isLoopbackCompanionUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname) &&
      !parsed.username && !parsed.password &&
      (parsed.pathname === '/' || parsed.pathname === '') &&
      !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

function companionBaseUrl(value: string): string {
  if (!isLoopbackCompanionUrl(value)) {
    throw new Error('The local companion URL must be an HTTP loopback address (localhost or 127.0.0.1).');
  }
  return value.trim().replace(/\/+$/, '');
}

/** Real network probe. Returns an honest state; never throws. */
export async function probeCompanion(opts: ProbeOptions): Promise<CompanionStatus> {
  const url = opts.url.trim();
  if (!url) return { state: 'not_configured', message: 'No companion URL set.' };
  if (!isLoopbackCompanionUrl(url)) return { state: 'incompatible', message: 'The companion must run on this computer using a loopback address.' };
  if (!opts.token.trim()) return { state: 'unauthorized', message: 'Enter the pairing token printed by the companion.' };

  const f = opts.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 2500);
  try {
    const res = await f(companionBaseUrl(url) + '/v1/health', {
      headers: { Authorization: 'Bearer ' + opts.token.trim() },
      signal: ctl.signal,
    });
    if (res.status === 401 || res.status === 403) return { state: 'unauthorized', message: 'The companion rejected the pairing token or origin.' };
    if (!res.ok) return { state: 'unreachable', message: 'Companion answered HTTP ' + res.status + '.' };
    const body = await res.json() as Partial<HealthResponse>;
    if (body.service !== 'aurix-companion') return { state: 'incompatible', message: 'That address is not an AURIX companion.' };
    if (body.apiVersion !== COMPANION_API_VERSION) {
      return { state: 'incompatible', message: 'Companion API v' + String(body.apiVersion) + ' does not match AURIX v' + COMPANION_API_VERSION + '.' };
    }
    return { state: 'connected', message: 'Companion reachable.', health: body as HealthResponse };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { state: 'unreachable', message: aborted ? 'Companion did not respond in time.' : 'Could not reach the companion. Is it running?' };
  } finally {
    clearTimeout(timer);
  }
}

export async function prepareCodexProfile(
  config: LocalCompanionConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<CodexPrepareResult> {
  const base = companionBaseUrl(config.url);
  if (!config.token.trim()) throw new Error('Enter the local companion pairing token first.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetchImpl(base + '/v1/codex/prepare', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.token.trim(),
        'Content-Type': 'application/json',
      },
      body: '{}',
      signal: controller.signal,
    });
    const value = await response.json() as Partial<CodexPrepareResult>;
    if (!response.ok || typeof value.profilePrepared !== 'boolean' || typeof value.sandboxVerified !== 'boolean') {
      throw new Error(typeof value.message === 'string' ? value.message : 'Could not prepare the AURIX Codex profile.');
    }
    return value as CodexPrepareResult;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The Codex sandbox verification timed out.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function getCodexStatus(
  config: LocalCompanionConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<CodexStatus> {
  if (!config.url.trim() || !config.token.trim()) {
    return {
      state: 'error', installed: false, signedIn: false, version: null, authMode: 'unknown',
      message: 'Pair the local companion before checking Codex.',
    };
  }
  let base: string;
  try { base = companionBaseUrl(config.url); }
  catch {
    return {
      state: 'error', installed: false, signedIn: false, version: null, authMode: 'unknown',
      message: 'The companion URL must be a local loopback address.',
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetchImpl(base + '/v1/codex/status', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + config.token.trim() },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      return { state: 'error', installed: false, signedIn: false, version: null, authMode: 'unknown', message: 'The companion rejected the pairing token or browser origin.' };
    }
    if (!response.ok) {
      return { state: 'error', installed: false, signedIn: false, version: null, authMode: 'unknown', message: 'Codex status check failed (HTTP ' + response.status + ').' };
    }
    const value = await response.json() as Partial<CodexStatus>;
    if (!value.state || typeof value.installed !== 'boolean' || typeof value.signedIn !== 'boolean') {
      throw new Error('The companion returned an invalid Codex status response.');
    }
    return value as CodexStatus;
  } catch (error) {
    return {
      state: 'error', installed: false, signedIn: false, version: null, authMode: 'unknown',
      message: error instanceof Error && error.name === 'AbortError'
        ? 'Codex status check timed out.'
        : 'Could not check Codex through the local companion.',
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function startCodexLogin(config: LocalCompanionConfig, fetchImpl: typeof fetch = fetch): Promise<string> {
  const base = companionBaseUrl(config.url);
  if (!config.token.trim()) throw new Error('Enter the local companion pairing token first.');
  const response = await fetchImpl(base + '/v1/codex/login', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + config.token.trim() },
  });
  const body = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? 'Could not start Codex sign-in (HTTP ' + response.status + ').');
  return body.message ?? 'The official Codex sign-in has started in the companion terminal.';
}



export async function sendCodexMessage(
  config: LocalCompanionConfig,
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[],
  fetchImpl: typeof fetch = fetch,
): Promise<{ sessionId: string; content: string }> {
  const base = companionBaseUrl(config.url);
  if (!config.token.trim()) throw new Error('Enter the local companion pairing token first.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 130_000);
  try {
    const response = await fetchImpl(base + '/v1/codex/chat', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + config.token.trim(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages: messages.slice(-12) }),
      signal: controller.signal,
    });
    const body = await response.json() as {
      ok?: boolean; sessionId?: string; content?: string; message?: string;
    };
    if (!response.ok || body.ok !== true || typeof body.content !== 'string' || typeof body.sessionId !== 'string') {
      throw new Error(body.message ?? 'The local Codex chat request failed (HTTP ' + response.status + ').');
    }
    return { sessionId: body.sessionId, content: body.content };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Codex chat timed out. Check the local companion and try again.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}


async function codexAgentRequest<T>(
  config: LocalCompanionConfig,
  endpoint: string,
  init: RequestInit,
  timeoutMs = 15_000,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const base = companionBaseUrl(config.url);
  if (!config.token.trim()) throw new Error('Enter the local companion pairing token first.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(base + endpoint, {
      ...init,
      headers: {
        Authorization: 'Bearer ' + config.token.trim(),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as T & { message?: string; error?: string };
    if (!response.ok) throw new Error(body.message ?? body.error ?? 'Codex agent request failed (HTTP ' + response.status + ').');
    return body;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The local Codex agent request timed out.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}


export async function validateCodexAgentTarget(
  config: LocalCompanionConfig,
  target: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const body = await codexAgentRequest<{ ok?: boolean; valid?: boolean }>(
    config,
    '/v1/codex/agent/validate',
    { method: 'POST', body: JSON.stringify({ target }) },
    12_000,
    fetchImpl,
  );
  if (body.ok !== true || body.valid !== true) throw new Error('The selected local project folder is not approved for Codex.');
}

export async function startCodexAgent(
  config: LocalCompanionConfig,
  target: string,
  prompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CodexAgentSession> {
  const body = await codexAgentRequest<{ ok?: boolean; session?: CodexAgentSession }>(
    config,
    '/v1/codex/agent/start',
    { method: 'POST', body: JSON.stringify({ target, prompt }) },
    30_000,
    fetchImpl,
  );
  if (body.ok !== true || !body.session?.id) throw new Error('The local Codex agent did not return a valid session.');
  return body.session;
}

export async function getCodexAgentStatus(
  config: LocalCompanionConfig,
  sessionId: string,
  after = 0,
  fetchImpl: typeof fetch = fetch,
): Promise<CodexAgentSession> {
  const query = new URLSearchParams({ sessionId, after: String(after) });
  const body = await codexAgentRequest<{ ok?: boolean; session?: CodexAgentSession }>(
    config,
    '/v1/codex/agent/status?' + query.toString(),
    { method: 'GET' },
    10_000,
    fetchImpl,
  );
  if (body.ok !== true || !body.session?.id) throw new Error('The local Codex agent status response was invalid.');
  return body.session;
}

export async function respondCodexAgentApproval(
  config: LocalCompanionConfig,
  sessionId: string,
  approvalId: string,
  decision: 'accept' | 'decline' | 'cancel',
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const body = await codexAgentRequest<{ ok?: boolean }>(
    config,
    '/v1/codex/agent/approval',
    { method: 'POST', body: JSON.stringify({ sessionId, approvalId, decision }) },
    10_000,
    fetchImpl,
  );
  if (body.ok !== true) throw new Error('The local Codex approval was not confirmed.');
}

export async function interruptCodexAgent(
  config: LocalCompanionConfig,
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const body = await codexAgentRequest<{ ok?: boolean; interrupted?: boolean }>(
    config,
    '/v1/codex/agent/interrupt',
    { method: 'POST', body: JSON.stringify({ sessionId }) },
    10_000,
    fetchImpl,
  );
  return body.ok === true && body.interrupted === true;
}

export async function closeCodexAgent(
  config: LocalCompanionConfig,
  sessionId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const body = await codexAgentRequest<{ ok?: boolean }>(
    config,
    '/v1/codex/agent/close',
    { method: 'POST', body: JSON.stringify({ sessionId }) },
    10_000,
    fetchImpl,
  );
  if (body.ok !== true) throw new Error('Could not close the local Codex agent session.');
}

export interface ReaStatus {
  available: boolean;
  version: string | null;
  approvedRootCount: number;
  message?: string;
}

export async function getReaStatus(config: LocalCompanionConfig, fetchImpl: typeof fetch = fetch): Promise<ReaStatus> {
  const base = companionBaseUrl(config.url);
  if (!config.token.trim()) throw new Error('Pair the local companion before checking REA.');
  const response = await fetchImpl(base + '/v1/rea/status', {
    headers: { Authorization: 'Bearer ' + config.token.trim() },
  });
  const body = await response.json() as Partial<ReaStatus>;
  if (!response.ok || typeof body.available !== 'boolean' || typeof body.approvedRootCount !== 'number') {
    throw new Error(typeof body.message === 'string' ? body.message : 'Could not check the local REA engine.');
  }
  return body as ReaStatus;
}

export async function analyzeReaTarget(config: LocalCompanionConfig, target: string, kind: 'javascript' | 'desktop' | 'android' = 'javascript', fetchImpl: typeof fetch = fetch): Promise<unknown> {
  const base = companionBaseUrl(config.url);
  if (!config.token.trim()) throw new Error('Pair the local companion before running REA.');
  const response = await fetchImpl(base + '/v1/rea/analyze', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + config.token.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ target, kind }),
  });
  const body = await response.json() as { ok?: boolean; result?: unknown; message?: string };
  if (!response.ok || body.ok !== true) throw new Error(body.message ?? 'REA analysis failed.');
  return body.result;
}


export interface ReaBrowserAuthorization {
  statement: string;
  confirmedAt: number;
}

async function reaBrowserRequest(
  config: LocalCompanionConfig,
  route: string,
  payload: Record<string, unknown>,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const base = companionBaseUrl(config.url);
  if (!config.token.trim()) throw new Error('Pair the local companion before inspecting a browser tab.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(base + route, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + config.token.trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json() as { ok?: boolean; result?: unknown; message?: string };
    if (!response.ok || body.ok !== true) throw new Error(body.message ?? 'Local REA browser inspection failed.');
    return body.result;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The local browser inspection timed out. Confirm that the browser and companion are still running.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function listReaBrowserTargets(
  config: LocalCompanionConfig,
  endpoint: string,
  authorization: ReaBrowserAuthorization,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  return reaBrowserRequest(config, '/v1/rea/browser/targets', { endpoint, authorization }, 30_000, fetchImpl);
}

export async function inspectReaBrowserTarget(
  config: LocalCompanionConfig,
  endpoint: string,
  targetId: string,
  kind: 'page' | 'bundle',
  authorization: ReaBrowserAuthorization,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  return reaBrowserRequest(
    config,
    '/v1/rea/browser/inspect',
    { endpoint, targetId, kind, authorization },
    kind === 'bundle' ? 320_000 : 120_000,
    fetchImpl,
  );
}

async function higgsfieldRequest<T>(
  config: LocalCompanionConfig,
  route: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const base = companionBaseUrl(config.url);
  if (!config.token.trim()) throw new Error('Pair the local companion before using Higgsfield.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(base + route, {
      ...init,
      headers: {
        Authorization: 'Bearer ' + config.token.trim(),
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as T & { ok?: boolean; result?: unknown; message?: string };
    if (!response.ok || body.ok !== true) throw new Error(body.message ?? 'Higgsfield companion request failed (HTTP ' + response.status + ').');
    return body.result as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('Higgsfield did not respond in time.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function startHiggsfieldLogin(
  config: LocalCompanionConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ message: string }> {
  return higgsfieldRequest(config, '/v1/higgsfield/login', { method: 'POST' }, 15_000, fetchImpl);
}

export async function getHiggsfieldStatus(
  config: LocalCompanionConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<HiggsfieldStatus> {
  return higgsfieldRequest<HiggsfieldStatus>(config, '/v1/higgsfield/status', {}, 20_000, fetchImpl);
}

export async function listHiggsfieldModels(
  config: LocalCompanionConfig,
  fetchImpl: typeof fetch = fetch,
): Promise<{ raw: unknown; models: { id: string; name: string; kinds: string[]; raw: unknown }[] }> {
  return higgsfieldRequest(config, '/v1/higgsfield/models', {}, 40_000, fetchImpl);
}

export async function quoteHiggsfieldJob(
  config: LocalCompanionConfig,
  request: { kind: 'video' | 'image'; modelId: string; prompt: string; duration?: number; resolution?: string; aspectRatio?: string; mode?: 'std' | 'fast' | 't2v'; bitrateMode?: string; quality?: string; variant?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<HiggsfieldQuote> {
  return higgsfieldRequest<HiggsfieldQuote>(
    config,
    '/v1/higgsfield/quote',
    { method: 'POST', body: JSON.stringify(request) },
    75_000,
    fetchImpl,
  );
}

export async function createHiggsfieldJob(
  config: LocalCompanionConfig,
  quoteId: string,
  confirmed: boolean,
  fetchImpl: typeof fetch = fetch,
): Promise<{ jobId: string; submittedAt: string }> {
  return higgsfieldRequest(
    config,
    '/v1/higgsfield/create',
    { method: 'POST', body: JSON.stringify({ quoteId, confirmed }) },
    100_000,
    fetchImpl,
  );
}

export async function getHiggsfieldJob(
  config: LocalCompanionConfig,
  jobId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<unknown> {
  const query = new URLSearchParams({ id: jobId });
  return higgsfieldRequest(config, '/v1/higgsfield/job?' + query.toString(), {}, 40_000, fetchImpl);
}
