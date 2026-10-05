import { memo, useMemo, useState } from 'react';
import { dashboardConfig, C } from '../../config/dashboard.config';
import { useApp } from '../../hooks/AppContext';
import { BarList } from '../../charts/BarList';
import { SplitBar } from '../../charts/SplitBar';
import { TrendChart } from '../../charts/TrendChart';
import { statusColor } from '../../charts/palette';
import { distinct, groupBy, medianTurnaroundDays, personTable, summarize, timeSeries, type Granularity } from '../../utils/aggregate';
import { fmtDate, fmtNum, fmtPct, NA } from '../../utils/format';
import { monthLabel, monthShort } from '../../utils/parse';
import type { Dataset, WorkRecord } from '../../types';
import { Card, EmptyState, Segmented, Stat } from '../ui';

const days = (d: number | null) => (d === null ? NA : `${d.toFixed(1).replace(/\.0$/, '')} days`);
const sla = (ds: Dataset, records: WorkRecord[], col: string) => (ds.has(col) ? distinct(records, col).join(', ') || NA : NA);

const GRANULARITY: { id: Granularity; label: string }[] = [
  { id: 'day', label: 'Daily' },
  { id: 'week', label: 'Weekly' },
  { id: 'month', label: 'Monthly' },
];

const ROLE_OF_DATE: Record<string, string> = { [C.uploadDate]: C.uploadedBy, [C.qcDate]: C.qcBy, [C.imageDate]: C.visualEditor };

