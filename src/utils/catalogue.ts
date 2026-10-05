/**
 * "Catalogue Overall Performance" report — Daily / Monthly.
 *
 * Re-implements the formulas of the "Daily Performance" and "Monthly
 * Performance" tabs of the Catalogue Overall Performance spreadsheet:
 *
 *  Production (per "Uploaded by"):
 *    Manual  = Work Sheet rows, File Type "Manual File", Status "Done", uploaded in period
 *              (+ Retail Picks rows, File Type "Manual File", Upload Status "Done", by its Upload Date)
 *    "Uploaded in period": daily = Upload date; monthly = the "Upload Month" column (AN),
 *              falling back to Upload date when Upload Month is blank.
 *    Bulk    = Work Sheet rows, File Type "Daraz File", Status "Done", Upload date in period
 *    SKUs    = Σ Uploaded SKU Count, Status "Done", Upload date in period
 *    Achieved% = (Manual + Bulk) ÷ target
 *  QC (per "QC By" / "Done By"):
 *    Sellers = Work Sheet QC Status "QC Done" (QC approved date) + Admin Portal QC Status "Done"
 *              (QC Date) + ContentCommercial "Seller Upload QC" with QC Status "QC Done" (QC Date)
 *    SKUs    = Σ (Approved + Rejected QC Count) over the same rows
 *    Daily only: within 48 h / 48–72 h / older than 72 h (QC date vs upload date or request time)
 *    Achieved% = SKUs ÷ target
 *  Visual (per "Visual editor"):
 *    Sellers = rows with Image Delivered Date in period; Images = Σ Image count;
 *    Edited = Σ Edited (By Hand); Achieved% = Sellers ÷ target
 *  Summary: Production uploaded / pending (ContentCommercial "New Upload"), QC done / pending,
 *    images delivered / edited.
 */
import { C } from '../config/dashboard.config';
import type { CellValue, Dataset, FlatTable, PerformanceData, ReportTab } from '../types';
import { isBlank, monthKeyOf, parseDate, text, toMonthKey, toNumber } from './parse';
import { matchName } from './individualReport';

export type CatalogueMode = 'day' | 'month';
export interface CatPeriod {
  mode: CatalogueMode;
  start: number;
  end: number;
}

type SectionId = 'production' | 'qc' | 'visual';

export interface StaffRow {
  name: string;
  type: string;
  joining: string;
  /** Target for the chosen mode; null = no target (shown as —). */
  target: number | null;
}

/** Default QC target when the sheet only hard-codes it inside formulas (/2500, /55000). */
export const QC_DEFAULT_TARGET = { day: 2500, month: 55000 };

/* ------------------------------------------------------------------ */
/* Staff lists & targets from the performance sheet                    */
/* ------------------------------------------------------------------ */

const lc = (v: CellValue) => text(v).toLowerCase();

function sectionOf(title: string): SectionId | null {
  const t = title.toLowerCase();
  if (/upl?oa?d|production/.test(t)) return 'production';
  if (/\bqc\b|quality/.test(t)) return 'qc';
  if (/visual|image/.test(t)) return 'visual';
  return null;
}

/** Reads "SN | Emplyee Name | Employee Type | Joining Date | <target> …" blocks of a report tab. */
function readStaffBlocks(tab: ReportTab | null | undefined): Record<SectionId, { rows: StaffRow[]; headers: string[] }> {
  const out: Record<SectionId, { rows: StaffRow[]; headers: string[] }> = {
    production: { rows: [], headers: [] },
    qc: { rows: [], headers: [] },
    visual: { rows: [], headers: [] },
  };
  if (!tab) return out;
  const v = tab.values;
  let section: SectionId | null = null;
  for (let r = 0; r < v.length; r++) {
    const row = v[r] ?? [];
    const cells = row.filter((c) => !isBlank(c));
    const nameCol = row.findIndex((c) => /^(emplyee|employee)\s*name$/i.test(text(c)));
    if (nameCol < 0) {
      // Section titles: a short text row like "Production Summary", "QC", "Uplaod".
      if (cells.length >= 1 && cells.length <= 3) {
        const s = cells.map((c) => sectionOf(text(c))).find(Boolean);
        if (s) section = s;
      }
      continue;
    }
    if (!section) continue;
    const headers = row.map((c) => text(c));
    const typeCol = headers.findIndex((h) => /employee type/i.test(h));
    const joinCol = headers.findIndex((h) => /joining/i.test(h));
    const targetCol = headers.findIndex((h) => /target/i.test(h));
    out[section].headers = headers;
    for (let k = r + 1; k < v.length; k++) {
      const rr = v[k] ?? [];
      const name = text(rr[nameCol]);
      if (!name) {
        if (rr.every((c) => isBlank(c)) || rr.some((c) => /^(emplyee|employee)\s*name$/i.test(text(c)))) break;
        continue;
      }
      if (sectionOf(name) && rr.filter((c) => !isBlank(c)).length === 1) break;
      const jMs = joinCol >= 0 ? parseDate(rr[joinCol]) : null;
      out[section].rows.push({
        name,
        type: typeCol >= 0 ? text(rr[typeCol]) : '',
        joining: jMs ? new Date(jMs).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
        target: targetCol >= 0 ? toNumber(rr[targetCol]) : null,
      });
      r = k;
    }
  }
  return out;
}

