import { interfaceOnlyStatus, notImplemented } from './base';
import type { ProviderMeta, UiComponentAdapter } from './types';

export const twentyFirstMeta: ProviderMeta = {
  id: 'twentyfirst',
  name: '21st.dev',
  vendor: '21st.dev',
  role: 'UI component, theme and template intelligence',
  plannedCapabilities: ['ui_components', 'themes', 'mcp', 'skills'],
  authentication: 'To be confirmed against 21st.dev documentation before implementation.',
  references: [
    { label: '21st.dev skill', url: 'https://github.com/21st-dev/skill' },
    { label: '21st.dev MCP endpoint', url: 'https://21st.dev/api/mcp' },
  ],
  constraints: ['21st.dev supplies UI components; it is not a 3D rendering engine.'],
};

export class TwentyFirstAdapter implements UiComponentAdapter {
  readonly meta = twentyFirstMeta;
  async getStatus() { return interfaceOnlyStatus(this.meta); }
  searchComponents() { return notImplemented<never>(this.meta, 'component search'); }
  getComponentSource() { return notImplemented<never>(this.meta, 'component source retrieval'); }
}
