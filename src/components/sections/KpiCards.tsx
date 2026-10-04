import { memo, useMemo } from 'react';
import { dashboardConfig, C } from '../../config/dashboard.config';
import { useApp } from '../../hooks/AppContext';
import { summarize } from '../../utils/aggregate';
import { fmtCompact, fmtNum, fmtPct, ratioPct, NA } from '../../utils/format';
import { KpiCard } from '../ui';
import { headlineSub, headlineTitle } from './KpiSections';

/** The eight headline tiles. Clicking a tile drills into the matching Work Sheet records. */
export const KpiCards = memo(function KpiCards() {
  const { dataset, roleFiltered, kpi, setDrill, navigate } = useApp();
  // With an Employee chosen: upload tiles = jobs they uploaded, QC tiles = jobs they QC'd.
  const s = useMemo(() => summarize(dataset, roleFiltered(C.uploadedBy)), [dataset, roleFiltered]);
  const q = useMemo(() => summarize(dataset, roleFiltered(C.qcBy)), [dataset, roleFiltered]);
  const g = dashboardConfig.statusGroups;
  const drillStatus = (label: string, values: string[]) =>
    dataset.has(C.status) ? () => setDrill({ label: `${label} (${C.status}: ${values.join(', ')})`, column: C.status, op: 'in', values }, 'work') : undefined;
  const drillGt0 = (column: string) => (dataset.has(column) ? () => setDrill({ label: `${column} > 0`, column, op: 'gt0' }, 'work') : undefined);

  return (
    <div className="grid grid-kpi">
      <KpiCard
        label="Total Work"
        value={fmtCompact(s.totalWork)}
        sub={<>jobs in current filters</>}
        color="var(--series-1)"
        onClick={() => setDrill(null, 'work')}
        title={`${fmtNum(s.totalWork)} jobs`}
      />
      <KpiCard
        label="Completed"
        value={fmtCompact(s.completed)}
        sub={s.completed === null ? `"${C.status}" column missing` : <><b>{fmtPct(ratioPct(s.completed, s.totalWork))}</b> of jobs · {g.completed.join(', ')}</>}
        color="var(--good)"
        onClick={drillStatus('Completed', g.completed)}
      />
      <KpiCard
        label="Pending"
        value={fmtCompact(s.pending)}
        sub={s.pending === null ? `"${C.status}" column missing` : <>{g.pending.join(' + ')}</>}
        color="var(--series-4)"
        onClick={drillStatus('Pending', g.pending)}
      />
      <KpiCard label="Total SKU" value={fmtCompact(s.totalSku)} sub={s.totalSku === null ? `"${C.skuCount}" missing` : C.skuCount} color="var(--series-7)" onClick={() => navigate('work')} title={fmtNum(s.totalSku)} />
      <KpiCard
        label="Uploaded SKU"
        value={fmtCompact(s.uploadedSku)}
        sub={s.uploadedSku === null ? `"${C.uploadedSku}" missing` : <><b>{fmtPct(s.uploadRate)}</b> of total SKU · {fmtCompact(s.rejectedSku)} rejected</>}
        color="var(--series-3)"
        onClick={drillGt0(C.uploadedSku)}
        title={fmtNum(s.uploadedSku)}
      />
      <KpiCard
        label="QC Approved"
        value={fmtCompact(q.approvedQc)}
        sub={q.approvedQc === null ? `"${C.approvedQc}" missing` : <>Approval rate <b>{fmtPct(q.qcApprovalRate)}</b></>}
        color="var(--series-7)"
        onClick={drillGt0(C.approvedQc)}
        title={fmtNum(q.approvedQc)}
      />
      <KpiCard
        label="QC Rejected"
        value={fmtCompact(q.rejectedQc)}
        sub={q.rejectedQc === null ? `"${C.rejectedQc}" missing` : <>{fmtPct(q.qcApprovalRate === null ? null : 100 - q.qcApprovalRate)} of QC’d SKU</>}
        color="var(--bad)"
        onClick={drillGt0(C.rejectedQc)}
        title={fmtNum(q.rejectedQc)}
      />
      <KpiCard
        label="KPI Achievement %"
        value={kpi?.headlinePct != null ? fmtPct(kpi.headlinePct) : NA}
        sub={headlineSub(kpi)}
        color="var(--series-2)"
        onClick={() => navigate('kpi')}
        title={headlineTitle(kpi) || 'Open KPI & Target'}
      />
    </div>
  );
});
