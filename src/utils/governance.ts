import { GOV_COLUMNS, PROGRESS_HEADERS, PROJECT_HEADERS, type GovField } from '../config/governance.config';
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
  /** True while a change made in this browser is not yet confirmed by the sheet. */
  pending?: boolean;
}

export interface ProgressLog {
  id: string;
  timestamp: number | null;
  projectId: string;
  date: string;
  person: string;
  reviewed: number;
  found: number;
  updated: number;
  note: string;
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

export function toProjects(rows: Row[]): Project[] {
  const h = PROJECT_HEADERS;
  return rows
    .filter((r) => text(r[h[0]]))
    .map((r) => ({
      id: text(r['Project ID']),
      createdAt: parseDate(r['Created At']),
      name: text(r['Project Name']) || text(r['Project ID']),
      workType: text(r['Work Type']),
      description: text(r['Description']),
      poc: text(r['POC']),
      assignees: text(r['Assignees']).split(/[,;]/).map((s) => s.trim()).filter(Boolean),
      totalSkus: toNumber(r['Total SKUs']),
      startDate: isoDay(r['Start Date']),
      dueDate: isoDay(r['Due Date']),
      status: text(r['Status']) || 'Planned',
      priority: text(r['Priority']) || 'Medium',
      foundLabel: text(r['Found Label']) || 'Issues found',
      updatedAt: parseDate(r['Updated At']),
      updatedBy: text(r['Updated By']),
    }));
}

export function toProgress(rows: Row[]): ProgressLog[] {
  const h = PROGRESS_HEADERS;
  return rows
    .filter((r) => text(r[h[0]]) && text(r['Project ID']))
    .map((r) => ({
      id: text(r['Log ID']),
      timestamp: parseDate(r['Timestamp']),
      projectId: text(r['Project ID']),
      date: isoDay(r['Date']),
      person: text(r['Person']),
      reviewed: toNumber(r['Reviewed']) ?? 0,
      found: toNumber(r['Found']) ?? 0,
      updated: toNumber(r['Updated']) ?? 0,
      note: text(r['Note']),
    }));
}

export interface ProjectStats {
  reviewed: number;
  found: number;
  updated: number;
  /** Found − Updated (never negative). */
  pending: number;
  /** Reviewed ÷ Total SKUs × 100, null when total unknown. */
  progressPct: number | null;
  /** Updated ÷ Found × 100. */
  fixPct: number | null;
  lastLog: string | null;
  logs: ProgressLog[];
  byPerson: { person: string; reviewed: number; found: number; updated: number; logs: number }[];
  overdue: boolean;
}

const dayMs = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).getTime() : null);

export function projectStats(p: Project, logs: ProgressLog[], range?: [number, number]): ProjectStats {
  const mine = logs
    .filter((l) => l.projectId === p.id)
    .filter((l) => {
      if (!range) return true;
      const ms = dayMs(l.date) ?? l.timestamp;
      return ms !== null && ms >= range[0] && ms < range[1];
    })
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.timestamp ?? 0) - (b.timestamp ?? 0)));
  const sum = (k: 'reviewed' | 'found' | 'updated') => mine.reduce((s, l) => s + l[k], 0);
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
  return {
    reviewed,
    found,
    updated,
    pending: Math.max(0, found - updated),
    progressPct: p.totalSkus ? Math.min(100, (reviewed / p.totalSkus) * 100) : null,
    fixPct: found ? (updated / found) * 100 : null,
    lastLog: mine.length ? mine[mine.length - 1].date : null,
    logs: mine,
    byPerson: [...people.values()].sort((a, b) => b.reviewed - a.reviewed),
    overdue: !closed && due !== null && due + 86400000 < Date.now(),
  };
}

/** New IDs are created in the browser so pending changes can be matched after the sync. */
export const newId = (prefix: 'PRJ' | 'LOG') =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
