import { COMPANION_API_VERSION, type CompanionStatus, type HealthResponse } from './protocol';

export interface ProbeOptions {
  url: string;
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Real network probe. Returns an honest state; never throws. */
export async function probeCompanion(opts: ProbeOptions): Promise<CompanionStatus> {
  const url = opts.url.trim().replace(/\/+$/, '');
  if (!url) return { state: 'not_configured', message: 'No companion URL set.' };
  if (!opts.token.trim()) return { state: 'unauthorized', message: 'Enter the pairing token printed by the companion.' };

  const f = opts.fetchImpl ?? fetch;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 2500);
  try {
    const res = await f(`${url}/v1/health`, {
      headers: { Authorization: `Bearer ${opts.token.trim()}` },
      signal: ctl.signal,
    });
    if (res.status === 401 || res.status === 403) return { state: 'unauthorized', message: 'The companion rejected the pairing token.' };
    if (!res.ok) return { state: 'unreachable', message: `Companion answered HTTP ${res.status}.` };
    const body = (await res.json()) as Partial<HealthResponse>;
    if (body.service !== 'aurix-companion') return { state: 'incompatible', message: 'That address is not an AURIX companion.' };
    if (body.apiVersion !== COMPANION_API_VERSION) {
      return { state: 'incompatible', message: `Companion API v${String(body.apiVersion)} does not match AURIX v${COMPANION_API_VERSION}.` };
    }
    return { state: 'connected', message: 'Companion reachable.', health: body as HealthResponse };
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return { state: 'unreachable', message: aborted ? 'Companion did not respond in time.' : 'Could not reach the companion. Is it running?' };
  } finally {
    clearTimeout(timer);
  }
}
