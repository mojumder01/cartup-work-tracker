import { dashboardConfig } from '../config/dashboard.config';

/**
 * Categorical slots (CSS variables so light/dark steps swap automatically).
 * Order matters: it is the validated colour-vision-deficiency-safe order.
 * Assign in fixed order — never cycle; fold extras into "Other".
 */
export const SERIES = Array.from({ length: 8 }, (_, i) => `var(--series-${i + 1})`);

export const STATUS_COLORS = {
  good: 'var(--good)',
  warn: 'var(--series-4)',
  bad: 'var(--bad)',
  neutral: 'var(--ink-3)',
};

const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());

/** Colour for a Status value: configured groups get status colours, others neutral. */
export function statusColor(value: string): string {
  const v = value.toLowerCase();
  if (lower(dashboardConfig.statusGroups.completed).includes(v) || /done|complete|approved|delivered|live/.test(v)) return STATUS_COLORS.good;
  if (lower(dashboardConfig.statusGroups.pending).includes(v) || /pending|running|progress|open/.test(v)) return STATUS_COLORS.warn;
  if (/reject|cancel|fail|inactive/.test(v)) return STATUS_COLORS.bad;
  return STATUS_COLORS.neutral;
}
