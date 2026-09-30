import { dashboardConfig, C } from '../config/dashboard.config';
import type { Dataset, WorkRecord } from '../types';
import { isBlank, monthKeyOf, text, toFlag, toMonthKey, toNumber } from './parse';
import { ratioPct } from './format';

export const BLANK_LABEL = '(blank)';

/** Sum of a numeric column; null when the column does not exist. */
export function sumCol(ds: Dataset, records: WorkRecord[], column: string): number | null {
  if (!ds.has(column)) return null;
  let total = 0;
  for (const r of records) total += toNumber(r.values[column]) ?? 0;
  return total;
}

/** Rows whose column value is one of `values` (case-insensitive); null when the column is missing. */
export function countIn(ds: Dataset, records: WorkRecord[], column: string, values: string[]): number | null {
  if (!ds.has(column)) return null;
  const set = new Set(values.map((v) => v.toLowerCase()));
  return records.filter((r) => set.has(text(r.values[column]).toLowerCase())).length;
}

export const countFilled = (ds: Dataset, records: WorkRecord[], column: string): number | null =>
  ds.has(column) ? records.filter((r) => !isBlank(r.values[column])).length : null;

export interface Group {
  key: string;
  count: number;
  sum: number;
}

/** Groups by a column: job count plus an optional numeric sum, sorted by count desc. */
export function groupBy(records: WorkRecord[], column: string, sumColumn?: string, includeBlank = false): Group[] {
  const map = new Map<string, Group>();
  for (const r of records) {
    const key = text(r.values[column]) || BLANK_LABEL;
    if (key === BLANK_LABEL && !includeBlank) continue;
    let g = map.get(key);
    if (!g) map.set(key, (g = { key, count: 0, sum: 0 }));
    g.count++;
    if (sumColumn) g.sum += toNumber(r.values[sumColumn]) ?? 0;
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Distinct non-empty values of a column, alphabetically. */
export function distinct(records: WorkRecord[], column: string): string[] {
  const set = new Set<string>();
  for (const r of records) {
    const v = text(r.values[column]);
    if (v) set.add(v);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * "Edited (By Hand)" / "Edited (By AI)" may hold counts, numbers or Yes/No flags.
 * Numeric columns are summed; flag columns count the "yes" rows.
 */
export function editedMetric(
  ds: Dataset,
  records: WorkRecord[],
  column: string,
): { value: number; mode: 'sum' | 'count'; rows: number } | null {
  if (!ds.has(column)) return null;
  let numeric = 0;
  let flags = 0;
  let sum = 0;
  let yes = 0;
  let rows = 0;
  for (const r of records) {
    const v = r.values[column];
    if (isBlank(v)) continue;
    const n = toNumber(v);
    if (n !== null) {
      numeric++;
      sum += n;
      if (n > 0) rows++;
      continue;
    }
    const f = toFlag(v);
    if (f !== null) {
      flags++;
      if (f) {
        yes++;
        rows++;
      }
    }
  }
  if (numeric === 0 && flags === 0) return { value: 0, mode: 'sum', rows: 0 };
  return numeric >= flags ? { value: sum, mode: 'sum', rows } : { value: yes, mode: 'count', rows };
}

export interface Summary {
  totalWork: number;
  completed: number | null;
  pending: number | null;
  totalSku: number | null;
  uploadedSku: number | null;
  rejectedSku: number | null;
  approvedQc: number | null;
  rejectedQc: number | null;
  qcApprovalRate: number | null;
  uploadRate: number | null;
  skuRejectionRate: number | null;
  uploadJobs: number | null;
  qcDone: number | null;
  imageJobs: number | null;
  imageCount: number | null;
  imagesDelivered: number | null;
  manual: ReturnType<typeof editedMetric>;
  ai: ReturnType<typeof editedMetric>;
  aiShare: number | null;
}

export function summarize(ds: Dataset, records: WorkRecord[]): Summary {
  const cfg = dashboardConfig;
  const approvedQc = sumCol(ds, records, C.approvedQc);
  const rejectedQc = sumCol(ds, records, C.rejectedQc);
  const totalSku = sumCol(ds, records, C.skuCount);
  const uploadedSku = sumCol(ds, records, C.uploadedSku);
  const rejectedSku = sumCol(ds, records, C.rejectedSku);
  const manual = editedMetric(ds, records, C.editedByHand);
  const ai = editedMetric(ds, records, C.editedByAi);
  const imageJobs = ds.has(C.visualEditor) || ds.has(C.imageStatus)
    ? records.filter((r) => !isBlank(r.values[C.visualEditor]) || !isBlank(r.values[C.imageStatus])).length
    : null;
  return {
    totalWork: records.length,
    completed: countIn(ds, records, C.status, cfg.statusGroups.completed),
    pending: countIn(ds, records, C.status, cfg.statusGroups.pending),
    totalSku,
    uploadedSku,
    rejectedSku,
    approvedQc,
    rejectedQc,
    qcApprovalRate: approvedQc !== null && rejectedQc !== null ? ratioPct(approvedQc, approvedQc + rejectedQc) : null,
    uploadRate: uploadedSku !== null && totalSku !== null ? ratioPct(uploadedSku, totalSku) : null,
    skuRejectionRate: rejectedSku !== null && totalSku !== null ? ratioPct(rejectedSku, totalSku) : null,
    uploadJobs: countFilled(ds, records, C.uploadDate),
    qcDone: countIn(ds, records, C.qcStatus, cfg.qcDoneValues),
    imageJobs,
    imageCount: sumCol(ds, records, C.imageCount),
    imagesDelivered: countIn(ds, records, C.imageStatus, cfg.imageDeliveredValues),
    manual,
    ai,
    aiShare: manual && ai ? ratioPct(ai.value, ai.value + manual.value) : null,
  };
}

export type Granularity = 'day' | 'week' | 'month';

const startOfWeek = (ms: number) => {
  const d = new Date(ms);
  const diff = (d.getDay() - dashboardConfig.weekStartsOn + 7) % 7;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff).getTime();
};
const startOfDay = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export interface SeriesPoint {
  key: string;
  ms: number;
  count: number;
  sum: number;
}

/** Buckets records by a date column. Missing dates are skipped. */
export function timeSeries(records: WorkRecord[], dateColumn: string, granularity: Granularity, sumColumn?: string): SeriesPoint[] {
  const map = new Map<string, SeriesPoint>();
  for (const r of records) {
    const ms = r.dates[dateColumn];
    if (ms === null || ms === undefined) continue;
    let key: string;
    let bucket: number;
    if (granularity === 'month') {
      key = monthKeyOf(ms);
      const d = new Date(ms);
      bucket = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    } else {
      bucket = granularity === 'week' ? startOfWeek(ms) : startOfDay(ms);
      key = String(bucket);
    }
    let p = map.get(key);
    if (!p) map.set(key, (p = { key, ms: bucket, count: 0, sum: 0 }));
    p.count++;
    if (sumColumn) p.sum += toNumber(r.values[sumColumn]) ?? 0;
  }
  return [...map.values()].sort((a, b) => a.ms - b.ms);
}

/**
 * Groups by a month *column* (e.g. "Upload Month"), falling back to the given date column.
 * Returns month keys "YYYY-MM".
 */
export function byMonth(ds: Dataset, records: WorkRecord[], monthColumn: string, dateColumn: string, sumColumn?: string) {
  const map = new Map<string, { key: string; count: number; sum: number }>();
  const useMonthCol = ds.has(monthColumn);
  for (const r of records) {
    const key = (useMonthCol ? toMonthKey(r.values[monthColumn]) : null) ??
      (r.dates[dateColumn] != null ? monthKeyOf(r.dates[dateColumn] as number) : null);
    if (!key) continue;
    let g = map.get(key);
    if (!g) map.set(key, (g = { key, count: 0, sum: 0 }));
    g.count++;
    if (sumColumn) g.sum += toNumber(r.values[sumColumn]) ?? 0;
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** Median of (end date − start date) in days, ignoring negatives and missing dates. */
export function medianTurnaroundDays(records: WorkRecord[], startCol: string, endCol: string): number | null {
  const days: number[] = [];
  for (const r of records) {
    const s = r.dates[startCol];
    const e = r.dates[endCol];
    if (s == null || e == null) continue;
    const sd = new Date(s);
    const d = (e - new Date(sd.getFullYear(), sd.getMonth(), sd.getDate()).getTime()) / 86400000;
    if (d >= 0) days.push(d);
  }
  if (!days.length) return null;
  days.sort((a, b) => a - b);
  const mid = Math.floor(days.length / 2);
  return days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2;
}

/** Per-person totals for one role column. */
export interface PersonRow {
  name: string;
  jobs: number;
  sku: number;
  uploadedSku: number;
  rejectedSku: number;
  approvedQc: number;
  rejectedQc: number;
  images: number;
  ai: number;
  manual: number;
}

export function personTable(records: WorkRecord[], roleColumn: string): PersonRow[] {
  const map = new Map<string, PersonRow>();
  const n = (r: WorkRecord, c: string) => toNumber(r.values[c]) ?? 0;
  for (const r of records) {
    const name = text(r.values[roleColumn]);
    if (!name) continue;
    let p = map.get(name);
    if (!p)
      map.set(
        name,
        (p = { name, jobs: 0, sku: 0, uploadedSku: 0, rejectedSku: 0, approvedQc: 0, rejectedQc: 0, images: 0, ai: 0, manual: 0 }),
      );
    p.jobs++;
    p.sku += n(r, C.skuCount);
    p.uploadedSku += n(r, C.uploadedSku);
    p.rejectedSku += n(r, C.rejectedSku);
    p.approvedQc += n(r, C.approvedQc);
    p.rejectedQc += n(r, C.rejectedQc);
    p.images += n(r, C.imageCount);
    p.ai += n(r, C.editedByAi) || (toFlag(r.values[C.editedByAi]) ? 1 : 0);
    p.manual += n(r, C.editedByHand) || (toFlag(r.values[C.editedByHand]) ? 1 : 0);
  }
  return [...map.values()].sort((a, b) => b.jobs - a.jobs);
}
