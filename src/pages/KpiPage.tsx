import { useState } from 'react';
import { useApp } from '../hooks/AppContext';
import { KpiRawTable, KpiTeamCard, KpiUnavailable, kpiPeriodText } from '../components/sections/KpiSections';
import { Card, EmptyState, KpiCard, Segmented } from '../components/ui';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { fmtPct, NA } from '../utils/format';
import type { KpiReport } from '../types';

function ReportView({ report, view, hideLeft }: { report: KpiReport; view: 'progress' | 'table'; hideLeft: boolean }) {
  if (!report.sections.length) {
    return (
      <Card title={report.sheet}>
        <EmptyState
          title="No KPI tables recognised"
          message="No header row with an employee name column was found. Check kpi.nameHeader in src/config/dashboard.config.ts."
        />
      </Card>
    );
  }
  return (
    <>
      {report.sections.map((s) => (
        <ErrorBoundary key={s.title}>{view === 'progress' ? <KpiTeamCard section={s} hideLeft={hideLeft} /> : <KpiRawTable section={s} />}</ErrorBoundary>
      ))}
    </>
  );
}

export default function KpiPage() {
  const { kpi, target, data } = useApp();
  const [view, setView] = useState<'progress' | 'table'>('progress');
  const [hideLeft, setHideLeft] = useState(true);
  if (!kpi) {
    return (
      <Card title="KPI & Target">
        <KpiUnavailable />
      </Card>
    );
  }
  return (
    <>
      <Card
        title="KPI & Target"
        subtitle={`Values calculated in Google Sheets (“${kpi.sheet}”) · ${kpiPeriodText(kpi)} · Achievement % = Actual ÷ Target × 100 · Gap = Actual − Target`}
        actions={
          <>
          <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={hideLeft} onChange={(e) => setHideLeft(e.target.checked)} />
            Hide people who left
          </label>
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { id: 'progress', label: 'Progress' },
              { id: 'table', label: 'Sheet table' },
            ]}
          />
          </>
        }
      >
        <div className="grid grid-kpi">
          <KpiCard label="Overall achievement" value={kpi.headlinePct != null ? fmtPct(kpi.headlinePct) : NA} sub="Average of team monthly targets" color="var(--series-2)" />
          {kpi.headlineParts.slice(0, 7).map((p) => (
            <KpiCard key={`${p.section}-${p.metric}`} label={`${p.section} · ${p.metric}`} value={fmtPct(p.pct)} sub="Team total vs target" color="var(--series-1)" />
          ))}
        </div>
      </Card>
      <ReportView report={kpi} view={view} hideLeft={hideLeft} />
      {data.source.targetSheet &&
        (target ? (
          <>
            <Card title={`Target tab: “${target.sheet}”`} subtitle={kpiPeriodText(target) || 'Additional targets published from the Google Sheet'}>
              <p className="muted" style={{ margin: 0 }}>
                Sections below are read from the separate Target tab.
              </p>
            </Card>
            <ReportView report={target} view={view} hideLeft={hideLeft} />
          </>
        ) : (
          <Card title="Target">
            <KpiUnavailable which="Target" />
          </Card>
        ))}
    </>
  );
}
