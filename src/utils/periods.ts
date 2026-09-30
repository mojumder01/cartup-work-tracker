import { dashboardConfig } from '../config/dashboard.config';
import { WEEK_NUMBERING } from '../config/people.config';

export type PeriodType = 'week' | 'month' | 'year';
export type CompareMode = 'previous' | 'lastYear';

export interface Period {
  type: PeriodType;
  /** Inclusive start (local midnight). */
  start: number;
  /** Exclusive end (local midnight). */
  end: number;
  /** "Week 37" · "September 2026" · "2026" */
  label: string;
  /** "13–19 Sep 2026" */
  range: string;
  /** Short label for table headers: "W37" · "Sep 26" · "2026" */
  short: string;
  year: number;
  /** Week number / month index (1-based) / year. */
  index: number;
}

const DAY = 86400000;
const day = (y: number, m: number, d: number) => new Date(y, m, d).getTime();
const ws = () => dashboardConfig.weekStartsOn;

/** Local midnight of the first week-start day on or after Jan 1. */
function firstFullWeekStart(year: number): number {
  const jan1 = new Date(year, 0, 1);
  const offset = (ws() - jan1.getDay() + 7) % 7;
  return day(year, 0, 1 + offset);
}

export function weekStartOf(ms: number): number {
  const d = new Date(ms);
  const diff = (d.getDay() - ws() + 7) % 7;
  return day(d.getFullYear(), d.getMonth(), d.getDate() - diff);
}

function weekNumber(start: number): { year: number; index: number } {
  const y = new Date(start).getFullYear();
  if (WEEK_NUMBERING === 'weeknum') {
    // Google Sheets WEEKNUM(date, 1): the week containing Jan 1 is week 1.
    const saturday = start + 6 * DAY;
    const yy = new Date(saturday).getFullYear();
    const first = weekStartOf(day(yy, 0, 1));
    return { year: yy, index: Math.round((start - first) / (7 * DAY)) + 1 };
  }
  return { year: y, index: Math.round((start - firstFullWeekStart(y)) / (7 * DAY)) + 1 };
}

const fmtDay = (ms: number, opts: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleDateString('en-GB', opts);

export function weekPeriod(anyDay: number): Period {
  const start = weekStartOf(anyDay);
  const end = start + 7 * DAY;
  const last = end - DAY;
  const { year, index } = weekNumber(start);
  const sameMonth = new Date(start).getMonth() === new Date(last).getMonth();
  const range = sameMonth
    ? `${fmtDay(start, { day: 'numeric' })}–${fmtDay(last, { day: 'numeric', month: 'short', year: 'numeric' })}`
    : `${fmtDay(start, { day: 'numeric', month: 'short' })} – ${fmtDay(last, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  return { type: 'week', start, end, label: `Week ${index}`, range, short: `W${index}`, year, index };
}

export function monthPeriod(y: number, m: number): Period {
  const start = day(y, m, 1);
  const end = day(y, m + 1, 1);
  const d = new Date(start);
  return {
    type: 'month',
    start,
    end,
    label: d.toLocaleString('en-GB', { month: 'long', year: 'numeric' }),
    range: `${fmtDay(start, { day: 'numeric', month: 'short' })} – ${fmtDay(end - DAY, { day: 'numeric', month: 'short', year: 'numeric' })}`,
    short: d.toLocaleString('en-GB', { month: 'short', year: '2-digit' }),
    year: y,
    index: m + 1,
  };
}

export function yearPeriod(y: number): Period {
  return { type: 'year', start: day(y, 0, 1), end: day(y + 1, 0, 1), label: String(y), range: `1 Jan – 31 Dec ${y}`, short: String(y), year: y, index: y };
}

export function periodContaining(type: PeriodType, ms: number): Period {
  const d = new Date(ms);
  if (type === 'week') return weekPeriod(ms);
  if (type === 'month') return monthPeriod(d.getFullYear(), d.getMonth());
  return yearPeriod(d.getFullYear());
}

/** Period to compare against: the one before, or the same period a year earlier. */
export function comparisonPeriod(p: Period, mode: CompareMode): Period {
  if (p.type === 'year') return yearPeriod(p.year - 1);
  if (p.type === 'month') {
    const d = new Date(p.start);
    return mode === 'previous' ? monthPeriod(d.getFullYear(), d.getMonth() - 1) : monthPeriod(d.getFullYear() - 1, d.getMonth());
  }
  if (mode === 'previous') return weekPeriod(p.start - 7 * DAY);
  // Same week number last year.
  const target = p.index;
  const y = p.year - 1;
  const base = WEEK_NUMBERING === 'weeknum' ? weekStartOf(day(y, 0, 1)) : firstFullWeekStart(y);
  return weekPeriod(base + (target - 1) * 7 * DAY);
}

/** Periods (newest first) from `fromMs` up to the one containing `toMs`. */
export function listPeriods(type: PeriodType, fromMs: number, toMs: number): Period[] {
  const out: Period[] = [];
  let p = periodContaining(type, toMs);
  const floor = periodContaining(type, fromMs).start;
  while (p.start >= floor && out.length < 400) {
    out.push(p);
    p = periodContaining(type, p.start - DAY);
  }
  return out;
}

export const periodKey = (p: Period) => `${p.type}:${p.start}`;

export function samePeriodYear(a: Period, b: Period): boolean {
  return a.year === b.year;
}

/** "Week 37 vs Week 38" (with years when they differ). */
export function comparisonTitle(prev: Period, cur: Period): string {
  const withYear = !samePeriodYear(prev, cur) && prev.type !== 'year';
  const l = (p: Period) => (withYear && p.type === 'week' ? `${p.label} ${p.year}` : p.label);
  return `${l(prev)} vs ${l(cur)}`;
}
