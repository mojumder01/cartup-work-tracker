import { useMemo, useState } from 'react';
import { C } from '../config/dashboard.config';
import { useApp } from '../hooks/AppContext';
import { applyFilters, resolveMonth } from '../utils/filters';
import { byMonth, groupBy, personTable } from '../utils/aggregate';
import { exportCsv, exportXlsx, stamp, type ExportRow } from '../utils/export';
import { fmtNum, fmtPct, fmtSigned, NA } from '../utils/format';
import { monthKeyOf, monthLabel, toMonthKey } from '../utils/parse';
import { useVisibleColumns } from '../components/WorkTable';
import { Card, EmptyState, KpiCard, Segmented } from '../components/ui';
import { ReportBuilder } from '../components/report/ReportBuilder';
import { GovernanceReport } from '../components/report/GovernanceReport';
import { MonthlyReport } from '../components/report/MonthlyReport';
import { CatalogueReport } from '../components/report/CatalogueReport';
import { FilterBar } from '../components/FilterBar';
import { Icon } from '../components/Icon';

interface MonthRow {
  key: string;
  jobs: number;
  sku: number;
  uploadedSku: number | null;
  qcApproved: number | null;
  qcRejected: number | null;
  images: number | null;
}

/** Monthly figures — each metric uses its own month column (Month, Upload Month, QC Approved Month, Image Delivered Month). */
function useMonthly(): MonthRow[] {
  const { dataset, filters } = useApp();
  return useMemo(() => {
    const recs = applyFilters(dataset.records, filters, { ignoreDate: true, ignoreSearch: true });
    const map = new Map<string, MonthRow>();
    const row = (key: string) => {
      let r = map.get(key);
      if (!r)
        map.set(
          key,
          (r = {
            key,
            jobs: 0,
            sku: 0,
            uploadedSku: dataset.has(C.uploadedSku) ? 0 : null,
            qcApproved: dataset.has(C.approvedQc) ? 0 : null,
            qcRejected: dataset.has(C.rejectedQc) ? 0 : null,
            images: dataset.has(C.imageCount) ? 0 : null,
          }),
        );
      return r;
    };
    byMonth(dataset, recs, C.month, C.timestamp, C.skuCount).forEach((g) => {
      const r = row(g.key);
      r.jobs = g.count;
      r.sku = g.sum;
    });
    if (dataset.has(C.uploadedSku)) byMonth(dataset, recs, C.uploadMonth, C.uploadDate, C.uploadedSku).forEach((g) => (row(g.key).uploadedSku = g.sum));
    if (dataset.has(C.approvedQc)) byMonth(dataset, recs, C.qcMonth, C.qcDate, C.approvedQc).forEach((g) => (row(g.key).qcApproved = g.sum));
    if (dataset.has(C.rejectedQc)) byMonth(dataset, recs, C.qcMonth, C.qcDate, C.rejectedQc).forEach((g) => (row(g.key).qcRejected = g.sum));
    if (dataset.has(C.imageCount)) byMonth(dataset, recs, C.imageMonth, C.imageDate, C.imageCount).forEach((g) => (row(g.key).images = g.sum));
    return [...map.values()].sort((a, b) => b.key.localeCompare(a.key));
  }, [dataset, filters]);
}

const delta = (cur: number | null | undefined, prev: number | null | undefined) =>
  cur == null || prev == null ? null : prev === 0 ? null : ((cur - prev) / prev) * 100;

