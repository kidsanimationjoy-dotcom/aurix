import { getHiggsfieldStatus, listHiggsfieldModels, quoteHiggsfieldJob, createHiggsfieldJob, getHiggsfieldJob, startHiggsfieldLogin } from '../companion/client';
import type { LocalCompanionConfig } from '../companion/protocol';
import type { Capability, MediaAdapter, MediaJob, MediaJobRequest, MediaModel, ProviderMeta, ProviderStatus, Result } from './types';

export const higgsfieldMeta: ProviderMeta = {
  id: 'higgsfield',
  name: 'Higgsfield',
  vendor: 'Higgsfield',
  role: 'AI video and image generation',
  plannedCapabilities: ['media_video', 'media_image', 'model_discovery'],
  authentication: 'Uses the official Higgsfield CLI browser OAuth flow on the local computer. No API key is used and AURIX never reads the CLI credential store.',
  references: [
    { label: 'Official Higgsfield CLI', url: 'https://github.com/higgsfield-ai/cli' },
    { label: 'Higgsfield Open', url: 'https://open.higgsfield.ai/' },
  ],
  constraints: [
    'The official CLI account and plan credits are used; AURIX must show a fresh cost estimate and require explicit confirmation before every paid generation.',
    'Models are discovered live; a job is complete only when Higgsfield returns a result file.',
    'OAuth credentials stay inside the official local CLI and are never returned to browser code.',
  ],
};

function isVideoModel(model: { id: string; kinds: string[]; raw: unknown }): boolean {
  const text = [model.id, ...model.kinds].join(' ').toLowerCase();
  return /video|seedance|kling|veo|wan|hailuo|gemini_omni|cinematic_studio_video/.test(text);
}

function isImageModel(model: { id: string; kinds: string[]; raw: unknown }): boolean {
  const text = [model.id, ...model.kinds].join(' ').toLowerCase();
  return /image|nano_banana|gpt_image|flux|seedream|recraft|soul_v2/.test(text);
}

function normaliseModels(value: Awaited<ReturnType<typeof listHiggsfieldModels>>): MediaModel[] {
  return value.models.flatMap((model) => {
    const kinds: ('video' | 'image')[] = [];
    if (model.kinds.some((kind) => /video/iu.test(kind)) || isVideoModel(model)) kinds.push('video');
    if (model.kinds.some((kind) => /image/iu.test(kind)) || isImageModel(model)) kinds.push('image');
    return [{ id: model.id, name: model.name, kinds, parameters: (model.raw && typeof model.raw === 'object' ? model.raw : {}) as Record<string, unknown> }];
  });
}

export class HiggsfieldAdapter implements MediaAdapter {
  readonly meta = higgsfieldMeta;
  private getConfig: () => LocalCompanionConfig = () => ({ url: '', token: '' });

  setCompanionConfigProvider(provider: () => LocalCompanionConfig): void {
    this.getConfig = provider;
  }

  async startLogin() {
    try {
      return { ok: true as const, value: await startHiggsfieldLogin(this.getConfig()) };
    } catch (error) {
      return { ok: false as const, error: { code: 'PROVIDER_ERROR' as const, message: error instanceof Error ? error.message : 'Could not start Higgsfield sign-in.' } };
    }
  }

  async getAccountStatus() {
    return getHiggsfieldStatus(this.getConfig());
  }

  async getStatus(): Promise<ProviderStatus> {
    const config = this.getConfig();
    if (!config.url || !config.token) {
      return {
        state: 'not_configured',
        implementation: 'implemented_untested',
        summary: 'Local Higgsfield CLI not paired',
        detail: 'Pair the AURIX local companion, install the official Higgsfield CLI, then run "higgsfield auth login" in your local terminal. No API key is needed.',
        checkedAt: Date.now(),
      };
    }
    try {
      const status = await getHiggsfieldStatus(config);
      return {
        state: status.signedIn ? 'connected' : status.installed ? 'awaiting_authentication' : 'not_configured',
        implementation: 'implemented_untested',
        summary: status.signedIn ? 'Higgsfield account connected' : status.installed ? 'Higgsfield sign-in required' : 'Higgsfield CLI unavailable',
        detail: status.message,
        account: typeof status.account.email === 'string' ? status.account.email : undefined,
        checkedAt: Date.now(),
      };
    } catch (error) {
      return {
        state: 'error',
        implementation: 'implemented_untested',
        summary: 'Higgsfield status check failed',
        detail: error instanceof Error ? error.message : 'Could not check Higgsfield.',
        checkedAt: Date.now(),
      };
    }
  }

