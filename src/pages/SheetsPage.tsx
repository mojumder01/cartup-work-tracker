/**
 * All Sheets: a read-only preview of every tab the sync publishes (Work Sheet, Seller QC, KPI &
 * Target, Governance, Catalogue Performance, extra sources), plus data checks on the Work Sheet.
 */
import { useMemo, useState } from 'react';
import { useApp } from '../hooks/AppContext';
import type { CellValue, DashboardData } from '../types';
import { exportXlsx, stamp, type ExportRow } from '../utils/export';
import { fmtNum } from '../utils/format';
import { Card } from '../components/ui';
import { Icon } from '../components/Icon';

const PAGE = 100;

interface Sheet {
  id: string;
  group: string;
  label: string;
  columns: string[];
  rows: CellValue[][];
  /** Report-style tab (cells as laid out in the sheet, columns A, B, C…). */
  grid?: boolean;
}

const colName = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const show = (v: CellValue) => (v === null || v === undefined ? '' : typeof v === 'number' ? (Number.isInteger(v) ? fmtNum(v) : String(Math.round(v * 100) / 100)) : String(v));

function listSheets(data: DashboardData): Sheet[] {
  const out: Sheet[] = [];
  const flat = (id: string, group: string, t: { sheet: string; columns: string[]; rows: CellValue[][] } | null | undefined, label?: string) => {
    if (t?.columns?.length) out.push({ id, group, label: label ?? t.sheet, columns: t.columns, rows: t.rows });
  };
  const grid = (id: string, group: string, t: { sheet: string; values: CellValue[][]; formatted?: CellValue[][] } | null | undefined) => {
    if (!t?.values?.length) return;
    const rows = t.values.map((r, i) => r.map((v, j) => t.formatted?.[i]?.[j] ?? v));
    const width = Math.max(...rows.map((r) => r.length));
    // Drop trailing empty rows.
    while (rows.length && rows[rows.length - 1].every((v) => v === null || v === '')) rows.pop();
    out.push({ id, group, label: t.sheet, columns: Array.from({ length: width }, (_, i) => colName(i)), rows, grid: true });
  };
  const main = data.source.spreadsheetTitle || 'Content Work Tracker';
  flat('work', main, data.work);
  grid('kpi', main, data.kpi);
  grid('target', main, data.target);
  flat('sellerQc', main, data.sellerQc);
  flat('team', main, data.team);
  const gov = data.governance;
  if (gov) {
    flat('gov-adhoc', gov.spreadsheetTitle, gov.adhoc);
    flat('gov-projects', gov.spreadsheetTitle, gov.projects);
    flat('gov-progress', gov.spreadsheetTitle, gov.progress);
  }
  const perf = data.performance;
  if (perf) {
    grid('perf-monthly', perf.spreadsheetTitle, perf.monthly);
    grid('perf-daily', perf.spreadsheetTitle, perf.daily);
    grid('perf-kpi', perf.spreadsheetTitle, perf.kpi);
    flat('perf-team', perf.spreadsheetTitle, perf.team);
    flat('perf-commercial', perf.spreadsheetTitle, perf.commercial);
    flat('perf-retail', perf.spreadsheetTitle, perf.retail);
  }
  for (const [k, t] of Object.entries(data.extra ?? {})) flat(`extra-${k}`, t?.spreadsheetTitle ?? 'Other sheets', t, t ? `${t.label} (${t.sheet})` : undefined);
  return out;
}