/** Time-series card with daily / weekly / monthly granularity. */
function TrendCard({ title, dateCol, sumCol, valueLabel, color, span = true }: { title: string; dateCol: string; sumCol: string; valueLabel: string; color: string; span?: boolean }) {
  const { dataset, filtered: all, roleFiltered } = useApp();
  // Employee filter: the person's own work for this trend (uploads / QC / images by the date's role).
  const filtered = ROLE_OF_DATE[dateCol] ? roleFiltered(ROLE_OF_DATE[dateCol]) : all;
  const [g, setG] = useState<Granularity>('week');
  const data = useMemo(() => {
    const series = timeSeries(filtered, dateCol, g, sumCol);
    const recent = g === 'day' ? series.slice(-90) : g === 'week' ? series.slice(-52) : series;
    return recent.map((p) => ({
      label: g === 'month' ? monthShort(p.key) : new Date(p.ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      title: g === 'month' ? monthLabel(p.key) : g === 'week' ? `Week of ${fmtDate(p.ms)}` : fmtDate(p.ms),
      value: p.sum,
    }));
  }, [filtered, dateCol, sumCol, g]);
  const ok = dataset.has(dateCol) && dataset.has(sumCol);
  return (
    <Card
      title={title}
      subtitle={`${valueLabel} by ${dateCol}${g === 'day' ? ' · last 90 days shown' : g === 'week' ? ' · last 52 weeks shown' : ''}`}
      className={span ? 'span-2' : ''}
      actions={<Segmented label="Granularity" value={g} onChange={setG} options={GRANULARITY} />}
    >
      {!ok ? <EmptyState title="N/A" message={`"${dateCol}" or "${sumCol}" column not found.`} small /> : data.length ? <TrendChart data={data} valueLabel={valueLabel} color={color} /> : <EmptyState small />}
    </Card>
  );
}

function PersonBars({ title, subtitle, role, sumCol, valueHeader, color }: { title: string; subtitle: string; role: string; sumCol?: string; valueHeader: string; color: string }) {
  const { dataset, roleRecords, openPerson } = useApp();
  const groups = useMemo(() => groupBy(roleRecords(role), role, sumCol), [roleRecords, role, sumCol]);
  if (!dataset.has(role)) {
    return (
      <Card title={title}>
        <EmptyState title="N/A" message={`The "${role}" column was not found.`} small />
      </Card>
    );
  }
  const items = groups.map((g) => (sumCol ? { key: g.key, value: g.sum, secondary: g.count } : { key: g.key, value: g.count })).sort((a, b) => b.value - a.value);
  return (
    <Card title={title} subtitle={`${subtitle} · finished work only · click a name for details`}>
      {items.length ? (
        <BarList labelHeader={role} valueHeader={valueHeader} secondaryHeader={sumCol ? 'Jobs' : undefined} items={items} onSelect={openPerson} color={color} limit={10} />
      ) : (
        <EmptyState small />
      )}
    </Card>
  );
}

function StatusBars({ title, column, role }: { title: string; column: string; role?: string }) {
  const { dataset, filtered: all, roleRecords, filters, setDim } = useApp();
  // role: count that role's finished work only (e.g. uploaded jobs on the Upload page).
  const filtered = role ? roleRecords(role) : all;
  const groups = useMemo(() => groupBy(filtered, column), [filtered, column]);
  if (!dataset.has(column)) {
    return (
      <Card title={title}>
        <EmptyState title="N/A" message={`The "${column}" column was not found.`} small />
      </Card>
    );
  }
  return (
    <Card title={title} subtitle={`${role === C.uploadedBy ? 'Uploaded jobs' : 'Jobs'} by ${column} · click to filter`}>
      {groups.length ? (
        <BarList
          labelHeader={column}
          valueHeader="Jobs"
          showShare
          items={groups.map((g) => ({ key: g.key, value: g.count, color: statusColor(g.key) }))}
          activeKey={filters.dims[column]}
          onSelect={(k) => setDim(column, filters.dims[column] === k ? '' : k)}
        />
      ) : (
        <EmptyState small />
      )}
    </Card>
  );
}

/* ---------------- Upload ---------------- */

export const UploadSummaryCard = memo(function UploadSummaryCard({ compact }: { compact?: boolean }) {
  const { dataset, roleRecords } = useApp();
  // Finished uploads (Status Done) dated by Upload Month / Upload date — same rows as "Uploads by person".
  const filtered = roleRecords(C.uploadedBy);
  const s = useMemo(() => summarize(dataset, filtered), [dataset, filtered]);
  const tat = useMemo(() => medianTurnaroundDays(filtered, C.timestamp, C.uploadDate), [filtered]);
  return (
    <Card title="Upload Performance" subtitle={`Finished uploads · SLA: ${sla(dataset, filtered, C.uploadSla)}`}>
      <div className="stats">
        <Stat label="Uploaded SKU" value={fmtNum(s.uploadedSku)} />
        <Stat label="Upload jobs (sellers)" value={fmtNum(filtered.length)} />
        <Stat label="Upload rate (of total SKU)" value={fmtPct(s.uploadRate)} />
        <Stat label="Rejected SKU" value={fmtNum(s.rejectedSku)} />
        {!compact && <Stat label="SKU rejection rate" value={fmtPct(s.skuRejectionRate)} />}
        {!compact && <Stat label="Median request → upload" value={days(tat)} />}
      </div>
    </Card>
  );
});

export function UploadDetail() {
  return (
    <>
      <div className="grid grid-2">
        <UploadSummaryCard />
        <PersonBars title="Uploads by person" subtitle="Uploaded SKU Count by Uploaded by" role={C.uploadedBy} sumCol={C.uploadedSku} valueHeader="Uploaded SKU" color="var(--series-3)" />
      </div>
      <div className="grid grid-2">
        <TrendCard title="Upload trend" dateCol={C.uploadDate} sumCol={C.uploadedSku} valueLabel="Uploaded SKU" color="var(--series-3)" />
      </div>
      <div className="grid grid-2">
        <StatusBars title="File Type" column={C.fileType} role={C.uploadedBy} />
        <StatusBars title="Seller Status (After QC)" column="Seller Status (After QC)" role={C.uploadedBy} />
      </div>
    </>
  );
}

/* ---------------- QC ---------------- */

export const QcSummaryCard = memo(function QcSummaryCard({ compact }: { compact?: boolean }) {
  const { dataset, roleRecords, setDrill } = useApp();
  // Finished QC dated by QC approved date — same rows as "QC by person".
  const filtered = roleRecords(C.qcBy);
  const s = useMemo(() => summarize(dataset, filtered), [dataset, filtered]);
  const tat = useMemo(() => medianTurnaroundDays(filtered, C.uploadDate, C.qcDate), [filtered]);
  return (
    <Card
      title="QC Performance"
      subtitle={`Finished QC · SLA: ${sla(dataset, filtered, C.qcSla)}`}
      actions={
        dataset.has(C.rejectedQc) && (
          <button type="button" className="btn btn-sm" onClick={() => setDrill({ label: `${C.rejectedQc} > 0`, column: C.rejectedQc, op: 'gt0' }, 'work')}>
            View QC rejected
          </button>
        )
      }
    >
      <div className="stats">
        <Stat label={`QC completed (${dashboardConfig.qcDoneValues.join(', ')})`} value={fmtNum(s.qcDone)} />
        <Stat label="Approved QC Count" value={fmtNum(s.approvedQc)} />
        <Stat label="Rejected QC Count" value={fmtNum(s.rejectedQc)} />
        <Stat label="QC approval rate" value={fmtPct(s.qcApprovalRate)} />
        {!compact && <Stat label="Median upload → QC approved" value={days(tat)} />}
      </div>
    </Card>
  );
});

export function QcDetail() {
  return (
    <>
      <div className="grid grid-2">
        <QcSummaryCard />
        <StatusBars title="QC Status" column={C.qcStatus} />
      </div>
      <div className="grid grid-2">
        <TrendCard title="QC approved trend" dateCol={C.qcDate} sumCol={C.approvedQc} valueLabel="Approved QC Count" color="var(--series-7)" />
      </div>
      <div className="grid grid-2">
        <PersonBars title="QC by person" subtitle="Approved QC Count by QC By" role={C.qcBy} sumCol={C.approvedQc} valueHeader="Approved" color="var(--series-7)" />
        <PersonBars title="QC rejections by person" subtitle="Rejected QC Count by QC By" role={C.qcBy} sumCol={C.rejectedQc} valueHeader="Rejected" color="var(--bad)" />
      </div>
    </>
  );
}

/* ---------------- Visual / Image ---------------- */

export const VisualSummaryCard = memo(function VisualSummaryCard({ compact }: { compact?: boolean }) {
  const { dataset, roleRecords } = useApp();
  // Delivered images dated by Image Delivered Date — same rows as "Images by visual editor".
  const filtered = roleRecords(C.visualEditor);
  const s = useMemo(() => summarize(dataset, filtered), [dataset, filtered]);
  const tat = useMemo(() => medianTurnaroundDays(filtered, C.timestamp, C.imageDate), [filtered]);
  return (
    <Card title="Visual / Image Performance" subtitle={`Delivered work · SLA: ${sla(dataset, filtered, C.visualSla)}`}>
      <div className="stats">
        <Stat label="Image-related jobs" value={fmtNum(s.imageJobs)} />
        <Stat label="Image count" value={fmtNum(s.imageCount)} />
        <Stat label={`Jobs ${dashboardConfig.imageDeliveredValues.join('/')}`} value={fmtNum(s.imagesDelivered)} />
        <Stat label="Edited by AI" value={fmtNum(s.ai?.value)} />
        <Stat label="Edited by hand" value={fmtNum(s.manual?.value)} />
        {!compact && <Stat label="Median request → delivered" value={days(tat)} />}
      </div>
    </Card>
  );
});

export const AiManualCard = memo(function AiManualCard() {
  const { dataset, roleRecords } = useApp();
  const filtered = roleRecords(C.visualEditor);
  const s = useMemo(() => summarize(dataset, filtered), [dataset, filtered]);
  if (!s.ai && !s.manual) {
    return (
      <Card title="AI vs Manual Editing">
        <EmptyState title="N/A" message={`"${C.editedByAi}" and "${C.editedByHand}" columns were not found.`} small />
      </Card>
    );
  }
  const unit = (m: typeof s.ai) => (m ? (m.mode === 'sum' ? 'images (sum of counts)' : 'jobs marked Yes') : 'column missing');
  const total = (s.ai?.value ?? 0) + (s.manual?.value ?? 0);
  return (
    <Card title="AI vs Manual Editing" subtitle={`${C.editedByHand}: ${unit(s.manual)} · ${C.editedByAi}: ${unit(s.ai)}`}>
      <div className="stats" style={{ marginBottom: 16 }}>
        <Stat label="Manual edited" value={fmtNum(s.manual?.value)} />
        <Stat label="AI edited" value={fmtNum(s.ai?.value)} />
        <Stat label="Total edited" value={s.ai && s.manual ? fmtNum(total) : NA} />
        <Stat label="AI contribution" value={fmtPct(s.aiShare)} />
      </div>
      <SplitBar
        parts={[
          { label: 'Manual', value: s.manual?.value ?? 0, color: 'var(--series-1)' },
          { label: 'AI', value: s.ai?.value ?? 0, color: 'var(--series-2)' },
        ]}
      />
    </Card>
  );
});

function EditorTable() {
  const { dataset, roleRecords, openPerson } = useApp();
  const rows = useMemo(() => personTable(roleRecords(C.visualEditor), C.visualEditor), [roleRecords]);
  if (!dataset.has(C.visualEditor)) return null;
  return (
    <Card title="Visual editor breakdown" subtitle="Delivered jobs, images and editing mode per editor (by Image Delivered Date)" bodyClassName="">
      {rows.length ? (
        <div className="table-wrap flush">
          <table className="data">
            <thead>
              <tr>
                <th>{C.visualEditor}</th>
                <th className="n">Jobs</th>
                <th className="n">{C.imageCount}</th>
                <th className="n">{C.editedByHand}</th>
                <th className="n">{C.editedByAi}</th>
                <th className="n">AI share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="clickable" onClick={() => openPerson(r.name)}>
                  <td>{r.name}</td>
                  <td className="n">{fmtNum(r.jobs)}</td>
                  <td className="n">{fmtNum(r.images)}</td>
                  <td className="n">{fmtNum(r.manual)}</td>
                  <td className="n">{fmtNum(r.ai)}</td>
                  <td className="n">{fmtPct(r.ai + r.manual > 0 ? (r.ai / (r.ai + r.manual)) * 100 : null)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState small />
      )}
    </Card>
  );
}

export function VisualDetail() {
  return (
    <>
      <div className="grid grid-2">
        <VisualSummaryCard />
        <AiManualCard />
      </div>
      <div className="grid grid-2">
        <TrendCard title="Image delivery trend" dateCol={C.imageDate} sumCol={C.imageCount} valueLabel="Image count" color="var(--series-2)" />
      </div>
      <div className="grid grid-2">
        <PersonBars title="Images by visual editor" subtitle="Image count by Visual editor" role={C.visualEditor} sumCol={C.imageCount} valueHeader="Images" color="var(--series-2)" />
        <StatusBars title="Image Status" column={C.imageStatus} />
      </div>
      <div className="grid grid-2">
        <EditorTable />
        <StatusBars title="Image Source" column={C.imageSource} />
      </div>
    </>
  );
}
