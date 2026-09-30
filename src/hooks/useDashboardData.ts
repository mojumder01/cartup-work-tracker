import { useCallback, useEffect, useRef, useState } from 'react';
import { loadDashboardData, DataLoadError } from '../services/dataService';
import type { DashboardData } from '../types';

export interface DataState {
  data: DashboardData | null;
  loading: boolean;
  /** Friendly error; when `data` is also set, the last good snapshot is still shown. */
  error: string | null;
  checkedAt: number | null;
  refresh: () => void;
}

/** Loads data.json and re-checks it every `intervalMinutes` (0 = off). */
export function useDashboardData(intervalMinutes: number): DataState {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const controller = useRef<AbortController | null>(null);
  const lastUpdatedAt = useRef<string | null>(null);

  const refresh = useCallback(() => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setLoading(true);
    loadDashboardData(ac.signal)
      .then((json) => {
        // Skip re-processing when the snapshot has not changed.
        if (json.updatedAt !== lastUpdatedAt.current) {
          lastUpdatedAt.current = json.updatedAt;
          setData(json);
        }
        setError(null);
        setCheckedAt(Date.now());
      })
      .catch((e: unknown) => {
        if ((e as Error).name === 'AbortError') return;
        setError(e instanceof DataLoadError ? e.message : 'Unable to load dashboard data. Please try again later.');
        setCheckedAt(Date.now());
      })
      .finally(() => {
        if (controller.current === ac) setLoading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
    return () => controller.current?.abort();
  }, [refresh]);

  useEffect(() => {
    if (!intervalMinutes) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, intervalMinutes * 60000);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && checkedAt && Date.now() - checkedAt > intervalMinutes * 60000) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [intervalMinutes, refresh, checkedAt]);

  return { data, loading, error, checkedAt, refresh };
}
