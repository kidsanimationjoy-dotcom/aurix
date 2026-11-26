import type { IconName } from '../ui/Icon';

export interface NavItem { path: string; label: string; icon: IconName; group: string }

export const NAV: NavItem[] = [
  { path: '/', label: 'Home', icon: 'home', group: 'Workspace' },
  { path: '/projects', label: 'Projects', icon: 'folder', group: 'Workspace' },
  { path: '/coding', label: 'Coding Studio', icon: 'code', group: 'Workspace' },
  { path: '/tasks', label: 'Task Center', icon: 'list', group: 'Workspace' },
  { path: '/research', label: 'Research', icon: 'search', group: 'Workspace' },
  { path: '/media', label: 'Media Studio', icon: 'film', group: 'Create' },
  { path: '/3d', label: '3D Website Studio', icon: 'cube', group: 'Create' },
  { path: '/agents', label: 'Agents', icon: 'agent', group: 'Extend' },
  { path: '/skills', label: 'Skills', icon: 'spark', group: 'Extend' },
  { path: '/plugins', label: 'Plugins', icon: 'plug', group: 'Extend' },
  { path: '/mcp', label: 'MCP Tools', icon: 'link', group: 'Extend' },
  { path: '/memory', label: 'Memory', icon: 'brain', group: 'Library' },
  { path: '/assets', label: 'Asset Library', icon: 'image', group: 'Library' },
  { path: '/usage', label: 'Usage', icon: 'chart', group: 'System' },
  { path: '/activity', label: 'Activity', icon: 'list', group: 'System' },
  { path: '/settings', label: 'Settings', icon: 'gear', group: 'System' },
];

/** '#/projects?x=1' -> '/projects'. Unknown paths resolve to '/'. */
export function parseRoute(hash: string): string {
  const raw = hash.replace(/^#/, '').split('?')[0] ?? '';
  const path = raw === '' ? '/' : raw.startsWith('/') ? raw : `/${raw}`;
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return NAV.some((n) => n.path === clean) ? clean : '/';
}
