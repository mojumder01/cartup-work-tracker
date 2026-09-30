import { memo, useMemo, useState } from 'react';
import { C } from '../../config/dashboard.config';
import { useApp } from '../../hooks/AppContext';
import { BarList } from '../../charts/BarList';
import { TrendChart } from '../../charts/TrendChart';
import { statusColor } from '../../charts/palette';
import { byMonth, groupBy } from '../../utils/aggregate';
import { monthLabel, monthShort } from '../../utils/parse';
import { Card, EmptyState, Segmented } from '../ui';

/** Toggle a dimension filter from a chart click. */
function useToggleDim() {
  const { filters, setDim } = useApp();
  return (column: string, key: string) => setDim(column, filters.dims[column] === key ? '' : key);
}

export const WorkStatusCard = memo(function WorkStatusCard() {
  const { dataset, filtered, filters } = useApp();
  const toggle = useToggleDim();
  const groups = useMemo(() => groupBy(filtered, C.status, undefined, true), [filtered]);
  if (!dataset.has(C.status)) {
    return (
      <Card title="Work Status">
        <EmptyState title="N/A" message={`The "${C.status}" column was not found in the Work Sheet.`} small />
      </Card>
    );
  }
  return (
    <Card title="Work Status" subtitle="Jobs by Status · click a row to filter">
      {groups.length ? (
        <BarList
          labelHeader="Status"
          valueHeader="Jobs"
          showShare
          items={groups.map((g) => ({ key: g.key, value: g.count, color: statusColor(g.key) }))}
          activeKey={filters.dims[C.status]}
          onSelect={(k) => toggle(C.status, k)}
        />
      ) : (
        <EmptyState small />
      )}
    </Card>
  );
});

export const TaskTypeCard = memo(function TaskTypeCard() {
  const { dataset, filtered, filters } = useApp();
  const toggle = useToggleDim();
  const [metric, setMetric] = useState<'jobs' | 'sku'>('jobs');
  const groups = useMemo(() => groupBy(filtered, C.taskType, C.skuCount), [filtered]);
  if (!dataset.has(C.taskType)) {
    return (
      <Card title="Task Type">
        <EmptyState title="N/A" message={`The "${C.taskType}" column was not found.`} small />
      </Card>
    );
  }
  const items = groups
    .map((g) => (metric === 'jobs' ? { key: g.key, value: g.count, secondary: g.sum } : { key: g.key, value: g.sum, secondary: g.count }))
    .sort((a, b) => b.value - a.value);
  return (
    <Card
      title="Task Type"
      subtitle="Jobs and SKUs per task type"
      actions={
        <Segmented
          label="Measure"
          value={metric}
          onChange={setMetric}
          options={[
            { id: 'jobs', label: 'Jobs' },
            { id: 'sku', label: 'SKU' },
          ]}
        />
      }
    >
      {items.length ? (
        <BarList
          labelHeader="Task Type"
          valueHeader={metric === 'jobs' ? 'Jobs' : 'SKU'}
          secondaryHeader={metric === 'jobs' ? 'SKU' : 'Jobs'}
          items={items}
          activeKey={filters.dims[C.taskType]}
          onSelect={(k) => toggle(C.taskType, k)}
          color="var(--series-7)"
        />
      ) : (
        <EmptyState small />
      )}
    </Card>
  );
});

type TrendMetric = 'jobs' | 'sku' | 'uploaded' | 'qc' | 'images';

const TREND_METRICS: Record<TrendMetric, { label: string; monthCol: string; dateCol: string; sumCol?: string; color: string }> = {
  jobs: { label: 'Jobs', monthCol: C.month, dateCol: C.timestamp, color: 'var(--series-1)' },
  sku: { label: 'Total SKU', monthCol: C.month, dateCol: C.timestamp, sumCol: C.skuCount, color: 'var(--series-1)' },
  uploaded: { label: 'Uploaded SKU', monthCol: C.uploadMonth, dateCol: C.uploadDate, sumCol: C.uploadedSku, color: 'var(--series-3)' },
  qc: { label: 'QC approved', monthCol: C.qcMonth, dateCol: C.qcDate, sumCol: C.approvedQc, color: 'var(--series-7)' },
  images: { label: 'Images delivered', monthCol: C.imageMonth, dateCol: C.imageDate, sumCol: C.imageCount, color: 'var(--series-2)' },
};

export const MonthlyTrendCard = memo(function MonthlyTrendCard({ initial = 'jobs' as TrendMetric }: { initial?: TrendMetric }) {
  const { dataset, filtered, setFilters } = useApp();
  const [metric, setMetric] = useState<TrendMetric>(initial);
  const m = TREND_METRICS[metric];
  const available = (dataset.has(m.monthCol) || dataset.has(m.dateCol)) && (!m.sumCol || dataset.has(m.sumCol));
  const data = useMemo(
    () =>
      available
        ? byMonth(dataset, filtered, m.monthCol, m.dateCol, m.sumCol).map((g) => ({
            key: g.key,
            label: monthShort(g.key),
            title: monthLabel(g.key),
            value: m.sumCol ? g.sum : g.count,
          }))
        : [],
    [dataset, filtered, m, available],
  );
  return (
    <Card
      title="Monthly Trend"
      subtitle={`${m.label} by ${m.monthCol} · click a month to filter`}
      className="span-2"
      actions={
        <Segmented
          label="Metric"
          value={metric}
          onChange={setMetric}
          options={(Object.keys(TREND_METRICS) as TrendMetric[]).map((id) => ({ id, label: TREND_METRICS[id].label }))}
        />
      }
    >
      {!available ? (
        <EmptyState title="N/A" message={`Required columns for "${m.label}" were not found.`} small />
      ) : data.length ? (
        <TrendChart
          data={data}
          valueLabel={m.label}
          color={m.color}
          onSelect={metric === 'jobs' || metric === 'sku' ? (i) => setFilters((f) => ({ ...f, month: data[i].key })) : undefined}
        />
      ) : (
        <EmptyState small />
      )}
    </Card>
  );
});
