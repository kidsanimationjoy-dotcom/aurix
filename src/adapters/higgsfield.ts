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
  private readonly quoteKinds = new Map<string, 'video' | 'image'>();
  private readonly jobKinds = new Map<string, 'video' | 'image'>();

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
        ...(models.some((model) => ['seedance_2_0', 'seedance_2_5'].includes(model.id) && model.kinds.includes('video')) ? ['media_video' as const] : []),
        ...(models.some((model) => model.id === 'gpt_image_2_5' && model.kinds.includes('image')) ? ['media_image' as const] : []),
      ];
    } catch {
      return [];
    }
  }

  async listModels(): Promise<Result<MediaModel[]>> {
    const config = this.getConfig();
    if (!config.url || !config.token) return { ok: false, error: { code: 'NOT_CONNECTED', message: 'Pair the local AURIX companion first.' } };
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
      const config = this.getConfig();
      if (!config.url || !config.token) throw new Error('Pair the local AURIX companion before requesting a Higgsfield quote.');
      if (request.kind === 'video') {
        if (request.modelId === 'seedance_2_5') {
          const quote = await quoteHiggsfieldJob(config, {
            kind: 'video',
            modelId: request.modelId,
            prompt: request.prompt,
            duration: 5,
            resolution: '1080p',
            aspectRatio: '16:9',
            mode: 't2v',
            bitrateMode: 'high',
          });
          this.quoteKinds.set(quote.quoteId, 'video');
          return { ok: true as const, value: quote };
        }
        if (request.modelId !== 'seedance_2_0') throw new Error('AURIX currently supports Seedance 2.5 and 2.0 for paid video generation.');
        const requestedMode = request.settings.mode;
        if (requestedMode !== undefined && requestedMode !== 'std' && requestedMode !== 'fast') throw new Error('Choose a supported Seedance 2.0 generation mode.');
        const quote = await quoteHiggsfieldJob(config, {
          kind: 'video',
          modelId: request.modelId,
          prompt: request.prompt,
          duration: Number(request.settings.duration ?? 5),
          resolution: String(request.settings.resolution ?? '720p'),
          aspectRatio: String(request.settings.aspectRatio ?? '16:9'),
          mode: requestedMode === 'fast' ? 'fast' : 'std',
        });
        this.quoteKinds.set(quote.quoteId, 'video');
        return { ok: true as const, value: quote };
      }

      if (request.modelId !== 'gpt_image_2_5') throw new Error('AURIX currently supports GPT Image 2.5 for paid image generation.');
      const quality = request.settings.quality;
      const variant = request.settings.variant;
      if (quality !== undefined && !['low', 'medium', 'high', 'xhigh', 'max'].includes(String(quality))) throw new Error('Choose a supported GPT Image 2.5 quality.');
      if (variant !== undefined && !['flare', 'sunburst'].includes(String(variant))) throw new Error('Choose a supported GPT Image 2.5 variant.');
      const quote = await quoteHiggsfieldJob(config, {
        kind: 'image',
        modelId: request.modelId,
        prompt: request.prompt,
        resolution: String(request.settings.resolution ?? '1k'),
        aspectRatio: String(request.settings.aspectRatio ?? '1:1'),
        quality: quality === undefined ? 'low' : String(quality),
        variant: variant === undefined ? 'flare' : String(variant),
      });
      this.quoteKinds.set(quote.quoteId, 'image');
      return { ok: true as const, value: quote };
    } catch (error) {
      return { ok: false as const, error: { code: 'PROVIDER_ERROR' as const, message: error instanceof Error ? error.message : 'Could not estimate Higgsfield credits.' } };
    }
  }

  async confirmAndSubmitJob(quoteId: string, confirmed: boolean) {
    try {
      const kind = this.quoteKinds.get(quoteId);
      if (!kind) throw new Error('This Higgsfield quote is not available in the current AURIX session. Request a new estimate.');
      const result = await createHiggsfieldJob(this.getConfig(), quoteId, confirmed);
      this.quoteKinds.delete(quoteId);
      this.jobKinds.set(result.jobId, kind);
      return { ok: true as const, value: result };
    } catch (error) {
      return { ok: false as const, error: { code: 'PROVIDER_ERROR' as const, message: error instanceof Error ? error.message : 'Higgsfield generation was not started.' } };
    }
  }

  async getJob(id?: string, kindHint?: 'video' | 'image'): Promise<Result<MediaJob>> {
    if (!id) return { ok: false, error: { code: 'NOT_CONNECTED', message: 'Provide a Higgsfield job ID to look up.' } };
    try {
      const raw = await getHiggsfieldJob(this.getConfig(), id);
      const root = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const value = root.job && typeof root.job === 'object'
        ? root.job as Record<string, unknown>
        : root.data && typeof root.data === 'object'
          ? root.data as Record<string, unknown>
          : root.result && typeof root.result === 'object'
            ? root.result as Record<string, unknown>
            : root;
      const statusText = String(value.status ?? '').toLowerCase();
      const inferredKind = kindHint ?? this.jobKinds.get(id) ?? (value.kind === 'image' || value.type === 'image' ? 'image' : 'video');
      const candidates = Array.isArray(value.outputs)
        ? value.outputs
        : [value.result_url, value.output_url, value.video_url, value.image_url].filter((item) => typeof item === 'string').map((url) => ({ url }));
      const outputs = candidates.flatMap((entry) => {
        if (typeof entry === 'string') return [{ url: entry, mime: inferredKind === 'image' ? 'image/png' : 'video/mp4' }];
        if (!entry || typeof entry !== 'object') return [];
        const item = entry as Record<string, unknown>;
        const url = typeof item.url === 'string' ? item.url
          : typeof item.result_url === 'string' ? item.result_url
            : typeof item.file_url === 'string' ? item.file_url : null;
        if (!url) return [];
        const mime = typeof item.mime_type === 'string' ? item.mime_type
          : typeof item.content_type === 'string' ? item.content_type
            : inferredKind === 'image' ? 'image/png' : 'video/mp4';
        return [{ url, mime }];
      });
      if (['completed', 'succeeded', 'success', 'done'].includes(statusText) && outputs.length) {
        return { ok: true, value: { id, status: 'completed', outputs: outputs as [{ url: string; mime: string }, ...{ url: string; mime: string }[]] } };
      }
      if (['failed', 'error', 'cancelled', 'canceled'].includes(statusText)) {
        return { ok: true, value: { id, status: statusText.includes('cancel') ? 'cancelled' : 'failed', error: String(value.error ?? value.message ?? 'Higgsfield job failed.') } };
      }
      return { ok: true, value: { id, status: statusText === 'running' || statusText === 'processing' || statusText === 'in_progress' ? 'running' : 'queued', progress: typeof value.progress === 'number' ? value.progress : undefined } };
    } catch (error) {
      return { ok: false, error: { code: 'PROVIDER_ERROR', message: error instanceof Error ? error.message : 'Could not retrieve Higgsfield job.' } };
    }
  }
}
