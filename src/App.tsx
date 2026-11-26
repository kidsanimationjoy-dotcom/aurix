import { Component, type ReactNode } from 'react';
import { useRoute } from './router/useRoute';
import { Shell } from './ui/Shell';
import { Home } from './pages/Home';
import { Projects } from './pages/Projects';
import { Coding } from './pages/Coding';
import { Research } from './pages/Research';
import { Media } from './pages/Media';
import { Studio3D } from './pages/Studio3D';
import { Agents } from './pages/Agents';
import { Skills } from './pages/Skills';
import { Plugins } from './pages/Plugins';
import { Mcp } from './pages/Mcp';
import { Memory } from './pages/Memory';
import { Assets } from './pages/Assets';
import { Usage } from './pages/Usage';
import { Activity } from './pages/Activity';
import { Settings } from './pages/Settings';
import { Tasks } from './pages/Tasks';

const PAGES: Record<string, () => ReactNode> = {
  '/': () => <Home />,
  '/projects': () => <Projects />,
  '/coding': () => <Coding />,
  '/tasks': () => <Tasks />,
  '/research': () => <Research />,
  '/media': () => <Media />,
  '/3d': () => <Studio3D />,
  '/agents': () => <Agents />,
  '/skills': () => <Skills />,
  '/plugins': () => <Plugins />,
  '/mcp': () => <Mcp />,
  '/memory': () => <Memory />,
  '/assets': () => <Assets />,
  '/usage': () => <Usage />,
  '/activity': () => <Activity />,
  '/settings': () => <Settings />,
};

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="page"><div className="notice bad" role="alert"><div>
          <strong>This page failed to render.</strong>
          <p>{this.state.error.message}</p>
          <button className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
        </div></div></div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const route = useRoute();
  const render = PAGES[route] ?? PAGES['/']!;
  return (
    <Shell route={route}>
      <Boundary key={route}><div className="page">{render()}</div></Boundary>
    </Shell>
  );
}
