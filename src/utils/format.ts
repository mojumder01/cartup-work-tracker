export const NA = 'N/A';

const intFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return NA;
  return Number.isInteger(n) ? intFmt.format(n) : decFmt.format(n);
}

/** Compact for big standalone values: 1,284 / 12.9K / 4.2M. */
export function fmtCompact(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return NA;
  return Math.abs(n) < 10000 ? intFmt.format(Math.round(n)) : compactFmt.format(n);
}

export function fmtPct(p: number | null | undefined, digits = 1): string {
  if (p === null || p === undefined || !Number.isFinite(p)) return NA;
  return `${p.toFixed(digits).replace(/\.0+$/, '')}%`;
}

export function fmtSigned(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return NA;
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${intFmt.format(Math.abs(n))}`;
}

/** Safe ratio as a percentage; null when the denominator is 0. */
export const ratioPct = (num: number, den: number): number | null => (den > 0 ? (num / den) * 100 : null);

export function fmtDate(ms: number | null | undefined, withTime = false): string {
  if (ms === null || ms === undefined) return '';
  const d = new Date(ms);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (!withTime) return date;
  return `${date}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

export function fmtRelative(ms: number, now = Date.now()): string {
  const mins = Math.round((now - ms) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export const toIsoDate = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
