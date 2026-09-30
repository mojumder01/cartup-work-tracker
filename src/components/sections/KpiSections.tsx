import { memo } from 'react';
import { useApp } from '../../hooks/AppContext';
import type { KpiMetric, KpiReport, KpiSection } from '../../types';
import { fmtDate, fmtNum, fmtPct, fmtSigned } from '../../utils/format';
import { parseDate } from '../../utils/parse';
import { AchievementBadge, Card, EmptyState, ErrorState, Meter } from '../ui';

export function kpiPeriodText(r: KpiReport): string {
  const asOfMs = r.asOf ? parseDate(r.asOf) : null;
  const parts = [r.period ? `Period: ${r.period}` : null, r.asOf ? `As of ${asOfMs ? fmtDate(asOfMs) : r.asOf}` : null].filter(Boolean);
  return parts.join(' · ');
}

export function KpiUnavailable({ which = 'KPI' }: { which?: string }) {
  const { data } = useApp();
  const missing = !data.source.kpiSheet;
  return (
    <ErrorState
      title={`Unable to load ${which} data`}
      message={
        missing
          ? 'The "KPI & Target" tab was not found in the Google Sheet. Please check the tab name and Google Sheet access.'
          : 'The KPI & Target tab could not be read. Please check Google Sheet access and the KPI mapping in Settings.'
      }
    />
  );
}

function MetricBlock({ m }: { m: KpiMetric }) {
  return (
    <div className="kpi-metric">
      <div className="top">
        <span className="muted">{m.label}</span>
        <AchievementBadge pct={m.pct} />
      </div>
      <Meter pct={m.pct} label={`${m.label} achievement`} />
      <div className="bot num">
        <span>
          <b style={{ color: 'var(--ink)' }}>{fmtNum(m.actual)}</b> / {fmtNum(m.target)}
        </span>
        <span>Gap {fmtSigned(m.gap)}</span>
      </div>
    </div>
  );
}

/** Compact Target vs Achievement for the dashboard: one tile per team × monthly metric. */
export const TargetVsAchievementCard = memo(function TargetVsAchievementCard() {
  const { kpi, navigate } = useApp();
  if (!kpi) {
    return (
      <Card title="Target vs Achievement" className="span-2">
        <KpiUnavailable />
      </Card>
    );
  }
  const tiles = kpi.sections.flatMap((s) => s.totals.filter((m) => m.scope === 'month').map((m) => ({ s, m })));
  return (
    <Card
      title="Target vs Achievement"
      subtitle={`From “${kpi.sheet}” · ${kpiPeriodText(kpi)} · team totals`}
      className="span-2"
      actions={
        <button type="button" className="btn btn-sm" onClick={() => navigate('kpi')}>
          Details
        </button>
      }
    >
      {tiles.length ? (
        <div className="team-totals">
          {tiles.map(({ s, m }) => (
            <div className="total-tile" key={`${s.title}-${m.id}`}>
              <div className="h">
                <span>
                  {s.title} · {m.label}
                </span>
                <AchievementBadge pct={m.pct} />
              </div>
              <div className="big num">{fmtNum(m.actual)}</div>
              <Meter pct={m.pct} label={`${s.title} ${m.label}`} />
              <div className="muted num" style={{ fontSize: 12 }}>
                Target {fmtNum(m.target)} · Gap {fmtSigned(m.gap)}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState title="No KPI metrics recognised" message="Check the KPI & Target mapping in src/config/dashboard.config.ts." small />
      )}
    </Card>
  );
});

export function KpiTeamCard({ section, highlight, hideLeft = false }: { section: KpiSection; highlight?: string; hideLeft?: boolean }) {
  const { openPerson, roster } = useApp();
  const leftSet = new Set(roster.filter((p) => p.status === 'Left').map((p) => p.name.toLowerCase()));
  const employees = hideLeft ? section.employees.filter((e) => !leftSet.has(e.name.toLowerCase())) : section.employees;
  const hidden = section.employees.length - employees.length;
  const monthly = section.totals.filter((m) => m.scope === 'month');
  const today = section.totals.filter((m) => m.scope === 'today');
  return (
    <Card
      title={section.title}
      subtitle={`${employees.length} members${hidden ? ` (${hidden} who left hidden)` : ''} · ${section.metricIds.length} target/actual pairs · team totals include everyone in the sheet`}
    >
      {section.metricIds.length === 0 ? (
        <EmptyState title="No target/actual pairs recognised" message="Achievement is shown as N/A. Adjust kpi.metricPairs in the dashboard config." small />
      ) : (
        <>
          <div className="team-totals" style={{ marginBottom: 8 }}>
            {[...monthly, ...today].map((m) => (
              <div className="total-tile" key={m.id}>
                <div className="h">
                  <span>Team {m.label}</span>
                  <AchievementBadge pct={m.pct} />
                </div>
                <Meter pct={m.pct} />
                <div className="muted num" style={{ fontSize: 12 }}>
                  Actual {fmtNum(m.actual)} · Target {fmtNum(m.target)} · Gap {fmtSigned(m.gap)}
                </div>
              </div>
            ))}
          </div>
          {employees.map((e) => (
            <div className="kpi-person" key={e.name} style={highlight && e.name.toLowerCase() === highlight.toLowerCase() ? { background: 'var(--accent-soft)', borderRadius: 8, padding: '14px 10px' } : undefined}>
              <button type="button" className="btn btn-ghost btn-sm who" style={{ justifyContent: 'flex-start' }} onClick={() => openPerson(e.name)}>
                {e.name}
                {leftSet.has(e.name.toLowerCase()) && <span className="badge bad" style={{ marginLeft: 6 }}>Left</span>}
              </button>
              {e.metrics.map((m) => (
                <MetricBlock key={m.id} m={m} />
              ))}
            </div>
          ))}
        </>
      )}
    </Card>
  );
}

/** Every column of a section as published (including % and "today" columns). */
export function KpiRawTable({ section }: { section: KpiSection }) {
  return (
    <Card title={`${section.title} — sheet values`} subtitle="All columns as shown in Google Sheets" bodyClassName="">
      <div className="table-wrap flush">
        <table className="data">
          <thead>
            <tr>
              {section.headers.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.employees.map((e) => (
              <tr key={e.name}>
                {section.headers.map((h) => (
                  <td key={h}>{e.cells[h] || <span className="muted">—</span>}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function headlineSub(kpi: KpiReport | null): string {
  if (!kpi) return 'KPI tab unavailable';
  if (kpi.headlinePct === null) return 'No target to compare';
  return `Avg of ${kpi.headlineParts.length} team targets${kpi.period ? ` · ${kpi.period}` : ''}`;
}

export const headlineTitle = (kpi: KpiReport | null) =>
  kpi?.headlineParts.map((p) => `${p.section} · ${p.metric}: ${fmtPct(p.pct)}`).join('\n');
