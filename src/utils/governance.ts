import { GOV_COLUMNS, LAYOUT_HELP, PROJECT_REPORTS, REPORT_LAYOUTS, type GovField, type ProjectReports, type ReportLayout } from '../config/governance.config';
import type { CellValue, FlatTable } from '../types';
import { isBlank, parseDate, text, toNumber } from './parse';

/* ------------------------------------------------------------------ */
/* Ad-Hoc tasks ("Main" tab)                                           */
/* ------------------------------------------------------------------ */

export interface AdhocTask {
  idx: number;
  date: number | null;
  taskType: string;
  project: string;
  shop: string;
  products: number;
  shops: number;
  images: number;
  source: string;
  person: string;
  status: string;
  note: string;
  /** Raw row keyed by sheet header (for the table / export). */
  values: Record<string, CellValue>;
}

export interface AdhocTable {
  columns: string[];
  /** Resolved sheet header per field (null = column missing → N/A). */
  map: Record<GovField, string | null>;
  tasks: AdhocTask[];
}

function resolveColumns(columns: string[]): Record<GovField, string | null> {
  const lower = columns.map((c) => c.trim().toLowerCase());
  const out = {} as Record<GovField, string | null>;
  (Object.keys(GOV_COLUMNS) as GovField[]).forEach((f) => {
    const hit = GOV_COLUMNS[f].map((c) => lower.indexOf(c.toLowerCase())).find((i) => i >= 0);
    out[f] = hit === undefined ? null : columns[hit];
  });
  return out;
}

export function parseAdhoc(table: FlatTable | null | undefined): AdhocTable | null {
  if (!table) return null;
  const map = resolveColumns(table.columns);
  const idx = Object.fromEntries(table.columns.map((c, i) => [c, i]));
  const get = (row: CellValue[], f: GovField) => (map[f] ? row[idx[map[f] as string]] ?? null : null);
  const tasks: AdhocTask[] = [];
  table.rows.forEach((row, i) => {
    if (isBlank(get(row, 'date')) && isBlank(get(row, 'taskType')) && isBlank(get(row, 'person'))) return;
    const values: Record<string, CellValue> = {};
    table.columns.forEach((c, j) => (values[c] = row[j] ?? null));
    tasks.push({
      idx: i,
      date: parseDate(get(row, 'date')),
      taskType: text(get(row, 'taskType')) || '(no type)',
      project: text(get(row, 'project')),
      shop: text(get(row, 'shop')),
      products: toNumber(get(row, 'products')) ?? 0,
      shops: toNumber(get(row, 'shops')) ?? 0,
      images: toNumber(get(row, 'images')) ?? 0,
      source: text(get(row, 'source')),
      person: text(get(row, 'person')),
      status: text(get(row, 'status')),
      note: text(get(row, 'note')),
      values,
    });
  });
  return { columns: table.columns, map, tasks };
}

export interface AdhocGroup {
  key: string;
  tasks: number;
  products: number;
  shops: number;
  images: number;
}

export function groupAdhoc(tasks: AdhocTask[], key: (t: AdhocTask) => string): AdhocGroup[] {
  const m = new Map<string, AdhocGroup>();
  for (const t of tasks) {
    const k = key(t) || '(blank)';
    let g = m.get(k);
    if (!g) m.set(k, (g = { key: k, tasks: 0, products: 0, shops: 0, images: 0 }));
    g.tasks++;
    g.products += t.products;
    g.shops += t.shops;
    g.images += t.images;
  }
  return [...m.values()].sort((a, b) => b.products - a.products || b.tasks - a.tasks);
}

/* ------------------------------------------------------------------ */
/* REVAMP projects                                                     */
/* ------------------------------------------------------------------ */

export interface Project {
  id: string;
  createdAt: number | null;
  name: string;
  workType: string;
  description: string;
  /** One or more POCs (comma separated in the sheet). */
  pocs: string[];
  poc: string;
  assignees: string[];
  totalSkus: number | null;
  startDate: string;
  dueDate: string;
  status: string;
  priority: string;
  foundLabel: string;
  updatedAt: number | null;
  updatedBy: string;
  /** Report block settings (Product Governance template). */
  layout: ReportLayout;
  lineHeader: string;
  /** Rows of the report block, e.g. "Highlight & Description", "Category Shifting". Empty = one row for the whole project. */
  lines: string[];
  valueMode: 'Sum' | 'Latest';
  reportNote: string;
  showInReport: boolean;
  /** Which report(s) the block appears in. */
  reports: ProjectReports;
  /** Optional "At a Glance" line. */
  glance: GlanceSpec | null;
  /** Custom table (layout "Custom table"). */
  columns: TableColumn[];
  rowsFrom: 'Lines' | 'Team';
  compare: 'Weeks' | 'This period';
  showDelta: boolean;
  totalLabel: string;
  target: number | null;
  /** True while a change made in this browser is not yet confirmed by the sheet. */
  pending?: boolean;
}