/** Work Sheet problems worth fixing in Google Sheets (the dashboard shows the data as it is). */
function useChecks(data: DashboardData) {
  return useMemo(() => {
    const { columns, rows } = data.work;
    const ix = (n: string) => columns.indexOf(n);
    const t = (v: CellValue) => (v === null || v === undefined ? '' : String(v).trim());
    const id = ix('JOB ID');
    const realCols = ['Timestamp', 'Task Type', 'Shop Name', 'Number of SKU'].map(ix).filter((i) => i >= 0);
    const placeholders = rows.filter((r) => realCols.every((i) => t(r[i]) === '')).length;
    const byId = new Map<string, CellValue[][]>();
    if (id >= 0) for (const r of rows) if (t(r[id])) byId.set(t(r[id]), [...(byId.get(t(r[id])) ?? []), r]);
    const shop = ix('Shop Name');
    const duplicates = [...byId.entries()].filter(([, v]) => v.length > 1).map(([k, v]) => ({ id: k, count: v.length, shop: shop >= 0 ? t(v[0][shop]) : '' }));
    const thisYear = new Date().getFullYear();
    const dateCols = columns.filter((c) => /date|timestamp/i.test(c));
    const badDates: { id: string; column: string; value: string }[] = [];
    for (const r of rows) {
      for (const c of dateCols) {
        const v = t(r[ix(c)]);
        const y = /^\d{4}-\d{2}-\d{2}/.test(v) ? Number(v.slice(0, 4)) : null;
        if (y !== null && (y < 2020 || y > thisYear + 1)) badDates.push({ id: id >= 0 ? t(r[id]) : '', column: c, value: v.slice(0, 10) });
      }
    }
    return { placeholders, duplicates, badDates };
  }, [data]);
}

