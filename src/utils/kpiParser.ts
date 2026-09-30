import { dashboardConfig, type KpiMetricPairRule } from '../config/dashboard.config';
import type { CellValue, KpiEmployee, KpiMetric, KpiReport, KpiSection, ReportTab } from '../types';
import { isBlank, monthKeyOf, monthLabel, parseDate, text, toNumber } from './parse';

/** "B1" -> [row 0, col 1] */
function cellRef(ref: string): [number, number] {
  const m = ref.toUpperCase().match(/^([A-Z]+)(\d+)$/);
  if (!m) return [-1, -1];
  const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return [Number(m[2]) - 1, col];
}

const at = (grid: CellValue[][], r: number, c: number): CellValue => grid[r]?.[c] ?? null;

function metric(rule: Pick<KpiMetricPairRule, 'id' | 'label' | 'scope'>, targetHeader: string, actualHeader: string, target: number | null, actual: number | null): KpiMetric {
  return {
    id: rule.id,
    label: rule.label,
    scope: rule.scope,
    targetHeader,
    actualHeader,
    target,
    actual,
    pct: target !== null && actual !== null && target !== 0 ? (actual / target) * 100 : null,
    gap: target !== null && actual !== null ? actual - target : null,
  };
}

/** Finds the column index for each configured metric pair within a header row. */
function resolvePairs(headers: string[]): { rule: KpiMetricPairRule; t: number; a: number }[] {
  const used = new Set<number>();
  const find = (patterns: RegExp[]) => {
    for (const p of patterns) {
      const i = headers.findIndex((h, idx) => !used.has(idx) && p.test(h));
      if (i >= 0) return i;
    }
    return -1;
  };
  const out: { rule: KpiMetricPairRule; t: number; a: number }[] = [];
  for (const rule of dashboardConfig.kpi.metricPairs) {
    const t = find(rule.target);
    const a = find(rule.actual);
    if (t >= 0 && a >= 0) {
      used.add(t);
      used.add(a);
      out.push({ rule, t, a });
    }
  }
  if (out.length) return out;
  // Fallback for unfamiliar layouts: pair "...Target (X)" with "Achieved/Actual (X)".
  const unit = (h: string) => h.match(/\(([^)]+)\)/)?.[1]?.toLowerCase().replace(/s$/, '') ?? '';
  headers.forEach((h, t) => {
    if (!/target/i.test(h)) return;
    const a = headers.findIndex((x) => /achiev|actual/i.test(x) && unit(x) === unit(h));
    if (a >= 0) out.push({ rule: { id: `auto-${t}`, label: unit(h) || h, scope: 'month', target: [], actual: [] }, t, a });
  });
  return out;
}

function sectionTitle(values: CellValue[][], headerRow: number, fallback: string): string {
  for (let r = headerRow - 1; r >= Math.max(0, headerRow - 3); r--) {
    const cells = (values[r] ?? []).filter((v) => !isBlank(v));
    if (cells.length === 1 && typeof cells[0] === 'string') return cells[0].trim();
  }
  return fallback;
}

function readCell(tab: ReportTab, ref: string): string | null {
  const [r, c] = cellRef(ref);
  if (r < 0) return null;
  const v = at(tab.values, r, c);
  const f = at(tab.formatted, r, c);
  return isBlank(f) ? (isBlank(v) ? null : String(v)) : String(f);
}

function readPeriod(tab: ReportTab, ref: string): string | null {
  const [r, c] = cellRef(ref);
  if (r < 0) return null;
  const ms = parseDate(at(tab.values, r, c));
  return ms !== null ? monthLabel(monthKeyOf(ms)) : readCell(tab, ref);
}

/** Parses the KPI & Target (or Target) tab into team sections with metric pairs. */
export function parseKpiTab(tab: ReportTab): KpiReport {
  const { values, formatted } = tab;
  const cfg = dashboardConfig.kpi;
  const headerRows: number[] = [];
  values.forEach((row, i) => {
    if ((row ?? []).some((v) => typeof v === 'string' && cfg.nameHeader.test(v.trim()))) headerRows.push(i);
  });

  const sections: KpiSection[] = headerRows.map((hr, si) => {
    const headers = (values[hr] ?? []).map((v) => text(v));
    const nameCol = headers.findIndex((h) => cfg.nameHeader.test(h));
    const end = headerRows[si + 1] ?? values.length;
    const pairs = resolvePairs(headers);
    const employees: KpiEmployee[] = [];
    for (let r = hr + 1; r < end; r++) {
      const name = text(at(values, r, nameCol));
      if (!name) continue; // totals rows, blank rows, next section title
      const cells: Record<string, string> = {};
      headers.forEach((h, c) => {
        if (!h) return;
        const f = at(formatted, r, c);
        cells[h] = isBlank(f) ? text(at(values, r, c)) : String(f);
      });
      employees.push({
        name,
        cells,
        metrics: pairs.map(({ rule, t, a }) =>
          metric(rule, headers[t], headers[a], toNumber(at(values, r, t)), toNumber(at(values, r, a))),
        ),
      });
    }
    const totals = pairs.map(({ rule, t, a }) => {
      const rows = employees.map((e) => e.metrics.find((m) => m.id === rule.id)!);
      const withTarget = rows.filter((m) => m.target !== null);
      const sumT = withTarget.length ? withTarget.reduce((s, m) => s + (m.target ?? 0), 0) : null;
      const sumA = rows.some((m) => m.actual !== null) ? rows.reduce((s, m) => s + (m.actual ?? 0), 0) : null;
      return metric(rule, headers[t], headers[a], sumT, sumA);
    });
    return {
      title: sectionTitle(values, hr, `Team ${si + 1}`),
      headers: headers.filter(Boolean),
      employees,
      metricIds: pairs.map((p) => p.rule.id),
      totals,
    };
  });

  const headlineParts = sections.flatMap((s) =>
    s.totals.filter((m) => m.scope === 'month' && m.pct !== null).map((m) => ({ section: s.title, metric: m.label, pct: m.pct as number })),
  );
  return {
    sheet: tab.sheet,
    period: readPeriod(tab, cfg.periodCell),
    asOf: readCell(tab, cfg.asOfCell),
    sections,
    headlinePct: headlineParts.length ? headlineParts.reduce((s, p) => s + p.pct, 0) / headlineParts.length : null,
    headlineParts,
  };
}