  async getCapabilities(): Promise<Capability[]> {
    try {
      const status = await getHiggsfieldStatus(this.getConfig());
      if (!status.signedIn) return [];
      const models = normaliseModels(await listHiggsfieldModels(this.getConfig()));
      return [
        'model_discovery',
        ...(models.some((model) => model.kinds.includes('video')) ? ['media_video' as const] : []),
        ...(models.some((model) => model.kinds.includes('image')) ? ['media_image' as const] : []),
      ];
    } catch {
      return [];
    }
  }

  async listModels(): Promise<Result<MediaModel[]>> {
    try {
      const status = await getHiggsfieldStatus(this.getConfig());
      if (!status.signedIn) return { ok: false, error: { code: 'NOT_CONNECTED', message: status.message } };
      return { ok: true, value: normaliseModels(await listHiggsfieldModels(this.getConfig())) };
    } catch (error) {
      return { ok: false, error: { code: 'PROVIDER_ERROR', message: error instanceof Error ? error.message : 'Could not list Higgsfield models.' } };
    }
  }

  /** A direct submit is intentionally blocked: callers must quote and confirm first. */
  async submitJob(_request?: MediaJobRequest): Promise<Result<MediaJob>> {
    return {
      ok: false,
      error: {
        code: 'AUTHORIZATION_REQUIRED',
        message: 'Paid generation requires a fresh credit estimate and a separate user confirmation. Use quoteJob, then confirmAndSubmitJob.',
      },
    };
  }

  async quoteJob(request: MediaJobRequest) {
    try {
      if (request.kind !== 'video') throw new Error('AURIX has not enabled paid image generation in this initial Higgsfield workflow.');
      const quote = await quoteHiggsfieldJob(this.getConfig(), {
        modelId: request.modelId,
        prompt: request.prompt,
        duration: Number(request.settings.duration ?? 5),
        resolution: String(request.settings.resolution ?? '720p'),
        aspectRatio: String(request.settings.aspectRatio ?? '16:9'),
      });
      return { ok: true as const, value: quote };
    } catch (error) {
      return { ok: false as const, error: { code: 'PROVIDER_ERROR' as const, message: error instanceof Error ? error.message : 'Could not estimate Higgsfield credits.' } };
    }
  }

  async confirmAndSubmitJob(quoteId: string, confirmed: boolean) {
    try {
      const result = await createHiggsfieldJob(this.getConfig(), quoteId, confirmed);
      return { ok: true as const, value: result };
    } catch (error) {
      return { ok: false as const, error: { code: 'PROVIDER_ERROR' as const, message: error instanceof Error ? error.message : 'Higgsfield generation was not started.' } };
    }
  }

  async getJob(id?: string): Promise<Result<MediaJob>> {
    if (!id) return { ok: false, error: { code: 'NOT_CONNECTED', message: 'Provide a Higgsfield job ID to look up.' } };
    try {
      const raw = await getHiggsfieldJob(this.getConfig(), id);
      const value = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const statusText = String(value.status ?? '').toLowerCase();
      const outputsRaw = Array.isArray(value.outputs) ? value.outputs : value.result_url ? [{ url: value.result_url }] : [];
      const outputs = outputsRaw.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const item = entry as Record<string, unknown>;
        const url = typeof item.url === 'string' ? item.url : typeof item.result_url === 'string' ? item.result_url : null;
        if (!url) return [];
        return [{ url, mime: typeof item.mime_type === 'string' ? item.mime_type : 'video/mp4' }];
      });
      if (['completed', 'succeeded', 'success'].includes(statusText) && outputs.length) {
        return { ok: true, value: { id, status: 'completed', outputs: outputs as [ { url: string; mime: string }, ...{ url: string; mime: string }[] ] } };
      }
      if (['failed', 'error', 'cancelled', 'canceled'].includes(statusText)) {
        return { ok: true, value: { id, status: statusText.includes('cancel') ? 'cancelled' : 'failed', error: String(value.error ?? value.message ?? 'Higgsfield job failed.') } };
      }
      return { ok: true, value: { id, status: statusText === 'running' || statusText === 'processing' ? 'running' : 'queued', progress: typeof value.progress === 'number' ? value.progress : undefined } };
    } catch (error) {
      return { ok: false, error: { code: 'PROVIDER_ERROR', message: error instanceof Error ? error.message : 'Could not retrieve Higgsfield job.' } };
    }
  }
}