/** A column of a custom project table: a number people enter, or the total of the number columns. */
export interface TableColumn {
  label: string;
  kind: 'number' | 'total';
}

/** "At a Glance" line: label, main column (compare weeks) and extra columns shown small. */
export interface GlanceSpec {
  label: string;
  col: string;
  extra: string[];
}

export interface ProgressLog {
  id: string;
  timestamp: number | null;
  projectId: string;
  date: string;
  person: string;
  /** Report row this entry belongs to ("" = whole project). */
  line: string;
  reviewed: number;
  found: number;
  updated: number;
  note: string;
  /** Custom table values by column label. */
  values: Record<string, number>;
  pending?: boolean;
}

type Row = Record<string, CellValue>;

/** Tables may come from the synced sheet (FlatTable) or the Apps Script (row objects). */
export function tableToObjects(t: FlatTable | null | undefined): Row[] {
  if (!t) return [];
  return t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i] ?? null])));
}

const isoDay = (v: CellValue): string => {
  const ms = parseDate(v);
  if (ms === null) return text(v);
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Header lookup that ignores case and extra spaces (tabs may be created by hand). */
function picker(r: Row) {
  const norm = (k: string) => k.toLowerCase().replace(/\s+/g, ' ').trim();
  const m = new Map<string, CellValue>();
  for (const [k, v] of Object.entries(r)) if (!m.has(norm(k))) m.set(norm(k), v);
  return (name: string): CellValue => m.get(norm(name)) ?? null;
}

const splitList = (v: CellValue, sep: RegExp) =>
  text(v)
    .split(sep)
    .map((s) => s.trim())
    .filter(Boolean);

function parseJson(v: CellValue): unknown {
  try {
    return text(v) ? JSON.parse(text(v)) : null;
  } catch {
    return null;
  }
}
function parseColumns(v: CellValue): TableColumn[] {
  const j = parseJson(v);
  if (!Array.isArray(j)) return [];
  return j
    .map((c) => (typeof c === 'string' ? { label: c, kind: 'number' as const } : { label: String(c?.label ?? '').trim(), kind: c?.kind === 'total' ? ('total' as const) : ('number' as const) }))
    .filter((c) => c.label)
    .slice(0, 12);
}
function parseGlance(v: CellValue): GlanceSpec | null {
  const j = parseJson(v) as Partial<GlanceSpec> | null;
  if (!j || typeof j !== 'object' || !j.label) return null;
  return { label: String(j.label), col: String(j.col ?? ''), extra: Array.isArray(j.extra) ? j.extra.map(String) : [] };
}
function parseValues(v: CellValue): Record<string, number> {
  const j = parseJson(v);
  if (!j || typeof j !== 'object' || Array.isArray(j)) return {};
  const out: Record<string, number> = {};
  for (const [k, x] of Object.entries(j as Record<string, unknown>)) {
    const n = typeof x === 'number' ? x : Number(String(x).replace(/,/g, ''));
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export function toProjects(rows: Row[]): Project[] {
  return rows
    .map(picker)
    .filter((g) => text(g('Project ID')))
    .map((g) => {
      const pocs = splitList(g('POC'), /[,;/]/);
      const layoutText = text(g('Report Layout'));
      const layout = (REPORT_LAYOUTS.find((l) => l.toLowerCase() === layoutText.toLowerCase()) ?? REPORT_LAYOUTS[0]) as ReportLayout;
      return {
        id: text(g('Project ID')),
        createdAt: parseDate(g('Created At')),
        name: text(g('Project Name')) || text(g('Project ID')),
        workType: text(g('Work Type')),
        description: text(g('Description')),
        pocs,
        poc: pocs.join(' / '),
        assignees: splitList(g('Assignees'), /[,;]/),
        totalSkus: toNumber(g('Total SKUs')),
        startDate: isoDay(g('Start Date')),
        dueDate: isoDay(g('Due Date')),
        status: text(g('Status')) || 'Planned',
        priority: text(g('Priority')) || 'Medium',
        foundLabel: text(g('Found Label')) || 'Issues found',
        updatedAt: parseDate(g('Updated At')),
        updatedBy: text(g('Updated By')),
        layout,
        lineHeader: text(g('Line Header')) || LAYOUT_HELP[layout].lineHeader,
        lines: splitList(g('Lines'), /[;\n]/),
        valueMode: /^latest$/i.test(text(g('Value Mode'))) ? 'Latest' : 'Sum',
        reportNote: text(g('Report Note')),
        showInReport: !/^(no|false|0)$/i.test(text(g('Show In Report'))),
        reports: (PROJECT_REPORTS.find((r) => r.toLowerCase() === text(g('Reports')).toLowerCase()) ?? 'Governance') as ProjectReports,
        glance: parseGlance(g('Glance')),
        columns: parseColumns(g('Columns')),
        rowsFrom: /^team$/i.test(text(g('Rows'))) ? 'Team' : 'Lines',
        compare: /^this period$/i.test(text(g('Compare'))) ? 'This period' : 'Weeks',
        showDelta: !/^(no|false|0)$/i.test(text(g('Show Delta'))),
        totalLabel: g('Total Label') === null ? (layout === 'Status breakdown' ? 'Grand Total' : '') : text(g('Total Label')),
        target: toNumber(g('Target')),
      } satisfies Project;
    });
}

export function toProgress(rows: Row[]): ProgressLog[] {
  return rows
    .map(picker)
    .filter((g) => text(g('Log ID')) && text(g('Project ID')))
    .map((g) => ({
      id: text(g('Log ID')),
      timestamp: parseDate(g('Timestamp')),
      projectId: text(g('Project ID')),
      date: isoDay(g('Date')),
      person: text(g('Person')),
      line: text(g('Line')),
      reviewed: toNumber(g('Reviewed')) ?? 0,
      found: toNumber(g('Found')) ?? 0,
      updated: toNumber(g('Updated')) ?? 0,
      note: text(g('Note')),
      values: parseValues(g('Values')),
    }));
}

export interface LineStat {
  line: string;
  reviewed: number;
  found: number;
  updated: number;
  /** Number of entries in the period. */
  entries: number;
}

export interface ProjectStats {
  reviewed: number;
  found: number;
  updated: number;
  /** Found − Updated (never negative). Only meaningful for the Reviewed / Found / Updated layout. */
  pending: number;
  /** Reviewed ÷ Total SKUs × 100, null when total unknown. */
  progressPct: number | null;
  /** Updated ÷ Found × 100 (or ÷ Working for the Working / Updated layout). */
  fixPct: number | null;
  lastLog: string | null;
  logs: ProgressLog[];
  /** One entry per report row, in the project's line order (extra lines found in the log are appended). */
  lines: LineStat[];
  byPerson: { person: string; reviewed: number; found: number; updated: number; logs: number }[];
  overdue: boolean;
}

const dayMs = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).getTime() : null);
const byDate = (a: ProgressLog, b: ProgressLog) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.timestamp ?? 0) - (b.timestamp ?? 0));

