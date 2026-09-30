import { useMemo } from 'react';
import { dashboardConfig, C } from '../config/dashboard.config';
import { useApp } from '../hooks/AppContext';
import { distinct, personTable, type PersonRow } from '../utils/aggregate';
import { fmtNum, fmtPct, fmtSigned, NA } from '../utils/format';
import { text } from '../utils/parse';
import { AchievementBadge, Card, EmptyState, Meter, Stat } from '../components/ui';
import { TeamLeaderboard } from '../components/sections/TeamLeaderboard';
import { WorkTable } from '../components/WorkTable';
import { kpiPeriodText } from '../components/sections/KpiSections';
import type { KpiMetric } from '../types';

const ROLE_STATS: Record<string, (p: PersonRow) => { label: string; value: string }[]> = {
  [C.uploadedBy]: (p) => [
    { label: 'Jobs uploaded', value: fmtNum(p.jobs) },
    { label: 'SKU', value: fmtNum(p.sku) },
    { label: 'Uploaded SKU', value: fmtNum(p.uploadedSku) },
    { label: 'Rejected SKU', value: fmtNum(p.rejectedSku) },
  ],
  [C.qcBy]: (p) => [
    { label: 'Jobs QC’d', value: fmtNum(p.jobs) },
    { label: 'QC approved', value: fmtNum(p.approvedQc) },
    { label: 'QC rejected', value: fmtNum(p.rejectedQc) },
    { label: 'Approval rate', value: fmtPct(p.approvedQc + p.rejectedQc > 0 ? (p.approvedQc / (p.approvedQc + p.rejectedQc)) * 100 : null) },
  ],
  [C.visualEditor]: (p) => [
    { label: 'Image jobs', value: fmtNum(p.jobs) },
    { label: 'Image count', value: fmtNum(p.images) },
    { label: 'Manual edited', value: fmtNum(p.manual) },
    { label: 'AI edited', value: fmtNum(p.ai) },
  ],
};
const DEFAULT_STATS = (p: PersonRow) => [
  { label: 'Jobs', value: fmtNum(p.jobs) },
  { label: 'SKU', value: fmtNum(p.sku) },
  { label: 'Uploaded SKU', value: fmtNum(p.uploadedSku) },
  { label: 'QC approved', value: fmtNum(p.approvedQc) },
];

function KpiLine({ section, m }: { section: string; m: KpiMetric }) {
  return (
    <div className="kpi-metric" style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="top">
        <span>
          <b>{section}</b> · {m.label}
        </span>
        <AchievementBadge pct={m.pct} />
      </div>
      <Meter pct={m.pct} />
      <div className="bot num">
        <span>
          Actual <b style={{ color: 'var(--ink)' }}>{fmtNum(m.actual)}</b> · Target {fmtNum(m.target)}
        </span>
        <span>Gap {fmtSigned(m.gap)}</span>
      </div>
    </div>
  );
}

export default function TeamPage() {
  const { dataset, filtered, kpi, person, setPerson, roster } = useApp();
  const leftSet = useMemo(() => new Set(roster.filter((p) => p.status === 'Left').map((p) => p.name.toLowerCase())), [roster]);
  const roles = dashboardConfig.personColumns.filter((c) => dataset.has(c));

  const people = useMemo(() => {
    const set = new Set<string>();
    for (const r of roles) distinct(dataset.records, r).forEach((p) => set.add(p));
    kpi?.sections.forEach((s) => s.employees.forEach((e) => set.add(e.name)));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [dataset, roles, kpi]);

  const key = person.toLowerCase();
  const personRecords = useMemo(
    () => (key ? filtered.filter((r) => roles.some((c) => text(r.values[c]).toLowerCase() === key)) : []),
    [filtered, roles, key],
  );
  const roleRows = useMemo(
    () =>
      roles
        .map((role) => ({ role, row: personTable(personRecords, role).find((p) => p.name.toLowerCase() === key) }))
        .filter((x): x is { role: string; row: PersonRow } => !!x.row),
    [personRecords, roles, key],
  );
  const kpiLines = useMemo(
    () =>
      kpi?.sections.flatMap((s) =>
        s.employees.filter((e) => e.name.toLowerCase() === key).flatMap((e) => e.metrics.map((m) => ({ section: s.title, m }))),
      ) ?? [],
    [kpi, key],
  );

  return (
    <>
      <Card title="Team Member" subtitle="Pick a person to see their work across every role they appear in">
        <div className="person-head">
          <label className="field" style={{ minWidth: 240 }}>
            <span>Team member</span>
            <select className={`select ${person ? 'is-set' : ''}`} value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">— Select a person —</option>
              <optgroup label="Active">
                {people.filter((p) => !leftSet.has(p.toLowerCase())).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </optgroup>
              {leftSet.size > 0 && (
                <optgroup label="Left the job">
                  {people.filter((p) => leftSet.has(p.toLowerCase())).map((p) => (
                    <option key={p} value={p}>
                      {p} (left)
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          {person && (
            <>
              <div className="avatar" aria-hidden="true">
                {person.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{person}</div>
                <div className="roles">
                  {roleRows.length ? roleRows.map((r) => <span className="badge info" key={r.role}>{r.role}</span>) : <span className="muted">No work records in current filters</span>}
                  {kpiLines.length > 0 && <span className="badge">KPI tracked</span>}
                  {leftSet.has(key) && <span className="badge bad">Left the job</span>}
                </div>
              </div>
              <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setPerson('')}>
                Clear
              </button>
            </>
          )}
        </div>
      </Card>

      {!person ? (
        <TeamLeaderboard limit={25} />
      ) : (
        <>
          <div className="grid grid-2">
            {roleRows.map(({ role, row }) => (
              <Card key={role} title={`As ${role}`} subtitle="Current filters applied">
                <div className="stats">
                  {(ROLE_STATS[role] ?? DEFAULT_STATS)(row).map((s) => (
                    <Stat key={s.label} label={s.label} value={s.value} />
                  ))}
                </div>
              </Card>
            ))}
            <Card title="KPI · Target · Achievement" subtitle={kpi ? `From “${kpi.sheet}” · ${kpiPeriodText(kpi)}` : 'KPI tab unavailable'}>
              {kpiLines.length ? (
                kpiLines.map(({ section, m }) => <KpiLine key={`${section}-${m.id}`} section={section} m={m} />)
              ) : (
                <div className="stats">
                  <Stat label="KPI" value={NA} />
                  <Stat label="Target" value={NA} />
                  <Stat label="Achievement" value={NA} />
                </div>
              )}
            </Card>
          </div>
          <Card title={`${person}’s work records`} subtitle="Rows where this person is uploader, QC, visual editor, KAM or vertical head" bodyClassName="">
            {personRecords.length ? <WorkTable dataset={dataset} records={personRecords} /> : <EmptyState />}
          </Card>
        </>
      )}
    </>
  );
}
