/**
 * "Monthly Report" deck (template: August 2026 Monthly Report.pptx).
 *
 * Team-level monthly totals per stream:
 *  - Production / QC / Visual: the same numbers as the Monthly Performance report
 *    (buildCatalogueReport, month mode), summed over the team. Target = Σ of the
 *    staff targets; Achieved % = team total ÷ team target.
 *  - Governance: one slide per REVAMP project with the month's progress
 *    (Sum projects: the month's entries added up; Latest projects: +change, last
 *    value before the month → last value in the month).
 *  - Other / Ad-Hoc: Governance "Main" tab rows dated in the month.
 *
 * The deck is a list of slides of plain strings. Any text or table cell can be
 * overridden by an edit ("slideId:path" → text), so the preview, the PDF and the
 * PowerPoint file all show the edited text.
 */
import type { CatalogueReport } from './catalogue';
import { customStats, lineStats, metricLabels, type AdhocTask, type Project, type ProgressLog } from './governance';
import { weekPeriod, type Period } from './periods';

export type Tone = 'prod' | 'qc' | 'vis' | 'gov' | 'other';

export const TONE_COLOR: Record<Tone, string> = { prod: 'B2571B', qc: '1E7A4C', vis: '6A3E9E', gov: '1E2761', other: '946200' };
export const TONE_LABEL: Record<Tone, string> = { prod: 'Production', qc: 'QC', vis: 'Visual', gov: 'Governance', other: 'Other / Ad-Hoc' };

export interface MTable {
  head: string[];
  rows: string[][];
}
export interface MStat {
  value: string;
  label: string;
}
export interface MCard {
  title: string;
  body: string;
  badge: string;
}

interface Base {
  id: string;
  /** Left footer text. */
  foot: string;
}
export type MSlide =
  | (Base & { kind: 'title'; kicker: string; title: string; sections: string; intro: string })
  | (Base & { kind: 'highlights'; title: string; sub: string; items: { tone: Tone; letter: string; label: string; text: string }[] })
  | (Base & { kind: 'section'; tone: Tone; tag: string; title: string; sub: string; stats: MStat[]; table: MTable; note: string })
  | (Base & { kind: 'blocks'; tone: Tone; tag: string; title: string; sub: string; lead: string; blocks: { heading: string; table: MTable; note: string }[] })
  | (Base & { kind: 'text'; tone: Tone; tag: string; title: string; sub: string; body: string; cards: MCard[] })
  | (Base & { kind: 'overview'; title: string; bars: { label: string; pct: number | null }[]; boxTitle: string; total: string; totalLabel: string; lines: string[]; note: string });

export interface Deck {
  month: Period;
  /** Right footer, e.g. "August 2026 Monthly Report". */
  footer: string;
  slides: MSlide[];
}

/** A slide the user added (its text comes from edits). */
export interface CustomSlide {
  id: string;
  tone: Tone;
  cards: number;
}

const n = (v: number) => v.toLocaleString('en-US');
const pctText = (v: number | null) => (v === null ? 'N/A' : `${Math.round(v)}%`);
const signed = (v: number) => (v > 0 ? `+${n(v)}` : v < 0 ? `−${n(-v)}` : '0');

/* ------------------------------------------------------------------ */
/* Governance projects for one month                                   */
/* ------------------------------------------------------------------ */

export interface ProjectMonth {
  table: MTable;
  /** Change of the last column (or "Updated") over the month: the project's contribution to the total. */
  main: number;
  mainLabel: string;
  /** Best line for the highlights, e.g. "+14,430 Updated (Highlight & Description)". */
  best: string | null;
  active: boolean;
}

