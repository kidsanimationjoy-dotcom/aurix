import { useEffect, useState } from 'react';
import { parseRoute } from './routes';

export function useRoute(): string {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
export function navigate(path: string) { window.location.hash = path; }
