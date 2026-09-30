import { useCallback, useEffect, useState } from 'react';
import type { Route } from '../types';

const ROUTES: Route[] = ['dashboard', 'work', 'kpi', 'team', 'upload', 'qc', 'visual', 'reports', 'settings'];

const read = (): Route => {
  const r = window.location.hash.replace(/^#\/?/, '').split('?')[0] as Route;
  return ROUTES.includes(r) ? r : 'dashboard';
};

/** Hash routing works on GitHub Pages without any 404 redirect tricks. */
export function useHashRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = useCallback((r: Route) => {
    if (read() !== r) window.location.hash = `/${r}`;
    window.scrollTo({ top: 0 });
  }, []);
  return [route, navigate];
}
