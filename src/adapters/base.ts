import type { AdapterError, ProviderMeta, ProviderStatus, Result } from './types';

export function fail<T = never>(error: AdapterError): Result<T> {
  return { ok: false, error };
}

/** Phase 1 behaviour: nothing is configured and no network calls exist. */
export function interfaceOnlyStatus(meta: ProviderMeta): ProviderStatus {
  return {
    state: 'not_configured',
    implementation: 'interface_only',
    summary: 'Not connected',
    detail: `${meta.name} has a typed interface in AURIX but no working integration yet. No credentials are stored and no requests are made.`,
    checkedAt: Date.now(),
  };
}

export function notImplemented<T = never>(meta: ProviderMeta, what: string): Promise<Result<T>> {
  return Promise.resolve(
    fail<T>({
      code: 'NOT_CONNECTED',
      message: `${meta.name}: ${what} is unavailable. The adapter is interface-only in this build and the provider is not connected.`,
    }),
  );
}
