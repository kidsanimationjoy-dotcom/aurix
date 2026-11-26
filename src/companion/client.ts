import {
  COMPANION_API_VERSION,
  type CompanionStatus,
  type CodexStatus,
  type CodexPrepareResult,
  type HealthResponse,
  type LocalCompanionConfig,
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


export async function executeCodexChatTask(
  config: LocalCompanionConfig,
  taskId: string,
  prompt: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const base = companionBaseUrl(config.url);
  if (!config.token.trim()) throw new Error('Pair the local companion before running Codex.');
  if (signal.aborted) {
    const error = new Error('Codex task was cancelled before it started.');
    error.name = 'AbortError';
    throw error;
  }

  const headers = {
    Authorization: 'Bearer ' + config.token.trim(),
    'Content-Type': 'application/json',
  };
  const cancel = () => {
    // Do not abort the execution request itself: the companion must terminate
    // and confirm the local process tree before that request is settled.
    void fetchImpl(base + '/v1/codex/cancel', {
      method: 'POST',
      headers,
      body: JSON.stringify({ taskId }),
    }).catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  // Close the race between the initial aborted check and registering the listener.
  if (signal.aborted) cancel();

  try {
    const response = await fetchImpl(base + '/v1/codex/exec', {
      method: 'POST',
      headers,
      body: JSON.stringify({ taskId, prompt }),
    });
    const value = await response.json().catch(() => ({})) as { output?: string; message?: string };
    if (signal.aborted) {
      const error = new Error('Codex task was cancelled.');
      error.name = 'AbortError';
      throw error;
    }
    if (!response.ok) throw new Error(value.message ?? 'The local Codex task failed (HTTP ' + response.status + ').');
    if (typeof value.output !== 'string') throw new Error('The companion returned an invalid Codex result.');
    return value.output;
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
