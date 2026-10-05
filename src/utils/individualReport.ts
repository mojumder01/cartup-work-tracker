/**
 * "Individual Summary — <previous> vs <current>" report model.
 *
 * Only finished work counts (dashboardConfig.credit — e.g. Status "Done" for uploads); rows that are
 * assigned but Running / Pending are left out, exactly as on the Team Performance page.
 *
 * Metric definitions (verified against the Week 37 vs Week 38 template):
 *  - Production: rows by "Uploaded by" with an "Upload date" in the period.
 *      Seller = number of rows (one row = one seller request), SKUs = Σ "Uploaded SKU Count".
 *  - Visual: rows by "Visual editor" with an "Image Delivered Date" in the period.
 *      Slr = rows, Hand = Σ "Edited (By Hand)", AI = Σ "Edited (By AI)", Total = Σ "Image count".
 *  - QC: "Upload" = Σ ("Approved QC Count" + "Rejected QC Count") by "QC By" / "QC approved date";
 *      "Seller" = Σ "Number of SKUs" in the "Admin portal QC import data" tab by "QC By" / "QC Date".
 *  - Upload backlog = requests received before the period end that were not uploaded by then
 *      (excluding statuses in BACKLOG_EXCLUDED_STATUSES).
 */
import { C } from '../config/dashboard.config';
import { BACKLOG_EXCLUDED_STATUSES, PEOPLE_DEFAULTS, type TeamId } from '../config/people.config';
import type { Dataset, ExtraTable, FlatTable } from '../types';
import { pendingQcNow, retailByPerson } from './extraSources';
import { fmtNum } from './format';
import { monthKeyOf, parseDate, text, toMonthKey, toNumber } from './parse';
import type { Period } from './periods';
import { findPerson, type Person } from './roster';
import { checkCredit, creditRule } from './credit';

export interface SellerQcRow {
  qcBy: string;
  date: number | null;
  skus: number;
}

export function parseSellerQc(table: FlatTable | null | undefined): SellerQcRow[] | null {
  if (!table) return null;
  const i = (c: string) => table.columns.indexOf(c);
  const [by, date, skus] = [i('QC By'), i('QC Date'), i('Number of SKUs')];
  if (by < 0 || date < 0 || skus < 0) return null;
  return table.rows.map((r) => ({ qcBy: text(r[by]), date: parseDate(r[date]), skus: toNumber(r[skus]) ?? 0 }));
}

type Nums = Record<string, number>;

export interface ReportRow {
  name: string;
  fullName: string;
  prev: Nums | null; // null = no activity in the period
  cur: Nums | null;
  delta: number | null;
  isNew: boolean;
}

export interface ReportSection {
  team: TeamId;
  /** Distinguishes two sections of the same team (e.g. Retail uploads). Defaults to the team. */
  id?: string;
  title: string;
  columns: { key: string; label: string }[];
  deltaKey: string;
  deltaLabel: string;
  rows: ReportRow[];
  total: { prev: Nums; cur: Nums; delta: number };
  /** Metric keys that could not be calculated (missing column/tab). */
  unavailable: string[];
}

export interface GlanceItem {
  label: string;
  /** Shown instead of "prev → cur" (e.g. a value that only exists for today). */
  text?: string;
  prev: number | null;
  cur: number | null;
  /** When true, a decrease is good (e.g. backlog). */
  lowerIsBetter?: boolean;
}

export interface IndividualReport {
  prev: Period;
  cur: Period;
  sections: ReportSection[];
  glance: GlanceItem[];
  summary: string;
  notes: string[];
  backlog: { prev: number | null; cur: number | null };
}

/** Same person despite small spelling differences between sheets ("Iftkhar" ↔ "Iftakhar"). */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
export function matchName(name: string, names: string[]): string | null {
  const k = name.trim().toLowerCase();
  const exact = names.find((x) => x.toLowerCase() === k);
  if (exact) return exact;
  if (k.length < 4) return null;
  const close = names.filter((x) => x.length >= 4 && editDistance(x.toLowerCase(), k) <= (k.length >= 7 ? 2 : 1));
  return close.length === 1 ? close[0] : null;
}