/** Per-line numbers: totals of the entries (Sum) or the most recent entry (Latest). */
export function lineStats(p: Project, logs: ProgressLog[]): LineStat[] {
  const known = p.lines.length ? p.lines : [''];
  const canon = new Map(known.map((l) => [l.toLowerCase(), l]));
  const out = new Map<string, LineStat>(known.map((l) => [l, { line: l, reviewed: 0, found: 0, updated: 0, entries: 0 }]));
  for (const l of [...logs].sort(byDate)) {
    const key = canon.get(l.line.toLowerCase()) ?? l.line;
    let s = out.get(key);
    if (!s) out.set(key, (s = { line: key, reviewed: 0, found: 0, updated: 0, entries: 0 }));
    if (p.valueMode === 'Latest') {
      s.reviewed = l.reviewed;
      s.found = l.found;
      s.updated = l.updated;
    } else {
      s.reviewed += l.reviewed;
      s.found += l.found;
      s.updated += l.updated;
    }
    s.entries++;
  }
  return [...out.values()];
}

export function projectStats(p: Project, logs: ProgressLog[], range?: [number, number]): ProjectStats {
  const mine = logs
    .filter((l) => l.projectId === p.id)
    .filter((l) => {
      if (!range) return true;
      const ms = dayMs(l.date) ?? l.timestamp;
      return ms !== null && ms >= range[0] && ms < range[1];
    })
    .sort(byDate);
  const lines = lineStats(p, mine);
  const sum = (k: 'reviewed' | 'found' | 'updated') => lines.reduce((s, l) => s + l[k], 0);
  const reviewed = sum('reviewed');
  const found = sum('found');
  const updated = sum('updated');
  const people = new Map<string, { person: string; reviewed: number; found: number; updated: number; logs: number }>();
  for (const l of mine) {
    const k = l.person || '(unassigned)';
    const g = people.get(k) ?? { person: k, reviewed: 0, found: 0, updated: 0, logs: 0 };
    g.reviewed += l.reviewed;
    g.found += l.found;
    g.updated += l.updated;
    g.logs++;
    people.set(k, g);
  }
  const due = dayMs(p.dueDate);
  const closed = /complete|cancel/i.test(p.status);
  const base = p.layout === 'Working / Updated' ? reviewed : found;
  return {
    reviewed,
    found,
    updated,
    pending: p.layout === 'Reviewed / Found / Updated' ? Math.max(0, found - updated) : p.layout === 'Working / Updated' ? Math.max(0, reviewed - updated) : 0,
    progressPct: p.totalSkus ? Math.min(100, (reviewed / p.totalSkus) * 100) : null,
    fixPct: base ? (updated / base) * 100 : null,
    lastLog: mine.length ? mine[mine.length - 1].date : null,
    logs: mine,
    lines,
    byPerson: [...people.values()].sort((a, b) => b.reviewed - a.reviewed),
    overdue: !closed && due !== null && due + 86400000 < Date.now(),
  };
}