function MonthlyPerformance() {
  const { kpi } = useApp();
  const rows = useMonthly();
  const [sel, setSel] = useState('__current');
  const key = resolveMonth(sel) ?? monthKeyOf(Date.now());
  const cur = rows.find((r) => r.key === key);
  const [y, m] = key.split('-').map(Number);
  const prevKey = monthKeyOf(new Date(y, m - 2, 1).getTime());
  const prev = rows.find((r) => r.key === prevKey);
  const kpiMonth = kpi?.period ? toMonthKey(kpi.period) : null;

  const tile = (label: string, get: (r: MonthRow) => number | null) => {
    const c = cur ? get(cur) : null;
    const d = delta(c, prev ? get(prev) : null);
    return (
      <KpiCard
        label={label}
        value={cur ? fmtNum(c) : NA}
        sub={d === null ? `vs ${monthLabel(prevKey)}: ${NA}` : <>{fmtSigned(d)}% vs {monthLabel(prevKey)}</>}
      />
    );
  };

  const headers = ['Month', 'Jobs (Month)', 'SKU (Month)', 'Uploaded SKU (Upload Month)', 'QC approved (QC Approved Month)', 'QC rejected (QC Approved Month)', 'Image count (Image Delivered Month)'];
  const tableRows: ExportRow[] = rows.map((r) => [monthLabel(r.key), r.jobs, r.sku, r.uploadedSku, r.qcApproved, r.qcRejected, r.images]);

  return (
    <>
      <Card
        title="Monthly Performance"
        subtitle="Each metric uses its own month column · other filters apply, date/month filters do not"
        actions={
          <label className="field" style={{ minWidth: 190 }}>
            <span className="sr-only">Month</span>
            <select className="select" value={sel} onChange={(e) => setSel(e.target.value)}>
              <option value="__current">Current month</option>
              <option value="__previous">Previous month</option>
              {rows.map((r) => (
                <option key={r.key} value={r.key}>
                  {monthLabel(r.key)}
                </option>
              ))}
            </select>
          </label>
        }
      >
        <div className="grid grid-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
          {tile('Total work', (r) => r.jobs)}
          {tile('SKU', (r) => r.sku)}
          {tile('Uploaded SKU', (r) => r.uploadedSku)}
          {tile('QC approved', (r) => r.qcApproved)}
          {tile('Images delivered', (r) => r.images)}
          <KpiCard
            label="KPI achievement"
            value={kpi && kpiMonth === key && kpi.headlinePct != null ? fmtPct(kpi.headlinePct) : NA}
            sub={kpi?.period ? (kpiMonth === key ? 'From KPI & Target tab' : `KPI tab is set to ${kpi.period}`) : 'KPI tab unavailable'}
          />
        </div>
      </Card>
      <Card
        title="Month-by-month"
        bodyClassName=""
        actions={
          <button type="button" className="btn btn-sm" onClick={() => exportCsv(`monthly-performance-${stamp()}.csv`, headers, tableRows)} disabled={!rows.length}>
            <Icon name="download" size={14} /> CSV
          </button>
        }
      >
        {rows.length ? (
          <div className="table-wrap flush" style={{ borderTop: '1px solid var(--border)' }}>
            <table className="data">
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={h} className={i ? 'n' : ''}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} style={r.key === key ? { background: 'var(--accent-soft)' } : undefined}>
                    <td>{monthLabel(r.key)}</td>
                    <td className="n">{fmtNum(r.jobs)}</td>
                    <td className="n">{fmtNum(r.sku)}</td>
                    <td className="n">{fmtNum(r.uploadedSku)}</td>
                    <td className="n">{fmtNum(r.qcApproved)}</td>
                    <td className="n">{fmtNum(r.qcRejected)}</td>
                    <td className="n">{fmtNum(r.images)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState />
        )}
      </Card>
    </>
  );
}