/** Month progress of a project: Sum → the month's entries added up; Latest → +change (before → end of month). */
export function projectMonth(p: Project, logs: ProgressLog[], month: Period): ProjectMonth {
  const custom = p.layout === 'Custom table';
  const cols = custom ? p.columns.map((c) => c.label) : metricLabels(p).map((m) => m.label);
  const keys = custom ? cols : metricLabels(p).map((m) => m.key);
  type Row = { line: string; v: Record<string, number>; entries: number };
  const rowsOf = (range: [number, number]): Row[] => {
    if (custom) return customStats(p, logs, range).rows.map((r) => ({ line: r.line, v: r.values, entries: r.entries }));
    const mine = logs.filter((l) => l.projectId === p.id).filter((l) => {
      const ms = l.date ? new Date(`${l.date}T00:00:00`).getTime() : l.timestamp;
      return ms !== null && ms >= range[0] && ms < range[1];
    });
    return lineStats(p, mine).map((s) => ({ line: s.line, v: { reviewed: s.reviewed, found: s.found, updated: s.updated }, entries: s.entries }));
  };
  const latest = p.valueMode === 'Latest';
  const cur = rowsOf(latest ? [0, month.end] : [month.start, month.end]);
  const before = latest ? rowsOf([0, month.start]) : [];
  const inMonth = latest ? rowsOf([month.start, month.end]) : cur;
  const beforeOf = (line: string) => before.find((r) => r.line === line);
  const upd = cols.findIndex((c) => /updated/i.test(c));
  const mainIdx = upd >= 0 ? upd : Math.max(0, cols.length - 1);
  let main = 0;
  let best: { v: number; text: string } | null = null;
  const rows = cur.map((r) => {
    const touched = (inMonth.find((x) => x.line === r.line)?.entries ?? 0) > 0;
    const cells = keys.map((k, i) => {
      const c = r.v[k] ?? 0;
      if (!latest) {
        if (i === mainIdx) main += c;
        if (i === mainIdx && c > 0 && (!best || c > best.v)) best = { v: c, text: `${signed(c)} ${cols[i]}${r.line ? ` (${r.line})` : ''}` };
        return touched ? n(c) : '—';
      }
      if (!touched) return r.entries ? n(c) : '—';
      const b = beforeOf(r.line);
      const prev = b && b.entries ? b.v[k] ?? 0 : null;
      const d = prev === null ? c : c - prev;
      if (i === mainIdx) main += Math.max(0, d);
      if (i === mainIdx && d > 0 && (!best || d > best.v)) best = { v: d, text: `${signed(d)} ${cols[i]}${r.line ? ` (${r.line})` : ''}` };
      return prev === null ? n(c) : `${signed(d)} (${n(prev)} → ${n(c)})`;
    });
    return [r.line || p.name, ...cells];
  });
  const active = inMonth.some((r) => r.entries > 0);
  return {
    table: { head: [p.lineHeader || 'Metric', ...cols], rows },
    main,
    mainLabel: cols[mainIdx] ?? '',
    best: (best as { text: string } | null)?.text ?? null,
    active,
  };
}

/* ------------------------------------------------------------------ */
/* Deck                                                                */
/* ------------------------------------------------------------------ */

export interface DeckInput {
  month: Period;
  cat: CatalogueReport;
  /** Hide people who left and had no work in the month. */
  isLeft: (name: string) => boolean;
  projects: Project[];
  logs: ProgressLog[];
  adhoc: AdhocTask[] | null;
  /** People who get their own Ad-Hoc breakdown slide. */
  adhocPeople: string[];
  custom: CustomSlide[];
}

export function weeksText(month: Period): string {
  const a = weekPeriod(month.start).index;
  const b = weekPeriod(month.end - 86400000).index;
  return a === b ? `Week ${a}` : `Weeks ${a}–${b}`;
}