/** Column labels for a project's numbers, by layout. */
export function metricLabels(p: Project): { key: 'reviewed' | 'found' | 'updated'; label: string }[] {
  switch (p.layout) {
    case 'Working / Updated':
      return [
        { key: 'reviewed', label: p.foundLabel && p.foundLabel !== 'Issues found' ? p.foundLabel : 'Working' },
        { key: 'updated', label: 'Updated' },
      ];
    case 'Count':
      return [{ key: 'reviewed', label: p.foundLabel && p.foundLabel !== 'Issues found' ? p.foundLabel : 'Count' }];
    case 'Status breakdown':
      return [{ key: 'reviewed', label: p.foundLabel && p.foundLabel !== 'Issues found' ? p.foundLabel : 'Count of SKUs' }];
    default:
      return [
        { key: 'reviewed', label: 'Reviewed' },
        { key: 'found', label: p.foundLabel },
        { key: 'updated', label: 'Updated' },
      ];
  }
}

/** New IDs are created in the browser so pending changes can be matched after the sync. */
export const newId = (prefix: 'PRJ' | 'LOG') =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

/* ------------------------------------------------------------------ */
/* Custom tables                                                       */
/* ------------------------------------------------------------------ */

/** Rows of a project's table: its list of lines, or the assigned team. */
export function projectRows(p: Project): string[] {
  if (p.rowsFrom === 'Team') {
    const team = [...new Set([...p.assignees, ...p.pocs])];
    return team.length ? team : [''];
  }
  return p.lines.length ? p.lines : [''];
}

export const numberColumns = (p: Project) => p.columns.filter((c) => c.kind === 'number');

export interface CustomStats {
  /** One entry per table row (rows found only in the log are appended). */
  rows: { line: string; values: Record<string, number>; entries: number }[];
  totals: Record<string, number>;
  entries: number;
}

/** Custom-table numbers for a period: per row and column, Sum of entries or the Latest entry; "total" columns add the number columns. */
export function customStats(p: Project, logs: ProgressLog[], range?: [number, number]): CustomStats {
  const nums = numberColumns(p);
  const mine = logs
    .filter((l) => l.projectId === p.id)
    .filter((l) => {
      if (!range) return true;
      const ms = l.date ? new Date(`${l.date}T00:00:00`).getTime() : l.timestamp;
      return ms !== null && ms >= range[0] && ms < range[1];
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.timestamp ?? 0) - (b.timestamp ?? 0)));
  const known = projectRows(p);
  const canon = new Map(known.map((l) => [l.toLowerCase(), l]));
  const rows = new Map(known.map((l) => [l, { line: l, values: {} as Record<string, number>, entries: 0 }]));
  for (const l of mine) {
    const key = canon.get(l.line.toLowerCase()) ?? l.line;
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { line: key, values: {}, entries: 0 }));
    for (const c of nums) {
      const v = l.values[c.label];
      if (v === undefined) continue;
      r.values[c.label] = p.valueMode === 'Latest' ? v : (r.values[c.label] ?? 0) + v;
    }
    r.entries++;
  }
  const list = [...rows.values()];
  for (const r of list) {
    const sum = nums.reduce((z, c) => z + (r.values[c.label] ?? 0), 0);
    for (const c of p.columns) if (c.kind === 'total') r.values[c.label] = sum;
  }
  const totals: Record<string, number> = {};
  for (const c of p.columns) totals[c.label] = list.reduce((z, r) => z + (r.values[c.label] ?? 0), 0);
  return { rows: list, totals, entries: mine.length };
}

