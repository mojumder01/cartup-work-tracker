/**
 * Product Governance report model — one block per REVAMP project, laid out like
 * the "Product Governance — Week 37 vs Week 38" template. Shared by the on-screen
 * slide, the Excel export and the editable PowerPoint export.
 */
import { groupAdhoc, metricLabels, projectStats, type AdhocTask, type Project, type ProgressLog } from './governance';
import type { Period } from './periods';

export type Cell = string | number | null;

export interface ReportBlock {
  id: string;
  title: string;
  /** e.g. "NEW" */
  tag?: string;
  head: string[];
  rows: Cell[][];
  total?: Cell[];
  /** Last column holds a change value (coloured + / −). */
  deltaCol: boolean;
  note?: string;
}

const inRange = (l: ProgressLog, p: Period) => {
  const ms = l.date ? new Date(`${l.date}T00:00:00`).getTime() : l.timestamp;
  return ms !== null && ms >= p.start && ms < p.end;
};

/** Default: shown in report, and either still open or active in one of the two periods. */
export function defaultIncluded(p: Project, logs: ProgressLog[], prev: Period, cur: Period): boolean {
  if (!p.showInReport) return false;
  if (!/complete|cancel/i.test(p.status)) return true;
  return logs.some((l) => l.projectId === p.id && (inRange(l, prev) || inRange(l, cur)));
}

export function isNewIn(p: Project, logs: ProgressLog[], cur: Period): boolean {
  const mine = logs.filter((l) => l.projectId === p.id);
  const before = mine.some((l) => {
    const ms = l.date ? new Date(`${l.date}T00:00:00`).getTime() : l.timestamp;
    return ms !== null && ms < cur.start;
  });
  if (before) return false;
  if (mine.some((l) => inRange(l, cur))) return true;
  return p.createdAt !== null && p.createdAt >= cur.start && p.createdAt < cur.end;
}

/** Report note + the notes typed in "Log progress" during the current period (oldest first, no duplicates). */
function blockNote(p: Project, logs: ProgressLog[], cur: Period): string | undefined {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const l of logs.filter((x) => x.projectId === p.id && x.note && inRange(x, cur)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const key = `${l.date}|${l.person}|${l.note}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const d = l.date ? new Date(`${l.date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    lines.push(`• ${[d, l.person].filter(Boolean).join(' · ')}: ${l.note}`);
  }
  const all = [p.reportNote, ...lines].filter(Boolean);
  return all.length ? all.join('\n') : undefined;
}

export function projectBlock(p: Project, logs: ProgressLog[], prev: Period, cur: Period): ReportBlock {
  const a = projectStats(p, logs, [prev.start, prev.end]);
  const b = projectStats(p, logs, [cur.start, cur.end]);
  const labels = metricLabels(p);
  const tag = isNewIn(p, logs, cur) ? 'NEW' : undefined;
  const poc = p.pocs.length ? ` · POC: ${p.pocs.join(' / ')}` : '';
  const names = [...new Set([...a.lines.map((l) => l.line), ...b.lines.map((l) => l.line)])];
  const get = (s: typeof a, name: string) => s.lines.find((l) => l.line === name);
  const v = (x: ReturnType<typeof get>, k: (typeof labels)[number]['key']): Cell => (x && x.entries ? x[k] : null);
  const last = labels[labels.length - 1].key;
  const delta = (x: ReturnType<typeof get>, y: ReturnType<typeof get>): Cell => {
    if (!y?.entries && !x?.entries) return null;
    if (!x?.entries) return 'New';
    return (y?.entries ? y[last] : 0) - x[last];
  };
  const lineName = (n: string) => n || p.name;

  if (p.layout === 'Status breakdown') {
    const rows = names.map((n) => [lineName(n), v(get(b, n), 'reviewed')]);
    return {
      id: p.id,
      title: `${p.name} (${cur.short})${poc}`,
      tag,
      head: [p.lineHeader, labels[0].label],
      rows,
      total: ['Grand Total', b.logs.length ? b.reviewed : null],
      deltaCol: false,
      note: blockNote(p, logs, cur),
    };
  }

  const single = labels.length === 1;
  const head = [
    p.lineHeader,
    ...labels.map((k) => (single ? prev.short : `${prev.short}\n${k.label}`)),
    ...labels.map((k) => (single ? cur.short : `${cur.short}\n${k.label}`)),
    single ? 'Δ' : `Δ ${labels[labels.length - 1].label}`,
  ];
  const rows = names.map((n) => {
    const x = get(a, n);
    const y = get(b, n);
    return [lineName(n), ...labels.map((k) => v(x, k.key)), ...labels.map((k) => v(y, k.key)), delta(x, y)];
  });
  const withTotal = p.layout === 'Reviewed / Found / Updated' && names.length > 1;
  return {
    id: p.id,
    title: `${p.name}${poc}`,
    tag,
    head,
    rows,
    total: withTotal
      ? ['Total', ...labels.map((k) => a[k.key]), ...labels.map((k) => b[k.key]), b.logs.length || a.logs.length ? b[last] - a[last] : null]
      : undefined,
    deltaCol: true,
    note: blockNote(p, logs, cur),
  };
}

export function adhocBlock(id: string, title: string, head: string, prevTasks: AdhocTask[], curTasks: AdhocTask[], key: (t: AdhocTask) => string, prev: Period, cur: Period): ReportBlock {
  const a = new Map(groupAdhoc(prevTasks, key).map((g) => [g.key, g]));
  const b = new Map(groupAdhoc(curTasks, key).map((g) => [g.key, g]));
  const keys = [...new Set([...a.keys(), ...b.keys()])].sort(
    (m, n) => (b.get(n)?.products ?? 0) + (a.get(n)?.products ?? 0) - ((b.get(m)?.products ?? 0) + (a.get(m)?.products ?? 0)),
  );
  const rows: Cell[][] = keys.map((k) => {
    const x = a.get(k);
    const y = b.get(k);
    return [k, x?.tasks ?? null, x?.products ?? null, y?.tasks ?? null, y?.products ?? null, !x && y ? 'New' : (y?.products ?? 0) - (x?.products ?? 0)];
  });
  const sum = (arr: AdhocTask[]) => [arr.length, arr.reduce((z, t) => z + t.products, 0)];
  const tp = sum(prevTasks);
  const tc = sum(curTasks);
  return {
    id,
    title,
    head: [head, `${prev.short}\nTasks`, `${prev.short}\nSKUs`, `${cur.short}\nTasks`, `${cur.short}\nSKUs`, 'Δ SKUs'],
    rows,
    total: ['Total', ...tp, ...tc, tc[1] - tp[1]],
    deltaCol: true,
  };
}