export default function SheetsPage() {
  const { data } = useApp();
  const sheets = useMemo(() => listSheets(data), [data]);
  const [pick, setPick] = useState(() => {
    try {
      return localStorage.getItem('cartup.sheetPreview') ?? 'work';
    } catch {
      return 'work';
    }
  });
  const sheet = sheets.find((s) => s.id === pick) ?? sheets[0];
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [page, setPage] = useState(0);
  const checks = useChecks(data);
  const [openCheck, setOpenCheck] = useState<'dup' | 'date' | null>(null);

  const choose = (id: string) => {
    setPick(id);
    setQ('');
    setSort(null);
    setPage(0);
    try {
      localStorage.setItem('cartup.sheetPreview', id);
    } catch {
      /* ignore */
    }
  };

  const rows = useMemo(() => {
    if (!sheet) return [];
    const needle = q.trim().toLowerCase();
    let r = needle ? sheet.rows.filter((row) => row.some((v) => v !== null && String(v).toLowerCase().includes(needle))) : sheet.rows;
    if (sort && !sheet.grid) {
      const { col, dir } = sort;
      r = [...r].sort((a, b) => {
        const x = a[col];
        const y = b[col];
        if (x === y) return 0;
        if (x === null || x === '') return 1;
        if (y === null || y === '') return -1;
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * dir;
      });
    }
    return r;
  }, [sheet, q, sort]);

  if (!sheet) return <Card title="All Sheets">No sheets have been synced yet.</Card>;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const shown = rows.slice(cur * PAGE, cur * PAGE + PAGE);
  const groups = [...new Set(sheets.map((s) => s.group))];
  const download = () =>
    exportXlsx(`${sheet.label.replace(/[^\w-]+/g, '-')}-${stamp()}.xlsx`, sheet.label, sheet.columns, rows.map((r) => sheet.columns.map((_, i) => r[i] ?? null)) as ExportRow[]);

  return (
    <>
      <Card title="Data checks" subtitle={`“${data.work.sheet}” · things to fix in Google Sheets — the dashboard shows the data exactly as it is`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5 }}>
          <div>
            ✓ <b>{fmtNum(data.work.rows.length)}</b> rows synced · <b>{fmtNum(data.work.rows.length - checks.placeholders)}</b> jobs
            {checks.placeholders > 0 && <span className="muted"> · {fmtNum(checks.placeholders)} empty rows with only a JOB ID (not counted as jobs)</span>}
          </div>
          <div>
            {checks.duplicates.length ? '⚠' : '✓'} <b>{checks.duplicates.length}</b> JOB IDs used on more than one row
            {checks.duplicates.length > 0 && (
              <>
                {' '}
                ({fmtNum(checks.duplicates.reduce((a, d) => a + d.count - 1, 0))} extra rows; all are counted, the Job desk updates the first one){' '}
                <button type="button" className="rb-link" onClick={() => setOpenCheck(openCheck === 'dup' ? null : 'dup')}>
                  {openCheck === 'dup' ? 'hide' : 'show'}
                </button>
              </>
            )}
          </div>
          {openCheck === 'dup' && (
            <div className="muted" style={{ paddingLeft: 18 }}>
              {checks.duplicates.map((d) => `${d.id} ×${d.count}${d.shop ? ` (${d.shop})` : ''}`).join(' · ')}
            </div>
          )}
          <div>
            {checks.badDates.length ? '⚠' : '✓'} <b>{checks.badDates.length}</b> impossible dates (before 2020 or far in the future)
            {checks.badDates.length > 0 && (
              <>
                {' '}
                — they show up as odd months (e.g. “January 1970”) in monthly views{' '}
                <button type="button" className="rb-link" onClick={() => setOpenCheck(openCheck === 'date' ? null : 'date')}>
                  {openCheck === 'date' ? 'hide' : 'show'}
                </button>
              </>
            )}
          </div>
          {openCheck === 'date' && (
            <div className="muted" style={{ paddingLeft: 18 }}>
              {checks.badDates.map((d) => `${d.id}: ${d.column} = ${d.value}`).join(' · ')}
            </div>
          )}
        </div>
      </Card>

      <Card
        title="All Sheets"
        subtitle={`${sheet.group} → “${sheet.label}” · ${fmtNum(sheet.rows.length)} rows × ${sheet.columns.length} columns${q ? ` · ${fmtNum(rows.length)} match` : ''} · as of the last sync`}
        actions={
          <button type="button" className="btn btn-sm" onClick={download} disabled={!rows.length}>
            <Icon name="download" size={14} /> Excel
          </button>
        }
      >
        <div className="filter-row" style={{ marginBottom: 10 }}>
          <label className="field">
            <span>Sheet</span>
            <select className="select" value={sheet.id} onChange={(e) => choose(e.target.value)} style={{ minWidth: 280 }}>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {sheets
                    .filter((s) => s.group === g)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} ({fmtNum(s.rows.length)})
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Search</span>
            <input
              className={`input ${q ? 'is-set' : ''}`}
              value={q}
              placeholder="Any value in the sheet…"
              onChange={(e) => {
                setQ(e.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th className="n">#</th>
                {sheet.columns.map((c, i) => (
                  <th key={i}>
                    {sheet.grid ? (
                      c
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSort(sort?.col === i ? (sort.dir === 1 ? { col: i, dir: -1 } : null) : { col: i, dir: 1 });
                          setPage(0);
                        }}
                        title="Sort"
                      >
                        {c}
                        {sort?.col === i ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, ri) => (
                <tr key={cur * PAGE + ri}>
                  <td className="n muted">{sheet.grid ? sheet.rows.indexOf(r) + 1 : cur * PAGE + ri + 1}</td>
                  {sheet.columns.map((_, i) => {
                    const v = r[i];
                    const s = show(v ?? null);
                    return (
                      <td key={i} className={typeof v === 'number' ? 'n' : undefined}>
                        {/^https?:\/\//i.test(s) ? (
                          <a href={s} target="_blank" rel="noopener noreferrer">
                            Open ↗
                          </a>
                        ) : s.length > 60 ? (
                          <span className="cell-trunc" title={s}>
                            {s}
                          </span>
                        ) : (
                          s
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={sheet.columns.length + 1} className="muted">
                    No rows{q ? ' match the search' : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="pager">
          <span>
            Rows {fmtNum(rows.length ? cur * PAGE + 1 : 0)}–{fmtNum(Math.min(rows.length, cur * PAGE + PAGE))} of {fmtNum(rows.length)} · page {cur + 1} / {pages}
          </span>
          <span className="spacer" />
          <button type="button" className="btn btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page">
            <Icon name="chevronLeft" size={14} />
          </button>
          <button type="button" className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page">
            <Icon name="chevronRight" size={14} />
          </button>
        </div>
      </Card>
    </>
  );
}
