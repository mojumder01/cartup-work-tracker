import { useMemo, useState } from 'react';
import { TEAMS, type TeamId } from '../config/people.config';
import { useApp } from '../hooks/AppContext';
import { fmtDate, fmtNum } from '../utils/format';
import { rosterToTsv, type Person } from '../utils/roster';
import { Banner, Card, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';

const TEAM_OPTIONS: TeamId[] = ['Production', 'Visual', 'QC', 'Governance', 'Other'];
const DAY = 86400000;

const SOURCE_LABEL: Record<Person['source'], string> = {
  browser: 'Changed here',
  sheet: 'Team Members tab',
  staff: 'Performance sheet · Team tab',
  default: 'Default list',
  auto: 'Found in Work Sheet',
};

export default function PeoplePage() {
  const { roster, rosterOverrides, setRosterOverride, clearRosterOverrides, data } = useApp();
  const [show, setShow] = useState<'active' | 'left' | 'all'>('all');
  const [copied, setCopied] = useState(false);
  const localCount = Object.keys(rosterOverrides).length;

  const rows = useMemo(
    () => roster.filter((p) => (show === 'all' ? true : show === 'left' ? p.status === 'Left' : p.status === 'Active')),
    [roster, show],
  );
  const counts = useMemo(() => ({ active: roster.filter((p) => p.status === 'Active').length, left: roster.filter((p) => p.status === 'Left').length }), [roster]);

  const copyForSheet = async () => {
    const tsv = rosterToTsv(roster);
    try {
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copy these rows:', tsv);
    }
  };

  return (
    <>
      <Card
        title="Team Members"
        subtitle={`${counts.active} active · ${counts.left} left the job · names as written in the Work Sheet`}
        actions={
          <Segmented
            label="Show"
            value={show}
            onChange={setShow}
            options={[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'left', label: 'Left' },
            ]}
          />
        }
        bodyClassName=""
      >
        <div style={{ padding: '0 18px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p className="muted" style={{ margin: 0 }}>
            Mark people who <b>left the job</b> so they are no longer pre-selected in reports. Add a <b>Left date</b> (their last working day) to keep them in
            reports for periods before that date. <b>Report name</b> is the full name printed on reports; <b>Team</b> decides the report section they appear in by default.
          </p>
          {localCount > 0 && (
            <Banner tone="warn">
              {localCount} change(s) are saved <b>only in this browser</b>. To share them with everyone, click <b>Copy for Google Sheet</b> and paste into a tab named{' '}
              <b>Team Members</b> in the Google Sheet (cell A1). {data.source.teamSheet ? 'The tab already exists — replace its rows.' : 'The tab does not exist yet — create it.'}{' '}
              The next sync (≤ 5 min) applies it for all viewers.
            </Banner>
          )}
          <div className="rb-actions">
            <button type="button" className="btn btn-sm" onClick={copyForSheet}>
              <Icon name={copied ? 'check' : 'table'} size={14} /> {copied ? 'Copied — paste into the sheet' : 'Copy for Google Sheet'}
            </button>
            {localCount > 0 && (
              <button type="button" className="btn btn-sm" onClick={() => window.confirm('Discard all changes made in this browser?') && clearRosterOverrides()}>
                Discard browser changes
              </button>
            )}
          </div>
        </div>
        <div className="table-wrap flush" style={{ borderTop: '1px solid var(--border)' }}>
          <table className="data">
            <thead>
              <tr>
                <th>Sheet name</th>
                <th>Report name</th>
                <th>Team</th>
                <th>Status</th>
                <th>Left date</th>
                <th className="n">Uploads</th>
                <th className="n">QC</th>
                <th className="n">Visual</th>
                <th>Last active</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const idle = p.lastActive !== null && Date.now() - p.lastActive > 45 * DAY && p.status === 'Active';
                return (
                  <tr key={p.name} style={p.status === 'Left' ? { opacity: 0.7 } : undefined}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>
                      <input
                        className="input"
                        style={{ height: 30, minWidth: 170 }}
                        defaultValue={p.fullName}
                        key={`${p.name}-${p.fullName}`}
                        onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== p.fullName && setRosterOverride(p.name, { fullName: e.target.value.trim() })}
                      />
                    </td>
                    <td>
                      <select className="select" style={{ height: 30, width: 130 }} value={p.team} onChange={(e) => setRosterOverride(p.name, { team: e.target.value as TeamId })}>
                        {TEAM_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {TEAMS.find((x) => x.id === t)?.id ?? t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={p.status === 'Left'}
                          onChange={(e) => setRosterOverride(p.name, { status: e.target.checked ? 'Left' : 'Active', ...(e.target.checked ? {} : { leftDate: '' }) })}
                        />
                        {p.status === 'Left' ? <span className="badge bad">Left the job</span> : <span className="badge good">Active</span>}
                      </label>
                      {idle && (
                        <span className="badge warn" style={{ marginLeft: 6 }} title="No work recorded in the last 45 days">
                          inactive 45d+
                        </span>
                      )}
                    </td>
                    <td>
                      <input
                        type="date"
                        className="input"
                        style={{ height: 30, width: 150 }}
                        value={p.leftDate}
                        disabled={p.status !== 'Left'}
                        onChange={(e) => setRosterOverride(p.name, { leftDate: e.target.value })}
                      />
                    </td>
                    <td className="n">{fmtNum(p.roleCounts['Uploaded by'] ?? 0)}</td>
                    <td className="n">{fmtNum(p.roleCounts['QC By'] ?? 0)}</td>
                    <td className="n">{fmtNum(p.roleCounts['Visual editor'] ?? 0)}</td>
                    <td>{p.lastActive ? fmtDate(p.lastActive) : <span className="muted">—</span>}</td>
                    <td>
                      <span className="muted">{SOURCE_LABEL[p.source]}</span>
                      {rosterOverrides[p.name] && (
                        <button type="button" className="rb-link" onClick={() => setRosterOverride(p.name, null)} title="Undo this browser's change">
                          undo
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