const inRange = (ms: number | null | undefined, p: Period) => ms != null && ms >= p.start && ms < p.end;
const n = (v: unknown) => toNumber(v as never) ?? 0;

/** Per-person sums of finished work (dashboardConfig.credit) dated in the period. */
function sumBy(ds: Dataset, role: string, dateCol: string, p: Period, fields: Record<string, (r: Dataset['records'][number]) => number>, monthCol?: string) {
  const out = new Map<string, Nums>();
  if (!ds.has(role) || !ds.has(dateCol)) return out;
  const rule = creditRule(role);
  for (const r of ds.records) {
    // Month periods: the sheet's month column (e.g. "Upload Month", AN) decides; blank → the date.
    const mk = p.type === 'month' && monthCol && ds.has(monthCol) ? toMonthKey(r.values[monthCol]) : null;
    if (mk ? mk !== monthKeyOf(p.start) : !inRange(r.dates[dateCol], p)) continue;
    if (rule && !checkCredit(ds, r, rule, !mk).counted) continue;
    const name = text(r.values[role]).toLowerCase();
    if (!name) continue;
    let acc = out.get(name);
    if (!acc) out.set(name, (acc = Object.fromEntries(Object.keys(fields).map((k) => [k, 0]))));
    for (const [k, f] of Object.entries(fields)) acc[k] += f(r);
  }
  return out;
}

function buildSection(
  team: TeamId,
  title: string,
  columns: { key: string; label: string }[],
  deltaKey: string,
  deltaLabel: string,
  names: string[],
  roster: Person[],
  prevMap: Map<string, Nums>,
  curMap: Map<string, Nums>,
  unavailable: string[],
): ReportSection {
  const zero = () => Object.fromEntries(columns.map((c) => [c.key, 0])) as Nums;
  const total = { prev: zero(), cur: zero(), delta: 0 };
  const rows = names.map((name) => {
    const p = prevMap.get(name.toLowerCase()) ?? null;
    const c = curMap.get(name.toLowerCase()) ?? null;
    for (const col of columns) {
      total.prev[col.key] += p?.[col.key] ?? 0;
      total.cur[col.key] += c?.[col.key] ?? 0;
    }
    const person = findPerson(roster, name);
    return {
      name,
      fullName: person?.fullName || name,
      prev: p,
      cur: c,
      delta: p || c ? (c?.[deltaKey] ?? 0) - (p?.[deltaKey] ?? 0) : null,
      isNew: !p && !!c,
    };
  });
  total.delta = total.cur[deltaKey] - total.prev[deltaKey];
  // Template order first (people.config), then by current output.
  const order = (name: string) => {
    const i = PEOPLE_DEFAULTS.findIndex((d) => d.name.toLowerCase() === name.toLowerCase());
    return i < 0 ? 1e6 : i;
  };
  rows.sort((a, b) => order(a.name) - order(b.name) || (b.cur?.[deltaKey] ?? -1) - (a.cur?.[deltaKey] ?? -1));
  return { team, title, columns, deltaKey, deltaLabel, rows, total, unavailable };
}

/** Requests received before `at` and not uploaded by then. */
export function backlogAt(ds: Dataset, at: number): number | null {
  if (!ds.has(C.timestamp) || !ds.has(C.uploadDate)) return null;
  const excluded = new Set(BACKLOG_EXCLUDED_STATUSES.map((s) => s.toLowerCase()));
  let count = 0;
  for (const r of ds.records) {
    const t = r.dates[C.timestamp];
    if (t == null || t >= at) continue;
    const u = r.dates[C.uploadDate];
    if (u != null && u < at) continue;
    if (excluded.has(text(r.values[C.status]).toLowerCase())) continue;
    count++;
  }
  return count;
}