/**
 * Staff per section with the target for the chosen mode.
 * The sheet gives people without a real target a self-reference (e.g. =H23),
 * which would read as 100 %; so only the section's standard target (the most
 * common value, e.g. 110 / 55,000 / 220 monthly) counts, and KPI-tab blanks
 * mean "no target". QC has no daily target column: the sheet divides by 2,500.
 */
export function staffFor(perf: PerformanceData | null | undefined, mode: CatalogueMode): Record<SectionId, StaffRow[]> | null {
  if (!perf || (!perf.daily && !perf.monthly)) return null;
  const blocks = readStaffBlocks(mode === 'day' ? perf.daily ?? perf.monthly : perf.monthly ?? perf.daily);
  const kpi = readStaffBlocks(perf.kpi);
  const out = {} as Record<SectionId, StaffRow[]>;
  (['production', 'qc', 'visual'] as SectionId[]).forEach((s) => {
    const counts = new Map<number, number>();
    for (const r of blocks[s].rows) if (r.target) counts.set(r.target, (counts.get(r.target) ?? 0) + 1);
    let standard = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (s === 'qc' && standard === null) standard = QC_DEFAULT_TARGET[mode];
    const kpiNames = new Map(kpi[s].rows.map((k) => [k.name.toLowerCase(), k.target]));
    out[s] = blocks[s].rows.map((r) => {
      const k = kpiNames.get(r.name.toLowerCase());
      const kpiSaysNone = kpiNames.has(r.name.toLowerCase()) && !k;
      const own = s === 'qc' && mode === 'day' ? standard : r.target;
      return { ...r, target: !kpiSaysNone && own !== null && own === standard ? standard : null };
    });
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Source rows                                                         */
/* ------------------------------------------------------------------ */

interface Flat {
  get: (row: CellValue[], col: string) => CellValue;
  has: (col: string) => boolean;
  rows: CellValue[][];
}
function flat(t: FlatTable | null | undefined, aliases: Record<string, string[]> = {}): Flat | null {
  if (!t) return null;
  const idx = new Map(t.columns.map((c, i) => [c.trim().toLowerCase(), i]));
  const find = (col: string) => [col, ...(aliases[col] ?? [])].map((c) => idx.get(c.toLowerCase())).find((i) => i !== undefined);
  return { rows: t.rows, has: (c) => find(c) !== undefined, get: (row, c) => { const i = find(c); return i === undefined ? null : row[i] ?? null; } };
}

const inP = (ms: number | null | undefined, p: CatPeriod) => ms != null && ms >= p.start && ms < p.end;
const eq = (v: CellValue, s: string) => lc(v) === s.toLowerCase();
const num = (v: CellValue) => toNumber(v) ?? 0;
const dayStart = (ms: number) => {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

/* ------------------------------------------------------------------ */
/* Report model                                                        */
/* ------------------------------------------------------------------ */

export interface ProductionRow extends StaffRow {
  manual: number;
  bulk: number;
  total: number;
  skus: number;
  retail: number;
  pct: number | null;
}
export interface QcRow extends StaffRow {
  sellers: number;
  skus: number;
  within48: number;
  within72: number;
  older: number;
  pct: number | null;
}
export interface VisualRow extends StaffRow {
  sellers: number;
  images: number;
  edited: number;
  pct: number | null;
}

export interface CatalogueReport {
  period: CatPeriod;
  summary: {
    uploadedSellers: number | null;
    uploadedSkus: number | null;
    pendingSellers: number | null;
    pendingSkus: number | null;
    qcDoneSellers: number;
    qcDoneSkus: number;
    qcPendingSellers: number;
    qcPendingSkus: number;
    images: number;
    edited: number;
  };
  production: ProductionRow[];
  qc: QcRow[];
  visual: VisualRow[];
  notes: string[];
}

/** Like the sheet's IFERROR(IF(x/target=0,"",…)): no work or no target → blank. */
const pct = (v: number, t: number | null) => (t && v ? (v / t) * 100 : null);

export function buildCatalogueReport(args: {
  ds: Dataset;
  adminQc: FlatTable | null | undefined;
  perf: PerformanceData | null | undefined;
  period: CatPeriod;
  fallbackStaff: Record<SectionId, string[]>;
}): CatalogueReport {
  const { ds, period } = args;
  const day = period.mode === 'day';
  const notes: string[] = [];
  const admin = flat(args.adminQc);
  const com = flat(args.perf?.commercial);
  const retail = flat(args.perf?.retail, { 'File Type': ['Upload Type', 'File type'] });
  if (!com) notes.push('ContentCommercial Work tab not available — “Uploaded / Pending” summary uses the Work Sheet and seller-upload QC is not included.');
  if (!retail) notes.push('Retail Picks Upload tab not available — retail uploads are not included.');
  /**
   * Was this Work Sheet job uploaded in the period? Monthly: the sheet's "Upload Month" column
   * (AN) decides; rows with a blank Upload Month fall back to the Upload date. Daily: Upload date.
   */
  const useUploadMonth = !day && ds.has(C.uploadMonth);
  const periodMonth = monthKeyOf(period.start);
  const uploadedIn = (r: Dataset['records'][number]) => {
    if (useUploadMonth) {
      const k = toMonthKey(r.values[C.uploadMonth]);
      if (k) return k === periodMonth;
    }
    return inP(r.dates[C.uploadDate], period);
  };

  const staff = staffFor(args.perf, period.mode);
  if (!staff) notes.push('Performance sheet not connected — staff lists come from the Team Members page and targets show —.');
  const list = (s: SectionId): StaffRow[] =>
    staff?.[s]?.length ? staff[s] : args.fallbackStaff[s].map((name) => ({ name, type: '', joining: '', target: s === 'qc' ? QC_DEFAULT_TARGET[period.mode] : null }));
  const same = (a: CellValue, name: string) => lc(a) === name.toLowerCase();
  const recs = ds.records;

  // ---------------- Production ----------------
  // Retail Picks spells some names differently ("Iftkhar"): match them to the staff list like the Individual Summary does.
  const prodNames = list('production').map((x) => x.name);
  const retailWho = (row: CellValue[]) => (retail ? matchName(text(retail.get(row, 'Uploaded By')), prodNames) : null);
  const production: ProductionRow[] = list('production').map((s) => {
    let manual = 0;
    let bulk = 0;
    let skus = 0;
    for (const r of recs) {
      if (!same(r.values[C.uploadedBy], s.name) || !eq(r.values[C.status], 'Done') || !uploadedIn(r)) continue;
      if (eq(r.values[C.fileType], 'Manual File')) manual++;
      if (eq(r.values[C.fileType], 'Daraz File')) bulk++;
      skus += num(r.values[C.uploadedSku]);
    }
    let retailN = 0;
    // Retail Picks: dated by its own "Upload Date" (column N), daily and monthly.
    if (retail) {
      for (const row of retail.rows) {
        if (retailWho(row) !== s.name || !eq(retail.get(row, 'Upload Status'), 'Done')) continue;
        if (!inP(parseDate(retail.get(row, 'Upload Date')), period)) continue;
        retailN++;
        // The sheet adds retail "Manual File" uploads to Manual (Sellers).
        if (eq(retail.get(row, 'File Type'), 'Manual File')) manual++;
      }
    }
    const total = manual + bulk;
    return { ...s, manual, bulk, total, skus, retail: retailN, pct: pct(total, s.target) };
  });

  // ---------------- QC ----------------
  const qcRows: QcRow[] = list('qc').map((s) => {
    let sellers = 0;
    let skus = 0;
    let w48 = 0;
    let w72 = 0;
    let older = 0;
    const age = (qcMs: number, startMs: number | null) => {
      if (!day || startMs === null) return;
      const d0 = dayStart(qcMs);
      const st = dayStart(startMs);
      if (st >= d0 - 2 * 86400000) w48++;
      else if (st >= d0 - 3 * 86400000) w72++;
      else older++;
    };
    for (const r of recs) {
      if (!same(r.values[C.qcBy], s.name) || !eq(r.values[C.qcStatus], 'QC Done') || !inP(r.dates[C.qcDate], period)) continue;
      sellers++;
      skus += num(r.values[C.approvedQc]) + num(r.values[C.rejectedQc]);
      age(r.dates[C.qcDate] as number, r.dates[C.uploadDate] ?? null);
    }
    if (admin) {
      for (const row of admin.rows) {
        if (!same(admin.get(row, 'QC By'), s.name) || !eq(admin.get(row, 'QC Status'), 'Done') || !inP(parseDate(admin.get(row, 'QC Date')), period)) continue;
        sellers++;
        skus += num(admin.get(row, 'Approved QC Count')) + num(admin.get(row, 'Rejected QC Count'));
      }
    }
    if (com) {
      for (const row of com.rows) {
        if (!same(com.get(row, 'Done By'), s.name) || !eq(com.get(row, 'Task Type'), 'Seller Upload QC') || !eq(com.get(row, 'QC Status'), 'QC Done')) continue;
        const q = parseDate(com.get(row, 'QC Date'));
        if (!inP(q, period)) continue;
        sellers++;
        skus += num(com.get(row, 'Approved QC Count')) + num(com.get(row, 'Rejected QC Count'));
        age(q as number, parseDate(com.get(row, 'Timestamp')));
      }
    }
    return { ...s, sellers, skus, within48: w48, within72: w72, older, pct: pct(skus, s.target) };
  });

  // ---------------- Visual ----------------
  const visual: VisualRow[] = list('visual').map((s) => {
    let sellers = 0;
    let images = 0;
    let edited = 0;
    for (const r of recs) {
      if (!same(r.values[C.visualEditor], s.name) || !inP(r.dates[C.imageDate], period)) continue;
      sellers++;
      images += num(r.values[C.imageCount]);
      edited += num(r.values[C.editedByHand]);
    }
    return { ...s, sellers, images, edited, pct: pct(sellers, s.target) };
  });

  // ---------------- Summary ----------------
  let uploadedSellers: number | null = 0;
  let uploadedSkus: number | null = 0;
  let pendingSellers: number | null = 0;
  let pendingSkus: number | null = 0;
  if (com) {
    for (const row of com.rows) {
      if (!eq(com.get(row, 'Task Type'), 'New Upload')) continue;
      const st = com.get(row, 'Upload Status');
      if (eq(st, 'Done') && inP(parseDate(com.get(row, 'Upload Date')), period)) {
        uploadedSellers++;
        uploadedSkus += num(com.get(row, 'Uploaded SKU Count'));
      }
      if (eq(st, 'Pending')) {
        pendingSellers++;
        pendingSkus += num(com.get(row, 'Number of SKU'));
      }
    }
  } else {
    for (const r of recs) {
      if (eq(r.values[C.status], 'Done') && uploadedIn(r)) {
        uploadedSellers++;
        uploadedSkus += num(r.values[C.uploadedSku]);
      }
      if (eq(r.values[C.status], 'Pending')) {
        pendingSellers++;
        pendingSkus += num(r.values[C.skuCount]);
      }
    }
  }
  let qcDoneSellers = 0;
  let qcDoneSkus = 0;
  let qcPendingSellers = 0;
  let qcPendingSkus = 0;
  for (const r of recs) {
    if (eq(r.values[C.qcStatus], 'QC Done') && inP(r.dates[C.qcDate], period)) {
      qcDoneSellers++;
      qcDoneSkus += num(r.values[C.approvedQc]) + num(r.values[C.rejectedQc]);
    }
    if (!eq(r.values[C.qcStatus], 'QC Done') && eq(r.values[C.status], 'Done')) {
      qcPendingSellers++;
      qcPendingSkus += num(r.values[C.uploadedSku]);
    }
  }
  if (admin) {
    for (const row of admin.rows) {
      const inside = inP(parseDate(admin.get(row, 'QC Date')), period);
      if (eq(admin.get(row, 'QC Status'), 'Done') && inside) {
        qcDoneSellers++;
        qcDoneSkus += num(admin.get(row, 'Approved QC Count')) + num(admin.get(row, 'Rejected QC Count'));
      }
      if (eq(admin.get(row, 'QC Status'), 'Pending') && inside) qcPendingSellers++;
    }
  }
  if (com) {
    for (const row of com.rows) {
      if (!eq(com.get(row, 'Task Type'), 'Seller Upload QC')) continue;
      if (eq(com.get(row, 'QC Status'), 'QC Done') && inP(parseDate(com.get(row, 'QC Date')), period)) {
        qcDoneSellers++;
        qcDoneSkus += num(com.get(row, 'Approved QC Count')) + num(com.get(row, 'Rejected QC Count'));
      }
      if (isBlank(com.get(row, 'QC Status')) && isBlank(com.get(row, 'Done By')) && !eq(com.get(row, 'Upload Status'), 'Rejected')) {
        qcPendingSellers++;
        qcPendingSkus += num(com.get(row, 'Number of SKU'));
      }
    }
  }
  let images = 0;
  let edited = 0;
  for (const r of recs) {
    if (!inP(r.dates[C.imageDate], period)) continue;
    images += num(r.values[C.imageCount]);
    edited += num(r.values[C.editedByHand]);
  }

  return {
    period,
    summary: { uploadedSellers, uploadedSkus, pendingSellers, pendingSkus, qcDoneSellers, qcDoneSkus, qcPendingSellers, qcPendingSkus, images, edited },
    production,
    qc: qcRows,
    visual,
    notes,
  };
}
