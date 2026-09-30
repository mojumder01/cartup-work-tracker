import type { CellValue } from '../types';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export const isBlank = (v: CellValue | undefined): boolean =>
  v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/** Parses numbers such as 1234, "1,234", " 12 ". Returns null for text like "N/A". */
export function toNumber(v: CellValue | undefined): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean') return null;
  if (typeof v !== 'string') return null;
  const s = v.replace(/,/g, '').trim();
  if (s === '' || !/^-?\d+(\.\d+)?%?$/.test(s)) return null;
  const n = parseFloat(s);
  return s.endsWith('%') ? n / 100 : n;
}

/** Spreadsheet serial (days since 1899-12-30) to local-time epoch ms. */
function serialToMs(serial: number): number {
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial * 86400) * 1000;
  const d = new Date(utc);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime();
}

/**
 * Parses the date formats that can appear in the sheet into local epoch ms:
 * ISO "2026-09-30" / "2026-09-30T11:30:00", "9/30/2026 11:30:00" (M/D/Y),
 * and raw serial numbers.
 */
export function parseDate(v: CellValue | undefined): number | null {
  if (v === null || v === undefined || typeof v === 'boolean') return null;
  if (typeof v === 'number') return v > 20000 && v < 80000 ? serialToMs(v) : null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime();
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime();
  return null;
}

/**
 * Month key "YYYY-MM" from a month label ("September 2025", "Sep 2025"),
 * an ISO date, or a serial. Returns null when it cannot be determined.
 */
export function toMonthKey(v: CellValue | undefined): string | null {
  if (isBlank(v ?? null)) return null;
  if (typeof v === 'string') {
    const m = v.trim().toLowerCase().match(/^([a-z]+)[\s,-]+(\d{4})$/);
    if (m) {
      const idx = MONTHS.findIndex((name) => name.startsWith(m[1].slice(0, 3)));
      if (idx >= 0) return `${m[2]}-${String(idx + 1).padStart(2, '0')}`;
    }
    const k = v.trim().match(/^(\d{4})-(\d{2})$/);
    if (k) return `${k[1]}-${k[2]}`;
  }
  const ms = parseDate(v ?? null);
  return ms === null ? null : monthKeyOf(ms);
}

export const monthKeyOf = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

export function monthShort(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('en-GB', { month: 'short', year: '2-digit' });
}

/** Yes/No style flags. Returns null for anything that is not clearly a flag. */
export function toFlag(v: CellValue | undefined): boolean | null {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (['yes', 'y', 'true', 'done', '✓', '✔'].includes(s)) return true;
  if (['no', 'n', 'false', '-', 'n/a', 'na'].includes(s)) return false;
  return null;
}

export const text = (v: CellValue | undefined): string => (isBlank(v ?? null) ? '' : String(v).trim());
