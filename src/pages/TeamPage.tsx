import { useMemo } from 'react';
import { dashboardConfig, C } from '../config/dashboard.config';
import { useApp } from '../hooks/AppContext';
import { distinct, personTable, type PersonRow } from '../utils/aggregate';
import { fmtNum, fmtPct, fmtSigned, NA } from '../utils/format';
import { text } from '../utils/parse';
import { checkCredit, creditRule } from '../utils/credit';
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
const EMPTY_ROW = (name: string): PersonRow => ({ name, jobs: 0, sku: 0, uploadedSku: 0, rejectedSku: 0, approvedQc: 0, rejectedQc: 0, images: 0, ai: 0, manual: 0 });
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
  const { dataset, filtered, roleRecords, kpi, person, setPerson, roster } = useApp();
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
        .map((role) => {
          const mine = roleRecords(role).filter((r) => text(r.values[role]).toLowerCase() === key);
          const assigned = filtered.filter((r) => text(r.values[role]).toLowerCase() === key);
          const rule = creditRule(role);
          const open = rule ? assigned.filter((r) => !checkCredit(dataset, r, rule).counted).length : 0;
          return { role, row: personTable(mine, role).find((p) => p.name.toLowerCase() === key), open };
        })
        .filter((x): x is { role: string; row: PersonRow; open: number } => !!x.row || x.open > 0),
    [roleRecords, filtered, dataset, roles, key],
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
            {roleRows.map(({ role, row, open }) => {
              const rule = creditRule(role);
              return (
                <Card
                  key={role}
                  title={`As ${role}`}
                  subtitle={rule ? `Finished work (${rule.status}: ${rule.done.join(' / ')}) by ${rule.date} · current filters` : 'Current filters applied'}
                >
                  <div className="stats">
                    {(ROLE_STATS[role] ?? DEFAULT_STATS)(row ?? EMPTY_ROW(person)).map((s) => (
                      <Stat key={s.label} label={s.label} value={s.value} />
                    ))}
                  </div>
                  {open > 0 && (
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
                      + {fmtNum(open)} assigned row(s) not counted yet (running, pending, rejected or no {rule?.date}).
                    </div>
                  )}
                </Card>
              );
            })}
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
          <Card title={`${person}’s work records`} subtitle="Every row assigned to this person (uploader, QC, visual editor, KAM or vertical head) — including work that is not finished and therefore not counted above" bodyClassName="">
            {personRecords.length ? <WorkTable dataset={dataset} records={personRecords} /> : <EmptyState />}
          </Card>
        </>
      )}
    </>
  );
}
