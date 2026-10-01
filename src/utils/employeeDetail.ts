/**
 * "Employee detail" workbook: every number in the Individual Summary for one
 * person, followed by the exact sheet rows it was added up from, plus the rows
 * that were assigned to them but not counted (and why). Nothing is estimated —
 * each total row equals the sum of the rows above it.
 */
import { C } from '../config/dashboard.config';
import type { Dataset, KpiReport, WorkRecord } from '../types';
import { checkCredit, creditRule, type CreditRule } from './credit';
import type { ExportRow } from './export';
import { buildIndividualReport, type SellerQcRow } from './individualReport';
import { text, toNumber } from './parse';
import type { Period } from './periods';
import { findPerson, type Person } from './roster';
import type { AdhocTask, Project, ProgressLog } from './governance';

const inP = (ms: number | null | undefined, p: Period) => ms != null && ms >= p.start && ms < p.end;
const day = (ms: number | null | undefined) => {
  if (ms == null) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const num = (r: WorkRecord, c: string) => toNumber(r.values[c]) ?? 0;

export interface DetailInput {
  name: string;
  ds: Dataset;
  sellerQc: SellerQcRow[] | null;
  roster: Person[];
  kpi: KpiReport | null;
  prev: Period;
  cur: Period;
  adhoc?: AdhocTask[];
  projects?: Project[];
  logs?: ProgressLog[];
}

interface RoleSheet {
  team: string;
  rule: CreditRule;
  /** Extra columns shown after the base columns; summed in the total row. */
  sums: string[];
  extra: string[];
}

const ROLE_SHEETS: RoleSheet[] = [
  { team: 'Production', rule: creditRule(C.uploadedBy)!, sums: [C.uploadedSku, C.rejectedSku], extra: [C.skuCount] },
  { team: 'Visual', rule: creditRule(C.visualEditor)!, sums: [C.imageCount, C.editedByHand, C.editedByAi], extra: [C.imageSource] },
  { team: 'QC', rule: creditRule(C.qcBy)!, sums: [C.approvedQc, C.rejectedQc], extra: [C.status] },
].filter((x) => !!x.rule);

export function buildEmployeeDetail(input: DetailInput): { name: string; rows: ExportRow[] }[] {
  const { name, ds, sellerQc, roster, kpi, prev, cur } = input;
  const key = name.toLowerCase();
  const person = findPerson(roster, name);
  const periodOf = (ms: number | null | undefined) => (inP(ms, cur) ? cur.label : inP(ms, prev) ? prev.label : null);
  const sheets: { name: string; rows: ExportRow[] }[] = [];

  // 1. Summary — the same numbers as the Individual Summary slide.
  const report = buildIndividualReport({
    ds,
    sellerQc,
    roster,
    prev,
    cur,
    teams: ['Production', 'Visual', 'QC'],
    people: { Production: [name], Visual: [name], QC: [name] },
  });
  const summary: ExportRow[] = [
    ['Employee detail report'],
    ['Employee', person?.fullName ?? name],
    ['Name in sheet', name],
    ['Team', person?.team ?? '—'],
    ['Status', person ? (person.status === 'Left' ? `Left the job${person.leftDate ? ` (${person.leftDate})` : ''}` : 'Active') : '—'],
    ['Periods', `${prev.label} (${prev.range})`, `${cur.label} (${cur.range})`],
    ['Generated', new Date().toLocaleString('en-GB')],
    [],
    ['Counting rule', 'Only finished work counts. Assigned work that is Running / Pending (or Rejected) is listed on the “Not counted” sheet.'],
    ...ROLE_SHEETS.map((r): ExportRow => [r.team, `${r.rule.column} = this person, ${r.rule.status} is ${r.rule.done.join(' / ')}, dated by ${r.rule.date}`]),
    [],
    ['Team', 'Metric', prev.label, cur.label, 'Change', 'Source sheet'],
  ];
  for (const sec of report.sections) {
    const row = sec.rows[0];
    if (!row || (!row.prev && !row.cur)) continue;
    for (const c of sec.columns) {
      const a = row.prev?.[c.key] ?? 0;
      const b = row.cur?.[c.key] ?? 0;
      summary.push([sec.team, c.label, a, b, b - a, sec.team === 'QC' && c.key === 'seller' ? 'QC rows – seller' : `${sec.team} rows`]);
    }
  }
  if (summary[summary.length - 1][0] === 'Team') summary.push(['—', 'No finished work in these periods']);

  if (kpi) {
    const lines = kpi.sections.flatMap((s) => s.employees.filter((e) => e.name.toLowerCase() === key).flatMap((e) => e.metrics.map((m) => ({ s, m }))));
    if (lines.length) {
      summary.push([], ['KPI & Target tab (values calculated by the sheet itself, for its own month)'], ['Team table', 'Metric', 'Target', 'Actual', 'Achievement %']);
      lines.forEach(({ s, m }) => summary.push([s.title, m.label, m.target, m.actual, m.pct === null ? 'N/A' : Number(m.pct.toFixed(1))]));
    }
  }
  sheets.push({ name: 'Summary', rows: summary });

  // 2. Counted rows per role.
  const notCounted: ExportRow[] = [['Role', 'JOB ID', 'Timestamp', 'Shop Name', 'Task Type', 'Status column', 'Status', 'Finished date', 'Reason not counted']];
  for (const rs of ROLE_SHEETS) {
    const { rule } = rs;
    if (!ds.has(rule.column)) continue;
    const mine = ds.records.filter((r) => text(r.values[rule.column]).toLowerCase() === key);
    const cols = [C.jobId, C.timestamp, C.shopName, C.sellerCode, C.taskType, rule.status, rule.date, ...rs.extra, ...rs.sums].filter((c, i, a) => ds.has(c) && a.indexOf(c) === i);
    const head: ExportRow = ['Period', ...cols];
    const body: ExportRow[] = [];
    const sumBy: Record<string, Record<string, number>> = { [prev.label]: {}, [cur.label]: {} };
    const count: Record<string, number> = { [prev.label]: 0, [cur.label]: 0 };
    for (const r of mine) {
      const check = checkCredit(ds, r, rule);
      const own = r.dates[rule.date];
      if (check.counted) {
        const per = periodOf(own);
        if (!per) continue;
        count[per]++;
        rs.sums.forEach((c) => (sumBy[per][c] = (sumBy[per][c] ?? 0) + num(r, c)));
        body.push([per, ...cols.map((c) => (r.dates[c] !== undefined ? day(r.dates[c]) : r.values[c] ?? null))]);
      } else if (periodOf(r.dates[C.timestamp]) || periodOf(own)) {
        notCounted.push([rs.team, r.values[C.jobId] ?? null, day(r.dates[C.timestamp]), r.values[C.shopName] ?? null, r.values[C.taskType] ?? null, rule.status, r.values[rule.status] ?? null, day(own), check.reason]);
      }
    }
    if (!body.length) continue;
    body.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[cols.indexOf(rule.date) + 1]).localeCompare(String(b[cols.indexOf(rule.date) + 1])));
    const totalRows: ExportRow[] = [prev.label, cur.label].map((per) => [
      `Total ${per}`,
      ...cols.map((c, i) => (i === 0 ? `${count[per]} rows` : rs.sums.includes(c) ? sumBy[per][c] ?? 0 : null)),
    ]);
    sheets.push({ name: `${rs.team} rows`, rows: [head, ...body, [], ...totalRows] });
  }

  // 3. Seller QC rows (Admin portal QC import data tab).
  if (sellerQc) {
    const mine = sellerQc.filter((r) => r.qcBy.toLowerCase() === key && periodOf(r.date));
    if (mine.length) {
      const rows: ExportRow[] = [['Period', 'QC Date', 'QC By', 'Number of SKUs'], ...mine.map((r): ExportRow => [periodOf(r.date), day(r.date), r.qcBy, r.skus])];
      rows.push([], ...[prev, cur].map((p): ExportRow => [`Total ${p.label}`, null, null, mine.filter((r) => inP(r.date, p)).reduce((z, r) => z + r.skus, 0)]));
      sheets.push({ name: 'QC rows – seller', rows });
    }
  }

  sheets.push({ name: 'Not counted', rows: notCounted.length > 1 ? notCounted : [...notCounted, ['—', 'Nothing assigned in these periods is unfinished']] });

  // 4. Governance (Ad-Hoc "Main" tab and REVAMP progress), when the person appears there.
  const adhoc = (input.adhoc ?? []).filter((t) => t.person.toLowerCase() === key && periodOf(t.date));
  if (adhoc.length) {
    const rows: ExportRow[] = [['Period', 'Date', 'Task Type', 'Project Name', 'Shop Name', 'Products', 'Shops', 'Images', 'Status', 'Note']];
    adhoc.forEach((t) => rows.push([periodOf(t.date), day(t.date), t.taskType, t.project, t.shop, t.products, t.shops, t.images, t.status, t.note]));
    rows.push([], ...[prev, cur].map((p): ExportRow => {
      const x = adhoc.filter((t) => inP(t.date, p));
      return [`Total ${p.label}`, `${x.length} tasks`, null, null, null, x.reduce((z, t) => z + t.products, 0), x.reduce((z, t) => z + t.shops, 0), x.reduce((z, t) => z + t.images, 0)];
    }));
    sheets.push({ name: 'Governance Ad-Hoc', rows });
  }
  const names = new Map((input.projects ?? []).map((p) => [p.id, p.name]));
  const logs = (input.logs ?? []).filter((l) => l.person.toLowerCase() === key && periodOf(l.date ? new Date(`${l.date}T00:00:00`).getTime() : l.timestamp));
  if (logs.length) {
    const rows: ExportRow[] = [['Period', 'Date', 'Project', 'Line', 'Reviewed / Working / Count', 'Found', 'Updated', 'Note']];
    logs.forEach((l) => rows.push([periodOf(new Date(`${l.date}T00:00:00`).getTime()), l.date, names.get(l.projectId) ?? l.projectId, l.line, l.reviewed, l.found, l.updated, l.note]));
    sheets.push({ name: 'REVAMP progress', rows });
  }
  return sheets;
}