const pct = (a: number, b: number) => (a ? ((b - a) / a) * 100 : null);
const pctText = (a: number, b: number) => {
  const p = pct(a, b);
  return p === null ? '' : ` (${p > 0 ? '+' : ''}${p.toFixed(1)}%)`;
};

export interface ReportInput {
  ds: Dataset;
  sellerQc: SellerQcRow[] | null;
  roster: Person[];
  prev: Period;
  cur: Period;
  teams: TeamId[];
  people: Record<string, string[]>; // team -> sheet names
  /** Retail [Picks] Upload Request sheet (optional). */
  retail?: ExtraTable | null;
  includeRetail?: boolean;
  /** Admin Portal Pending QC sheet (optional). */
  pendingQc?: ExtraTable | null;
}

export function buildIndividualReport({ ds, sellerQc, roster, prev, cur, teams, people, retail, includeRetail = true, pendingQc }: ReportInput): IndividualReport {
  const sections: ReportSection[] = [];
  const has = (c: string) => ds.has(c);

  // Production = Work Sheet new uploads + Retail [Picks] uploads (separate sheet, by upload date), in one table.
  const prodFields = { sellers: () => 1, skus: (r: Dataset['records'][number]) => n(r.values[C.uploadedSku]) };
  const retailPrev = teams.includes('Production') && includeRetail ? retailByPerson(retail, prev) : null;
  const retailCur = teams.includes('Production') && includeRetail ? retailByPerson(retail, cur) : null;
  const prodNames = [...(people.Production ?? [])];
  const withRetail = (m: Map<string, Nums>, r: ReturnType<typeof retailByPerson>) => {
    if (!r) return m;
    for (const v of r.values()) {
      const k = matchName(v.name, prodNames)?.toLowerCase() ?? v.name.toLowerCase();
      const acc = m.get(k) ?? { sellers: 0, skus: 0 };
      acc.sellers += v.sellers;
      acc.skus += v.skus;
      m.set(k, acc);
    }
    return m;
  };
  // Retail uploaders who are not ticked under Production still get a row.
  for (const r of [retailPrev, retailCur]) for (const v of r?.values() ?? []) if (!matchName(v.name, prodNames)) prodNames.push(v.name);
  const production = teams.includes('Production')
    ? buildSection(
        'Production', retailPrev || retailCur ? 'PRODUCTION · New Upload + Retail Picks' : 'PRODUCTION · New Upload',
        [{ key: 'sellers', label: 'Seller' }, { key: 'skus', label: 'SKUs' }],
        'skus', 'Δ SKUs', prodNames, roster,
        withRetail(sumBy(ds, C.uploadedBy, C.uploadDate, prev, prodFields, C.uploadMonth), retailPrev), withRetail(sumBy(ds, C.uploadedBy, C.uploadDate, cur, prodFields, C.uploadMonth), retailCur),
        [C.uploadedBy, C.uploadDate, C.uploadedSku].filter((c) => !has(c)),
      )
    : null;
  if (production) sections.push(production);
  const retailTotal = (r: ReturnType<typeof retailByPerson>) => [...(r?.values() ?? [])].reduce((z, v) => ({ sellers: z.sellers + v.sellers, skus: z.skus + v.skus }), { sellers: 0, skus: 0 });
  const rtPrev = retailTotal(retailPrev);
  const rtCur = retailTotal(retailCur);

  const visFields = {
    sellers: () => 1,
    hand: (r: Dataset['records'][number]) => n(r.values[C.editedByHand]),
    ai: (r: Dataset['records'][number]) => n(r.values[C.editedByAi]),
    total: (r: Dataset['records'][number]) => n(r.values[C.imageCount]),
  };
  const visual = teams.includes('Visual')
    ? buildSection(
        'Visual', 'VISUAL · Seller & Image Output',
        [{ key: 'sellers', label: 'Slr' }, { key: 'hand', label: 'Hand' }, { key: 'ai', label: 'AI' }, { key: 'total', label: 'Total' }],
        'total', 'Δ Total', people.Visual ?? [], roster,
        sumBy(ds, C.visualEditor, C.imageDate, prev, visFields), sumBy(ds, C.visualEditor, C.imageDate, cur, visFields),
        [C.visualEditor, C.imageDate, C.imageCount, C.editedByHand, C.editedByAi].filter((c) => !has(c)),
      )
    : null;
  if (visual) sections.push(visual);

  let qc: ReportSection | null = null;
  if (teams.includes('QC')) {
    const qcFields = { upload: (r: Dataset['records'][number]) => n(r.values[C.approvedQc]) + n(r.values[C.rejectedQc]) };
    const merge = (p: Period) => {
      const m = sumBy(ds, C.qcBy, C.qcDate, p, qcFields);
      const out = new Map<string, Nums>();
      for (const [k, v] of m) out.set(k, { upload: v.upload, seller: 0, total: v.upload });
      for (const row of sellerQc ?? []) {
        if (!inRange(row.date, p) || !row.qcBy) continue;
        const k = row.qcBy.toLowerCase();
        const acc = out.get(k) ?? { upload: 0, seller: 0, total: 0 };
        acc.seller += row.skus;
        acc.total += row.skus;
        out.set(k, acc);
      }
      return out;
    };
    qc = buildSection(
      'QC', 'QC PERFORMANCE',
      [{ key: 'upload', label: 'Upload' }, { key: 'seller', label: 'Seller' }, { key: 'total', label: 'Total' }],
      'total', 'Δ Total', people.QC ?? [], roster, merge(prev), merge(cur),
      [...[C.qcBy, C.qcDate, C.approvedQc].filter((c) => !has(c)), ...(sellerQc ? [] : ['Admin portal QC import data'])],
    );
    sections.push(qc);
  }

  const now = Date.now();
  const backlog = { prev: backlogAt(ds, Math.min(prev.end, now)), cur: backlogAt(ds, Math.min(cur.end, now)) };

  const glance: GlanceItem[] = [];
  if (production) {
    glance.push({ label: 'Sellers Uploaded', prev: production.total.prev.sellers, cur: production.total.cur.sellers });
    glance.push({ label: 'SKUs Uploaded', prev: production.total.prev.skus, cur: production.total.cur.skus });
    glance.push({ label: 'Upload Backlog', prev: backlog.prev, cur: backlog.cur, lowerIsBetter: true });
  }
  if (retailPrev || retailCur) glance.push({ label: 'Retail Picks SKUs (incl. above)', prev: rtPrev.skus, cur: rtCur.skus });
  if (qc) glance.push({ label: 'Total QC Done', prev: qc.total.prev.total, cur: qc.total.cur.total });
  const pq = pendingQcNow(pendingQc);
  if (pq) {
    const parts = [pq.skus !== null ? `${fmtNum(pq.skus)} SKUs` : null, pq.sellers !== null ? `${fmtNum(pq.sellers)} sellers` : `${fmtNum(pq.rows)} rows`].filter(Boolean);
    glance.push({ label: 'Pending QC (Admin Portal, now)', prev: null, cur: pq.skus ?? pq.rows, text: parts.join(' · '), lowerIsBetter: true });
  }
  if (visual) {
    glance.push({ label: 'Total Visual Images', prev: visual.total.prev.total, cur: visual.total.cur.total });
    glance.push({ label: 'AI Edited Images', prev: visual.total.prev.ai, cur: visual.total.cur.ai });
    glance.push({ label: 'Hand Edited Images', prev: visual.total.prev.hand, cur: visual.total.cur.hand });
  }

  // Summary line (template wording).
  const parts: string[] = [];
  if (production) {
    parts.push(
      `We uploaded products for a total of ${fmtNum(production.total.prev.sellers)} sellers in ${prev.label} and ${fmtNum(production.total.cur.sellers)} sellers in ${cur.label}.`,
    );
    if (backlog.prev !== null && backlog.cur !== null) {
      parts.push(`Upload backlog stood at ${fmtNum(backlog.prev)} sellers (${prev.short}) and ${fmtNum(backlog.cur)} sellers (${cur.short}).`);
    }
  }
  const summary = parts.join(' ');

  // Key notes — factual, derived only from the numbers above.
  const notes: string[] = [];
  if (production) {
    const { prev: a, cur: b } = production.total;
    const perA = a.sellers ? a.skus / a.sellers : 0;
    const perB = b.sellers ? b.skus / b.sellers : 0;
    const dir = (x: number, y: number) => (y > x ? 'rose' : y < x ? 'fell' : 'held');
    let line = `Uploads ${dir(a.sellers, b.sellers)} (${fmtNum(a.sellers)}→${fmtNum(b.sellers)} sellers) and SKUs ${dir(a.skus, b.skus)} (${fmtNum(a.skus)}→${fmtNum(b.skus)}).`;
    if (a.sellers && b.sellers && Math.sign(b.sellers - a.sellers) !== Math.sign(b.skus - a.skus) && b.sellers !== a.sellers) {
      line += ` ${perB < perA ? 'Smaller' : 'Larger'} batches per seller (${fmtNum(Math.round(perA))} → ${fmtNum(Math.round(perB))} SKUs/seller).`;
    }
    notes.push(line);
    if (rtPrev.sellers || rtCur.sellers)
      notes.push(`Includes Retail [Picks] uploads: ${fmtNum(rtPrev.sellers)} → ${fmtNum(rtCur.sellers)} sellers, ${fmtNum(rtPrev.skus)} → ${fmtNum(rtCur.skus)} SKUs.`);
    const movers = production.rows.filter((r) => r.delta !== null && !r.isNew).sort((x, y) => (y.delta ?? 0) - (x.delta ?? 0));
    if (movers.length > 1) {
      const top = movers[0];
      const low = movers[movers.length - 1];
      if ((top.delta ?? 0) > 0) notes.push(`Biggest SKU increase: ${top.fullName} (+${fmtNum(top.delta)}).`);
      if ((low.delta ?? 0) < 0) notes.push(`Biggest SKU decrease: ${low.fullName} (${fmtNum(low.delta)}).`);
    }
    const newcomers = production.rows.filter((r) => r.isNew).map((r) => r.fullName);
    if (newcomers.length) notes.push(`New in production this period: ${newcomers.join(', ')}.`);
  }
  if (qc) {
    const { prev: a, cur: b } = qc.total;
    notes.push(`Total QC ${b.total >= a.total ? 'up' : 'down'} ${fmtNum(a.total)} → ${fmtNum(b.total)}${pctText(a.total, b.total)}.`);
  }
  if (visual) {
    const { prev: a, cur: b } = visual.total;
    const share = (x: Nums) => (x.ai + x.hand ? (x.ai / (x.ai + x.hand)) * 100 : null);
    const sa = share(a);
    const sb = share(b);
    let line = `Visual images ${fmtNum(a.total)} → ${fmtNum(b.total)}${pctText(a.total, b.total)}`;
    if (sa !== null && sb !== null) line += `; AI share of edits ${sa.toFixed(0)}% → ${sb.toFixed(0)}%`;
    notes.push(`${line}.`);
  }
  const idle = sections.flatMap((s) => s.rows.filter((r) => !r.cur).map((r) => `${r.fullName} (${s.team})`));
  if (idle.length) notes.push(`No recorded output in ${cur.label}: ${idle.join(', ')}.`);

  return { prev, cur, sections, glance, summary, notes, backlog };
}
