import { interfaceOnlyStatus, notImplemented } from './base';
import type { MediaAdapter, ProviderMeta } from './types';

export const higgsfieldMeta: ProviderMeta = {
  id: 'higgsfield',
  name: 'Higgsfield',
  vendor: 'Higgsfield',
  role: 'AI video and image generation',
  plannedCapabilities: ['media_video', 'media_image', 'model_discovery'],
  authentication: 'Official Higgsfield authentication, handled server-side or by the local companion. Credentials never reach browser code.',
  references: [
    { label: 'Higgsfield skills', url: 'https://github.com/higgsfield-ai/skills' },
    { label: 'Higgsfield Open', url: 'https://open.higgsfield.ai/' },
  ],
  constraints: [
    'Models, resolutions and durations must be discovered from Higgsfield, never hardcoded.',
    'A job is complete only when Higgsfield returns a result file.',
  ],
};

export class HiggsfieldAdapter implements MediaAdapter {
  readonly meta = higgsfieldMeta;
  async getStatus() { return interfaceOnlyStatus(this.meta); }
  listModels() { return notImplemented<never>(this.meta, 'model discovery'); }
  submitJob() { return notImplemented<never>(this.meta, 'generation'); }
  getJob() { return notImplemented<never>(this.meta, 'job tracking'); }
}