function DataExports() {
  const { dataset, searched, filtered, roleRecords, data, kpi } = useApp();
  const [visible] = useVisibleColumns(dataset);
  const [scope, setScope] = useState<'visible' | 'all'>('visible');
  const [busy, setBusy] = useState(false);
  const cols = scope === 'all' ? dataset.columns : visible;
  const rows = () => searched.map((r) => cols.map((c) => r.values[c]));

  const summaries: { name: string; build: () => [string[], ExportRow[]] }[] = [
    { name: 'Status summary', build: () => [['Status', 'Jobs'], groupBy(filtered, C.status, undefined, true).map((g) => [g.key, g.count])] },
    { name: 'Task type summary', build: () => [['Task Type', 'Jobs', 'Number of SKU'], groupBy(filtered, C.taskType, C.skuCount).map((g) => [g.key, g.count, g.sum])] },
    ...[C.uploadedBy, C.qcBy, C.visualEditor].filter((c) => dataset.has(c)).map((role) => ({
      name: `${role} summary`,
      build: (): [string[], ExportRow[]] => [
        [role, 'Jobs', 'Number of SKU', 'Uploaded SKU', 'Rejected SKU', 'Approved QC', 'Rejected QC', 'Image count', 'Edited (By Hand)', 'Edited (By AI)'],
        personTable(roleRecords(role), role).map((p) => [p.name, p.jobs, p.sku, p.uploadedSku, p.rejectedSku, p.approvedQc, p.rejectedQc, p.images, p.manual, p.ai]),
      ],
    })),
  ];
  if (kpi) {
    summaries.push({
      name: 'KPI & Target',
      build: () => [
        ['Team', 'Employee', 'Metric', 'Target', 'Actual', 'Achievement %', 'Gap'],
        kpi.sections.flatMap((s) =>
          s.employees.flatMap((e) => e.metrics.map((m) => [s.title, e.name, m.label, m.target, m.actual, m.pct === null ? 'N/A' : Number(m.pct.toFixed(2)), m.gap])),
        ),
      ],
    });
  }

  return (
    <>
      <FilterBar showRecordsLink={false} />
      <Card title="Export filtered data" subtitle={`${fmtNum(searched.length)} Work Sheet rows match the current filters and search. Exports never include columns excluded at sync time.`}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <label className="field" style={{ minWidth: 220 }}>
            <span>Columns</span>
            <select className="select" value={scope} onChange={(e) => setScope(e.target.value as 'visible' | 'all')}>
              <option value="visible">Visible table columns ({visible.length})</option>
              <option value="all">All columns ({dataset.columns.length})</option>
            </select>
          </label>
          <button type="button" className="btn btn-primary" style={{ alignSelf: 'end' }} disabled={!searched.length} onClick={() => exportCsv(`cartup-work-${stamp()}.csv`, cols, rows())}>
            <Icon name="download" size={16} /> Export CSV
          </button>
          <button
            type="button"
            className="btn"
            style={{ alignSelf: 'end' }}
            disabled={!searched.length || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await exportXlsx(`cartup-work-${stamp()}.xlsx`, data.work.sheet, cols, rows());
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="download" size={16} /> {busy ? 'Preparing…' : 'Export Excel'}
          </button>
        </div>
      </Card>

      <MonthlyPerformance />

      <Card title="Summary reports" subtitle="Aggregates of the current filters, as CSV">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {summaries.map((s) => (
            <button
              key={s.name}
              type="button"
              className="btn btn-sm"
              onClick={() => {
                const [h, r] = s.build();
                exportCsv(`${s.name.toLowerCase().replace(/\W+/g, '-')}-${stamp()}.csv`, h, r);
              }}
            >
              <Icon name="download" size={14} /> {s.name}
            </button>
          ))}
        </div>
      </Card>
    </>
  );
}

type ReportTab = 'individual' | 'monthly' | 'catalogue' | 'governance' | 'exports';

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>(() => {
    try {
      return (localStorage.getItem('cartup.reportTab') as ReportTab) || 'individual';
    } catch {
      return 'individual';
    }
  });
  const choose = (t: ReportTab) => {
    setTab(t);
    try {
      localStorage.setItem('cartup.reportTab', t);
    } catch {
      /* ignore */
    }
  };
  return (
    <>
      <div>
        <Segmented
          label="Report"
          value={tab}
          onChange={choose}
          options={[
            { id: 'individual', label: 'Individual Summary' },
            { id: 'monthly', label: 'Monthly Report' },
            { id: 'catalogue', label: 'Daily / Monthly Performance' },
            { id: 'governance', label: 'Product Governance' },
            { id: 'exports', label: 'Data exports' },
          ]}
        />
      </div>
      {tab === 'individual' && <ReportBuilder />}
      {tab === 'monthly' && <MonthlyReport />}
      {tab === 'catalogue' && <CatalogueReport />}
      {tab === 'governance' && <GovernanceReport />}
      {tab === 'exports' && <DataExports />}
    </>
  );
}
