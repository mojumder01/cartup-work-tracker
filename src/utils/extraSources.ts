/**
 * Column detection and numbers for the extra sheets (Retail [Picks] Upload Request,
 * Admin Portal Pending QC). Columns are found by header name; when a needed column
 * is missing the metric is simply not shown (nothing is guessed).
 */
import type { CellValue, ExtraTable } from '../types';
import { parseDate, text, toNumber } from './parse';
import type { Period } from './periods';

type Field = { label: string; names: string[] };

export const RETAIL_FIELDS = {
  person: { label: 'Uploaded by', names: ['Uploaded By', 'Upload By', 'Uploaded by'] },
  date: { label: 'Upload date', names: ['Upload Date', 'Upload date', 'Uploaded Date'] },
  skus: { label: 'Uploaded SKUs', names: ['Uploaded SKU Count', 'Uploaded SKU', 'Uploaded SKUs', 'Number of SKU', 'Number of SKUs', 'SKU Count'] },
  status: { label: 'Upload status', names: ['Upload Status', 'Status'] },
  seller: { label: 'Seller', names: ['Seller Code', 'Shop Name', 'Seller', 'Shop'] },
} satisfies Record<string, Field>;

export const PENDING_QC_FIELDS = {
  skus: { label: 'SKUs', names: ['Number of SKUs', 'Number of SKU', 'SKU Count', 'Total SKU', 'Total SKUs', 'SKUs', 'Pending SKU', 'Pending SKUs'] },
  seller: { label: 'Seller', names: ['Seller Code', 'Seller ID', 'Seller', 'Shop Name', 'Shop'] },
  status: { label: 'Status', names: ['QC Status', 'Status'] },
  date: { label: 'Date', names: ['Date', 'Timestamp', 'Created At', 'Submitted Date', 'Upload Date'] },
} satisfies Record<string, Field>;

export type Mapping<K extends string> = Record<K, string | null>;

export function detect<K extends string>(t: ExtraTable | null | undefined, fields: Record<K, Field>): Mapping<K> {
  const lower = (t?.columns ?? []).map((c) => c.trim().toLowerCase());
  const out = {} as Mapping<K>;
  (Object.keys(fields) as K[]).forEach((k) => {
    const i = fields[k].names.map((n) => lower.indexOf(n.toLowerCase())).find((x) => x >= 0);
    out[k] = i === undefined ? null : (t as ExtraTable).columns[i];
  });
  return out;
}

const objects = (t: ExtraTable) => t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? null])) as Record<string, CellValue>);
const DONE = /^(done|uploaded|complete|completed|live)$/i;

/** Retail Picks uploads per person in a period: rows (sellers) and Σ uploaded SKUs. Null when the sheet or columns are missing. */
export function retailByPerson(t: ExtraTable | null | undefined, p: Period): Map<string, { name: string; sellers: number; skus: number }> | null {
  if (!t) return null;
  const m = detect(t, RETAIL_FIELDS);
  if (!m.person || !m.date || !m.skus) return null;
  const out = new Map<string, { name: string; sellers: number; skus: number }>();
  for (const r of objects(t)) {
    const ms = parseDate(r[m.date]);
    if (ms === null || ms < p.start || ms >= p.end) continue;
    if (m.status && text(r[m.status]) && !DONE.test(text(r[m.status]))) continue;
    const name = text(r[m.person]);
    if (!name) continue;
    const k = name.toLowerCase();
    const g = out.get(k) ?? { name, sellers: 0, skus: 0 };
    g.sellers += 1;
    g.skus += toNumber(r[m.skus]) ?? 0;
    out.set(k, g);
  }
  return out;
}

/** Admin Portal pending QC right now: rows, distinct sellers and Σ SKUs. Null when the sheet is missing. */
export function pendingQcNow(t: ExtraTable | null | undefined): { rows: number; sellers: number | null; skus: number | null } | null {
  if (!t) return null;
  const m = detect(t, PENDING_QC_FIELDS);
  const rows = objects(t).filter((r) => !m.status || !text(r[m.status]) || /pending|waiting|not\s*done|in\s*progress/i.test(text(r[m.status])));
  return {
    rows: rows.length,
    sellers: m.seller ? new Set(rows.map((r) => text(r[m.seller as string])).filter(Boolean)).size : null,
    skus: m.skus ? rows.reduce((z, r) => z + (toNumber(r[m.skus as string]) ?? 0), 0) : null,
  };
}
