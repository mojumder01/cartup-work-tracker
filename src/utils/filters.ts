import { dashboardConfig, C } from '../config/dashboard.config';
import type { WorkRecord } from '../types';
import { monthKeyOf, text, toMonthKey, toNumber } from './parse';

export type DatePreset = 'all' | 'today' | 'yesterday' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'custom';

export const DATE_PRESETS: { id: DatePreset; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'thisWeek', label: 'This week' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'custom', label: 'Custom range' },
];

/** A drill-down set by clicking a KPI card or chart (shown as a removable chip). */
export interface Drill {
  label: string;
  column: string;
  op: 'gt0' | 'in' | 'notBlank';
  values?: string[];
}

export interface Filters {
  datePreset: DatePreset;
  dateFrom: string; // yyyy-mm-dd (custom)
  dateTo: string;
  dateBasis: string;
  /** '' = all, '__current', '__previous', or a month key "YYYY-MM". */
  month: string;
  /** '' = all years, or "YYYY". */
  year: string;
  dims: Record<string, string>;
  employee: string;
  drill: Drill | null;
  search: string;
}

export const emptyFilters = (): Filters => ({
  datePreset: 'all',
  dateFrom: '',
  dateTo: '',
  dateBasis: dashboardConfig.dateBasisColumns[0],
  month: '',
  year: '',
  dims: {},
  employee: '',
  drill: null,
  search: '',
});

/** Inclusive [start, end) range in local epoch ms for a preset. */
export function presetRange(f: Filters, now = new Date()): [number, number] | null {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const day = (yy: number, mm: number, dd: number) => new Date(yy, mm, dd).getTime();
  switch (f.datePreset) {
    case 'today':
      return [day(y, m, d), day(y, m, d + 1)];
    case 'yesterday':
      return [day(y, m, d - 1), day(y, m, d)];
    case 'thisWeek': {
      const diff = (now.getDay() - dashboardConfig.weekStartsOn + 7) % 7;
      return [day(y, m, d - diff), day(y, m, d - diff + 7)];
    }
    case 'thisMonth':
      return [day(y, m, 1), day(y, m + 1, 1)];
    case 'lastMonth':
      return [day(y, m - 1, 1), day(y, m, 1)];
    case 'custom': {
      if (!f.dateFrom && !f.dateTo) return null;
      const from = f.dateFrom ? new Date(`${f.dateFrom}T00:00:00`).getTime() : -Infinity;
      const to = f.dateTo ? new Date(`${f.dateTo}T00:00:00`).getTime() + 86400000 : Infinity;
      return [from, to];
    }
    default:
      return null;
  }
}

export function resolveMonth(month: string, now = new Date()): string | null {
  if (!month) return null;
  if (month === '__current') return monthKeyOf(now.getTime());
  if (month === '__previous') return monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime());
  return month;
}

/** Month key of a record for the Month filter ("Month" column, else Timestamp). */
export const recordMonth = (r: WorkRecord): string | null =>
  toMonthKey(r.values[C.month]) ?? (r.dates[C.timestamp] != null ? monthKeyOf(r.dates[C.timestamp] as number) : null);

export function matchesDrill(r: WorkRecord, drill: Drill): boolean {
  const v = r.values[drill.column];
  if (drill.op === 'gt0') return (toNumber(v) ?? 0) > 0;
  if (drill.op === 'notBlank') return text(v) !== '';
  const set = new Set((drill.values ?? []).map((x) => x.toLowerCase()));
  return set.has(text(v).toLowerCase());
}

export interface ApplyOptions {
  /** Skip date & month filters (used by views that pick their own month). */
  ignoreDate?: boolean;
  ignoreSearch?: boolean;
  /**
   * Use this date column for the date range and month filters instead of the chosen date basis
   * (per-person numbers use the date the work was finished, e.g. "Upload date").
   */
  dateColumn?: string;
}

export function applyFilters(records: WorkRecord[], f: Filters, opts: ApplyOptions = {}): WorkRecord[] {
  const range = opts.ignoreDate ? null : presetRange(f);
  const month = opts.ignoreDate ? null : resolveMonth(f.month);
  const year = opts.ignoreDate ? '' : f.year ?? '';
  const dims = Object.entries(f.dims).filter(([, v]) => v !== '');
  const employee = f.employee.toLowerCase();
  const empCols = dashboardConfig.employeeFilterColumns;
  const terms = opts.ignoreSearch ? [] : f.search.toLowerCase().split(/\s+/).filter(Boolean);

  return records.filter((r) => {
    if (range) {
      const ms = r.dates[opts.dateColumn ?? f.dateBasis];
      if (ms == null || ms < range[0] || ms >= range[1]) return false;
    }
    if (month || year) {
      const own = opts.dateColumn ? r.dates[opts.dateColumn] : undefined;
      const key = opts.dateColumn ? (own != null ? monthKeyOf(own) : null) : recordMonth(r);
      if (month && key !== month) return false;
      if (year && !(key ?? '').startsWith(year)) return false;
    }
    for (const [col, val] of dims) if (text(r.values[col]).toLowerCase() !== val.toLowerCase()) return false;
    if (employee && !empCols.some((c) => text(r.values[c]).toLowerCase() === employee)) return false;
    if (f.drill && !matchesDrill(r, f.drill)) return false;
    for (const t of terms) if (!r.searchText.includes(t)) return false;
    return true;
  });
}

export function activeFilterCount(f: Filters): number {
  return (
    (f.datePreset !== 'all' ? 1 : 0) +
    (f.month ? 1 : 0) +
    (f.year ? 1 : 0) +
    Object.values(f.dims).filter(Boolean).length +
    (f.employee ? 1 : 0) +
    (f.drill ? 1 : 0) +
    (f.search ? 1 : 0)
  );
}