/** Ready-made tables (from the report templates) to start a project from. */
export interface ProjectTemplate {
  id: string;
  title: string;
  hint: string;
  apply: Partial<{
    layout: ReportLayout;
    lineHeader: string;
    lines: string;
    columns: TableColumn[];
    rowsFrom: 'Lines' | 'Team';
    compare: 'Weeks' | 'This period';
    showDelta: boolean;
    totalLabel: string;
    target: string;
    valueMode: 'Sum' | 'Latest';
    reports: ProjectReports;
    glance: GlanceSpec | null;
    foundLabel: string;
  }>;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'check',
    title: 'Check per person + target',
    hint: 'e.g. Search Keyword Error Checking — Issue Found / Already Ok / Pending / Count, target 1,000',
    apply: {
      layout: 'Custom table', lineHeader: 'Assign', rowsFrom: 'Team', compare: 'This period', showDelta: false, totalLabel: 'Unique Total', target: '1000',
      columns: [{ label: 'Issue Found', kind: 'number' }, { label: 'Already Ok', kind: 'number' }, { label: 'Pending', kind: 'number' }, { label: 'Count', kind: 'total' }],
      reports: 'Individual Summary', glance: { label: 'Keyword Check', col: 'Count', extra: ['Issue Found', 'Already Ok'] },
    },
  },
  {
    id: 'campaign',
    title: 'Per person, compare weeks',
    hint: 'e.g. Campaign — Sticker Image: W38 vs W39 per person with Δ',
    apply: {
      layout: 'Custom table', lineHeader: 'Name', rowsFrom: 'Team', compare: 'Weeks', showDelta: true, totalLabel: '',
      columns: [{ label: 'Sticker', kind: 'number' }], reports: 'Individual Summary', glance: { label: 'Campaign Sticker', col: 'Sticker', extra: [] },
    },
  },
  {
    id: 'metrics',
    title: 'Metrics, compare weeks',
    hint: 'e.g. Electronics Category Revamp — Total SKUs, Reviewed, Wrong Found, Updated, Pending',
    apply: {
      layout: 'Custom table', lineHeader: 'Metric', rowsFrom: 'Lines', compare: 'Weeks', showDelta: false, totalLabel: '', valueMode: 'Latest',
      lines: 'Total SKUs (active & inactive)\nSKUs Reviewed\nWrong Category Found\nUpdated\nPending',
      columns: [{ label: 'Value', kind: 'number' }], reports: 'Both', glance: null,
    },
  },
  {
    id: 'working',
    title: 'Working / Updated',
    hint: 'e.g. QC Rejected Inactive to Live — W38/W39 Working & Updated, Δ Updated',
    apply: { layout: 'Working / Updated', lineHeader: 'Work Type', lines: 'Highlight & Description\nCategory Shifting', reports: 'Governance' },
  },
  {
    id: 'status',
    title: 'Status breakdown',
    hint: 'e.g. Right / Wrong Category / Check Pending + Grand Total',
    apply: { layout: 'Status breakdown', lineHeader: 'Category Status', lines: 'Right Category\nWrong Category\nCheck Pending', reports: 'Governance' },
  },
  {
    id: 'count',
    title: 'Counts, compare weeks',
    hint: 'e.g. Brand Authorization / Logo Update, Product Lock count',
    apply: { layout: 'Count', lineHeader: 'Metric', lines: 'Brand Auth. — Seller Count\nLogo — Brand\nLogo — Category', reports: 'Governance' },
  },
  {
    id: 'blank',
    title: 'Blank custom table',
    hint: 'Design your own columns and rows',
    apply: { layout: 'Custom table', lineHeader: 'Name', rowsFrom: 'Lines', compare: 'Weeks', showDelta: true, totalLabel: 'Total', columns: [{ label: 'Done', kind: 'number' }], reports: 'Governance', glance: null },
  },
];
