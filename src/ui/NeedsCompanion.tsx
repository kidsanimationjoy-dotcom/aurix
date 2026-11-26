import { useApp } from '../state/AppState';
import { navigate } from '../router/useRoute';
import { EmptyState } from './kit';

/** Shown wherever a feature requires real local execution. Never simulates the feature. */
export function NeedsCompanion({ what }: { what: string }) {
  const { companion } = useApp();
  return (
    <EmptyState
      icon="plug"
      title={`${what} needs the local companion`}
      action={<button className="btn" onClick={() => navigate('/settings')}>Open companion settings</button>}
    >
      A browser tab cannot safely run commands or touch your disk. Companion status: <b>{companion.state.replace('_', ' ')}</b>. {companion.message}{' '}
      Even when the companion connects, this build only implements its health check, so {what.toLowerCase()} stays unavailable until a later phase.
    </EmptyState>
  );
}
