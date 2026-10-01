import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Dataset, DashboardData, KpiReport, Route, WorkRecord } from '../types';
import { buildDataset } from '../utils/dataset';
import { parseKpiTab } from '../utils/kpiParser';
import { applyFilters, emptyFilters, type Drill, type Filters } from '../utils/filters';
import { useDebounce } from './useDebounce';
import { useLocalStorage } from './useLocalStorage';
import { buildRoster, type Person, type RosterOverride, type RosterOverrides } from '../utils/roster';

interface AppState {
  data: DashboardData;
  dataset: Dataset;
  kpi: KpiReport | null;
  target: KpiReport | null;
  filters: Filters;
  setFilters: (f: Filters | ((prev: Filters) => Filters)) => void;
  setDim: (column: string, value: string) => void;
  setDrill: (drill: Drill | null, goTo?: Route) => void;
  resetFilters: () => void;
  /** Records after all filters except search. */
  filtered: WorkRecord[];
  /** `filtered` + global search (Work Sheet table & exports). */
  searched: WorkRecord[];
  navigate: (r: Route) => void;
  person: string;
  setPerson: (name: string) => void;
  openPerson: (name: string) => void;
  /** Team roster (defaults + Team Members tab + this browser's changes). */
  roster: Person[];
  rosterOverrides: RosterOverrides;
  /** Save a roster change in this browser; `null` removes the local change. */
  setRosterOverride: (name: string, patch: RosterOverride | null) => void;
  clearRosterOverrides: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ data, navigate, children }: { data: DashboardData; navigate: (r: Route) => void; children: ReactNode }) {
  const dataset = useMemo(() => buildDataset(data), [data]);
  const kpi = useMemo(() => (data.kpi ? safeParse(data.kpi) : null), [data]);
  const target = useMemo(() => (data.target ? safeParse(data.target) : null), [data]);
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [person, setPerson] = useState('');
  const search = useDebounce(filters.search, 180);
  const [rosterOverrides, setRosterOverrides] = useLocalStorage<RosterOverrides>('cartup.roster', {});
  const roster = useMemo(
    () => buildRoster(dataset, kpi, data.team, rosterOverrides, data.performance?.team),
    [dataset, kpi, data.team, rosterOverrides, data.performance],
  );
  const setRosterOverride = useCallback(
    (name: string, patch: RosterOverride | null) => {
      const next = { ...rosterOverrides };
      if (patch === null) delete next[name];
      else next[name] = { ...next[name], ...patch };
      setRosterOverrides(next);
    },
    [rosterOverrides, setRosterOverrides],
  );
  const clearRosterOverrides = useCallback(() => setRosterOverrides({}), [setRosterOverrides]);

  const filtered = useMemo(() => applyFilters(dataset.records, filters, { ignoreSearch: true }), [
    dataset,
    // search is excluded on purpose so typing does not recompute every chart
    filters.datePreset, filters.dateFrom, filters.dateTo, filters.dateBasis, filters.month, filters.dims, filters.employee, filters.drill,
  ]);
  const searched = useMemo(
    () => (search.trim() ? applyFilters(filtered, { ...emptyFilters(), search }) : filtered),
    [filtered, search],
  );

  const setDim = useCallback((column: string, value: string) => {
    setFilters((f) => ({ ...f, dims: { ...f.dims, [column]: value } }));
  }, []);
  const setDrill = useCallback(
    (drill: Drill | null, goTo?: Route) => {
      setFilters((f) => ({ ...f, drill }));
      if (goTo) navigate(goTo);
    },
    [navigate],
  );
  const resetFilters = useCallback(() => setFilters(emptyFilters()), []);
  const openPerson = useCallback(
    (name: string) => {
      setPerson(name);
      navigate('team');
    },
    [navigate],
  );

  const value: AppState = {
    data, dataset, kpi, target, filters, setFilters, setDim, setDrill, resetFilters,
    filtered, searched, navigate, person, setPerson, openPerson,
    roster, rosterOverrides, setRosterOverride, clearRosterOverrides,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function safeParse(tab: NonNullable<DashboardData['kpi']>): KpiReport | null {
  try {
    return parseKpiTab(tab);
  } catch (e) {
    console.error('KPI parse failed', e);
    return null;
  }
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