export function buildDeck(input: DeckInput): Deck {
  const { month, cat } = input;
  const M = month.label; // "August 2026"
  const mName = M.split(' ')[0];
  const weeks = weeksText(month);
  const footer = `${M} Monthly Report`;

  // ---- Production / QC / Visual team totals ----
  const keep = <T extends { name: string }>(rows: T[], active: (r: T) => boolean) => rows.filter((r) => !input.isLeft(r.name) || active(r));
  const prod = keep(cat.production, (r) => r.total + r.skus > 0);
  const qc = keep(cat.qc, (r) => r.sellers + r.skus > 0);
  const vis = keep(cat.visual, (r) => r.sellers + r.images > 0);
  const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
  // Team target = Σ targets of the people who worked that month (as in the Monthly Performance totals).
  const tgt = <T extends { target: number | null }>(rows: T[], worked: (r: T) => boolean) => {
    const w = rows.filter((r) => r.target && worked(r));
    return w.length ? sum(w, (r) => r.target ?? 0) : null;
  };
  const P = { target: tgt(prod, (r) => r.total + r.skus > 0), manual: sum(prod, (r) => r.manual), bulk: sum(prod, (r) => r.bulk), sellers: sum(prod, (r) => r.total), skus: sum(prod, (r) => r.skus) };
  const Q = { target: tgt(qc, (r) => r.sellers + r.skus > 0), sellers: sum(qc, (r) => r.sellers), skus: sum(qc, (r) => r.skus) };
  const V = { target: tgt(vis, (r) => r.sellers + r.images > 0), sellers: sum(vis, (r) => r.sellers), images: sum(vis, (r) => r.images), edited: sum(vis, (r) => r.edited) };
  const pP = P.target ? (P.sellers / P.target) * 100 : null;
  const pQ = Q.target ? (Q.skus / Q.target) * 100 : null;
  const pV = V.target ? (V.sellers / V.target) * 100 : null;
  const tv = (v: number | null) => (v === null ? 'N/A' : n(v));

  // ---- Governance projects ----
  const projects = input.projects
    .filter((p) => p.showInReport)
    .map((p) => ({ p, m: projectMonth(p, input.logs, month) }))
    .filter(({ p, m }) => m.active || (!/complete|cancel/i.test(p.status) && (!p.startDate || p.startDate < new Date(month.end).toISOString().slice(0, 10)) && m.table.rows.some((r) => r.slice(1).some((c) => c !== '—'))));
  const govTotal = sum(projects, (x) => x.m.main);

  // ---- Ad-Hoc (Main tab) ----
  const tasks = (input.adhoc ?? []).filter((t) => t.date !== null && t.date >= month.start && t.date < month.end);
  const group = (key: (t: AdhocTask) => string) => {
    const m = new Map<string, { k: string; tasks: number; skus: number; shops: number; images: number; types: Map<string, number> }>();
    for (const t of tasks) {
      const k = key(t) || '(blank)';
      const g = m.get(k.toLowerCase()) ?? { k, tasks: 0, skus: 0, shops: 0, images: 0, types: new Map() };
      g.tasks++;
      g.skus += t.products;
      g.shops += t.shops;
      g.images += t.images;
      g.types.set(t.taskType || '(blank)', (g.types.get(t.taskType || '(blank)') ?? 0) + t.products);
      m.set(k.toLowerCase(), g);
    }
    return [...m.values()].sort((a, b) => b.skus - a.skus || b.tasks - a.tasks);
  };
  const byType = group((t) => t.taskType);
  const byPerson = group((t) => t.person);
  const adhocSkus = sum(tasks, (t) => t.products);

  const slides: MSlide[] = [];
  slides.push({
    id: 'title',
    kind: 'title',
    foot: '',
    kicker: M.toUpperCase(),
    title: 'Monthly Report',
    sections: 'Production · QC · Visual · Governance · Other/Ad-Hoc',
    intro: `Team-level monthly totals by task/project. Figures reflect net progress achieved during ${mName} (${weeks}); cumulative KPIs are shown as net change, weekly activity counts as the sum for the month.`,
  });

  const govBest = projects
    .filter((x) => x.m.best)
    .slice(0, 3)
    .map((x) => `${x.p.name}: ${x.m.best}`);
  slides.push({
    id: 'highlights',
    kind: 'highlights',
    foot: 'Key Highlights',
    title: 'Key Highlights',
    sub: `${M} — at a glance`,
    items: [
      { tone: 'prod', letter: 'P', label: 'Production', text: `${n(P.sellers)} sellers onboarded, ${n(P.skus)} SKUs uploaded in ${mName}${P.target ? ` (${pctText(pP)} of the ${n(P.target)}-seller monthly target)` : ''}.` },
      { tone: 'qc', letter: 'Q', label: 'QC', text: Q.target ? `${n(Q.skus)} of a ${n(Q.target)} SKU monthly target achieved (${pctText(pQ)}) across ${n(Q.sellers)} sellers.` : `${n(Q.skus)} SKUs checked across ${n(Q.sellers)} sellers.` },
      { tone: 'vis', letter: 'V', label: 'Visual', text: `${n(V.edited)} images edited across ${n(V.sellers)} sellers (${n(V.images)} images reviewed)${V.target ? ` — ${pctText(pV)} of the seller-based target` : ''}.` },
      { tone: 'gov', letter: 'G', label: 'Governance', text: govBest.length ? `${govBest.join('; ')}.` : projects.length ? `${projects.length} project(s) reported for ${mName}.` : `No project progress logged for ${mName}.` },
      {
        tone: 'other',
        letter: 'O',
        label: 'Other / Ad-Hoc',
        text: tasks.length ? `${n(tasks.length)} ad-hoc tasks covering ${n(adhocSkus)} SKUs${byType[0] ? ` — most: ${byType[0].k} (${n(byType[0].skus)} SKUs)` : ''}.` : `No ad-hoc tasks logged for ${mName}.`,
      },
    ],
  });

  const total = `${mName} Total`;
  slides.push({
    id: 'production',
    kind: 'section',
    tone: 'prod',
    foot: 'Production',
    tag: 'PRODUCTION',
    title: '1. Production — Regular Task',
    sub: `Team-level new-upload output for ${M}`,
    stats: [
      { value: tv(P.target), label: 'Monthly Target (Sellers)' },
      { value: n(P.sellers), label: `Total Sellers Onboarded (${n(P.manual)} Manual + ${n(P.bulk)} Bulk)` },
      { value: n(P.skus), label: 'SKUs Uploaded' },
      { value: pctText(pP), label: 'Achieved vs Target' },
    ],
    table: {
      head: ['Metric', total],
      rows: [
        ['Monthly Target (Sellers)', tv(P.target)],
        ['Manual (Sellers)', n(P.manual)],
        ['Bulk (Sellers)', n(P.bulk)],
        ['Total Sellers Onboarded', n(P.sellers)],
        ['SKUs Uploaded', n(P.skus)],
        ['Achieved %', pctText(pP)],
      ],
    },
    note: 'Team-level totals only — no individual-level breakdown included.',
  });
  slides.push({
    id: 'qc',
    kind: 'section',
    tone: 'qc',
    foot: 'QC',
    tag: 'QC',
    title: '2. QC — Regular Task',
    sub: `Team-level QC output for ${M} against the combined monthly target`,
    stats: [
      { value: tv(Q.target), label: 'Monthly Target (SKUs)' },
      { value: n(Q.sellers), label: 'Sellers Covered' },
      { value: n(Q.skus), label: 'SKUs Checked' },
      { value: pctText(pQ), label: 'Achieved vs Target' },
    ],
    table: {
      head: ['Metric', total],
      rows: [
        ['Monthly Target (SKUs)', tv(Q.target)],
        ['Seller Count', n(Q.sellers)],
        ['SKUs Count', n(Q.skus)],
        ['Achieved %', pctText(pQ)],
      ],
    },
    note: `${pQ !== null && pQ >= 100 ? `QC crossed its monthly target overall (${pctText(pQ)}). ` : ''}Team-level totals only — no individual-level breakdown included.`,
  });
  slides.push({
    id: 'visual',
    kind: 'section',
    tone: 'vis',
    foot: 'Visual',
    tag: 'VISUAL',
    title: '3. Visual — Regular Task (Image Editing)',
    sub: 'Regular image-editing work for the month',
    stats: [
      { value: tv(V.target), label: 'Target (Sellers)' },
      { value: n(V.sellers), label: 'Sellers Served' },
      { value: n(V.images), label: 'Total Images Reviewed' },
      { value: pctText(pV), label: 'Achieved vs Target' },
    ],
    table: {
      head: ['Metric', total],
      rows: [
        ['Target (Sellers)', tv(V.target)],
        ['Seller Count', n(V.sellers)],
        ['Total Image Count', n(V.images)],
        ['Edited Image Count', n(V.edited)],
        ['Achieved %', pctText(pV)],
      ],
    },
    note: 'Team-level totals only. Campaign / project image work is reported under Governance and Other / Ad-Hoc.',
  });

  const done = input.projects.filter((p) => /complete/i.test(p.status) && p.updatedAt !== null && p.updatedAt >= month.start && p.updatedAt < month.end).map((p) => p.name);
  projects.forEach(({ p, m }, i) => {
    slides.push({
      id: `prj-${p.id}`,
      kind: 'blocks',
      tone: 'gov',
      foot: `Governance — ${p.name}`,
      tag: 'GOVERNANCE',
      title: `4.${i + 1}  ${p.name}${p.workType ? ` (${p.workType})` : ''}`,
      sub: [p.pocs.length ? `POC: ${p.pocs.join(' / ')}` : '', p.status].filter(Boolean).join(' · '),
      lead: i === 0 && done.length ? `Our revamp tasks for ${done.join(', ')} have been completed.` : '',
      blocks: [
        {
          heading: p.valueMode === 'Latest' ? `${mName} progress (change during the month)` : `${mName} total`,
          table: m.table,
          note: p.reportNote || (p.totalSkus ? `Scope: ${n(p.totalSkus)} SKUs.` : ''),
        },
      ],
    });
  });

  if (tasks.length) {
    slides.push({
      id: 'adhoc-type',
      kind: 'blocks',
      tone: 'other',
      foot: 'Other/Ad-Hoc — by task type',
      tag: 'OTHER / AD-HOC',
      title: '5.1  Ad-Hoc Tasks by Type',
      sub: `Governance Main tab, tasks dated in ${M} (${weeks})`,
      lead: '',
      blocks: [
        {
          heading: '',
          table: {
            head: ['Task Type', 'Tasks', 'SKUs', 'Shops', 'Images'],
            rows: [...byType.map((g) => [g.k, n(g.tasks), n(g.skus), n(g.shops), n(g.images)]), ['Total', n(tasks.length), n(adhocSkus), n(sum(tasks, (t) => t.shops)), n(sum(tasks, (t) => t.images))]],
          },
          note: '',
        },
      ],
    });
    slides.push({
      id: 'adhoc-person',
      kind: 'blocks',
      tone: 'other',
      foot: 'Other/Ad-Hoc — by person',
      tag: 'OTHER / AD-HOC',
      title: '5.2  Ad-Hoc Tasks by Person',
      sub: `Who handled the ${mName} ad-hoc work`,
      lead: '',
      blocks: [
        {
          heading: '',
          table: {
            head: ['Person', 'Tasks', 'SKUs', 'Main task type'],
            rows: byPerson.map((g) => {
              const top = [...g.types.entries()].sort((a, b) => b[1] - a[1])[0];
              return [g.k, n(g.tasks), n(g.skus), top ? top[0] : '—'];
            }),
          },
          note: '',
        },
      ],
    });
    for (const name of input.adhocPeople) {
      const g = byPerson.find((x) => x.k.toLowerCase() === name.toLowerCase());
      if (!g) continue;
      const rows = [...g.types.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => [k, n(v)]);
      slides.push({
        id: `adhoc-p-${name.toLowerCase()}`,
        kind: 'blocks',
        tone: 'other',
        foot: `Other/Ad-Hoc — ${g.k} Task Breakdown`,
        tag: 'OTHER / AD-HOC',
        title: `${g.k} — Task Breakdown`,
        sub: `SKU-level ad-hoc updates, summed across ${weeks}`,
        lead: '',
        blocks: [{ heading: '', table: { head: ['Task Type', total], rows }, note: `Total ad-hoc SKU updates: ${n(g.skus)}` }],
      });
    }
  }

  for (const c of input.custom) {
    slides.push({
      id: c.id,
      kind: 'text',
      tone: c.tone,
      foot: TONE_LABEL[c.tone],
      tag: TONE_LABEL[c.tone].toUpperCase(),
      title: 'Click to write the title',
      sub: 'Subtitle',
      body: 'Click to write the text of this slide.',
      cards: Array.from({ length: c.cards }, (_, i) => ({ title: `Part-${i + 1}`, body: 'Click to write.', badge: i === 0 ? 'COMPLETE' : 'IN PROGRESS' })),
    });
  }

  slides.push({
    id: 'overview',
    kind: 'overview',
    foot: `Prepared for internal review — ${M}`,
    title: `${M} — Team Achievement Overview`,
    bars: [
      { label: 'Production', pct: pP === null ? null : Math.round(pP) },
      { label: 'QC', pct: pQ === null ? null : Math.round(pQ) },
      { label: 'Visual', pct: pV === null ? null : Math.round(pV) },
    ],
    boxTitle: 'Governance + Other/Ad-Hoc',
    total: n(govTotal + adhocSkus),
    totalLabel: `total items processed in ${mName}`,
    lines: [`Governance (Project):  ${n(govTotal)} items`, `Other/Ad-Hoc:  ${n(adhocSkus)} items`],
    note: "No single target applies across Governance's project & ad-hoc work streams, so output is reported as total volume rather than an achievement %.",
  });

  return { month, footer, slides };
}

