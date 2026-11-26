import { EmptyState, Notice, PageHeader, Panel } from '../ui/kit';

export function Plugins() {
  return (
    <>
      <PageHeader title="Plugins" subtitle="Bundles of tools, commands and skills." />
      <Notice tone="warn">No plugin marketplace is connected and AURIX cannot install or run plugins yet. Nothing is installed.</Notice>
      <Panel><EmptyState icon="plug" title="No plugins installed">Plugin discovery, install, versioning and permission review arrive with the extension phase, together with the backend that has to verify plugin sources.</EmptyState></Panel>
      <Panel title="Planned safety model (not implemented)">
        <ul className="stack" style={{ margin: 0, paddingLeft: 18, gap: 6 }}>
          <li>Plugins install disabled and list every permission they request before you can enable them.</li>
          <li>Hooks and scripts from plugins never run automatically.</li>
          <li>Each plugin version is pinned; updates need your approval.</li>
          <li>Install, enable and permission changes are written to the Activity log.</li>
        </ul>
      </Panel>
    </>
  );
}