/* ------------------------------------------------------------------ */
/* Edits                                                               */
/* ------------------------------------------------------------------ */

/** Value at a dotted path ("items.0.text", "table.rows.2.1"). */
export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}

function setPath(obj: unknown, path: string, value: string) {
  const parts = path.split('.');
  let o = obj as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    o = o?.[parts[i]] as Record<string, unknown>;
    if (o == null) return;
  }
  const last = parts[parts.length - 1];
  if (o && typeof o[last] === 'string') o[last] = value;
}

/** Applies "slideId:path" → text edits (and the "deck:footer" edit) to a copy of the deck. */
export function applyEdits(deck: Deck, edits: Record<string, string>): Deck {
  const out: Deck = JSON.parse(JSON.stringify(deck));
  out.month = deck.month;
  for (const [key, value] of Object.entries(edits)) {
    const i = key.indexOf(':');
    const id = key.slice(0, i);
    const path = key.slice(i + 1);
    if (id === 'deck') {
      if (path === 'footer') out.footer = value;
      continue;
    }
    const s = out.slides.find((x) => x.id === id);
    if (s) setPath(s, path, value);
  }
  return out;
}

/** Slide order: the saved order (ids that still exist); a new slide goes right after the slide before it in the default order. */
export function orderSlides(slides: MSlide[], order: string[], hidden: string[]): { all: MSlide[]; shown: MSlide[] } {
  const byId = new Map(slides.map((s) => [s.id, s]));
  const ids = order.filter((id) => byId.has(id));
  slides.forEach((s, i) => {
    if (ids.includes(s.id)) return;
    const prev = i > 0 ? ids.indexOf(slides[i - 1].id) : -1;
    ids.splice(prev + 1, 0, s.id);
  });
  const all = ids.map((id) => byId.get(id)!);
  return { all, shown: all.filter((s) => !hidden.includes(s.id)) };
}
