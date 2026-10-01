import { dashboardConfig } from '../config/dashboard.config';
import { useApp } from '../hooks/AppContext';
import { fmtDate, fmtNum } from '../utils/format';
import { Banner, Card } from '../components/ui';
import { ConnectionsCard } from '../components/ConnectionsCard';
import { BUILD, builtAtLabel } from '../utils/buildInfo';

export type Theme = 'system' | 'light' | 'dark';

interface Props {
  refreshMinutes: number;
  setRefreshMinutes: (m: number) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}

export default function SettingsPage({ refreshMinutes, setRefreshMinutes, theme, setTheme }: Props) {
  const { data, dataset, kpi, target } = useApp();
  const src = data.source;
  const expected = Object.values(dashboardConfig.columns);
  const missing = expected.filter((c) => !dataset.has(c) && !src.excludedColumns.includes(c));

  return (
    <>
      <ConnectionsCard />

      <Card title="Display preferences" subtitle="Saved in this browser only">
        <div className="filter-row" style={{ maxWidth: 720 }}>
          <label className="field">
            <span>Auto refresh</span>
            <select className="select" value={refreshMinutes} onChange={(e) => setRefreshMinutes(Number(e.target.value))}>
              <option value={0}>Off</option>
              {[1, 5, 10, 15, 30].map((m) => (
                <option key={m} value={m}>
                  Every {m} min
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Theme</span>
            <select className="select" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <div className="filter-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                try {
                  localStorage.removeItem('cartup.tableColumns');
                  localStorage.removeItem('cartup.pageSize');
                } catch {
                  /* ignore */
                }
                window.location.reload();
              }}
            >
              Reset table layout
            </button>
          </div>
        </div>
        <p className="muted" style={{ marginBottom: 0 }}>
          Data is updated manually with <b>Update data</b> (top right). Auto refresh only re-reads the already-published snapshot; the browser never reads Google Sheets directly.
        </p>
      </Card>

      <Card title="Version" subtitle="Which build of the dashboard is live">
        <dl className="kv">
          <dt>Version</dt>
          <dd>v{BUILD.version}</dd>
          <dt>Build</dt>
          <dd>{BUILD.run ? `#${BUILD.run} (GitHub Actions run number)` : 'Local build'}</dd>
          <dt>Commit</dt>
          <dd>
            <code>{BUILD.commit || '—'}</code>
          </dd>
          <dt>Deployed</dt>
          <dd>{builtAtLabel()}</dd>
        </dl>
      </Card>

      <Card title="Data source" subtitle="What the last sync read from Google Sheets">
        <dl className="kv">
          <dt>Spreadsheet</dt>
          <dd>{src.spreadsheetTitle || '—'}</dd>
          <dt>Last synced</dt>
          <dd>{fmtDate(Date.parse(data.updatedAt), true)}</dd>
          <dt>Tabs in sheet</dt>
          <dd>{src.tabs.join(', ')}</dd>
          <dt>Work Sheet tab</dt>
          <dd>
            {src.workSheet} — header row {src.workHeaderRow ?? '—'}, {fmtNum(data.work.rows.length)} rows, {fmtNum(dataset.records.length)} work records (rows with{' '}
            {dashboardConfig.recordRequiresAnyOf.join(' / ')})
          </dd>
          <dt>KPI tab</dt>
          <dd>
            {src.kpiSheet
              ? `${src.kpiSheet} — ${kpi ? `${kpi.sections.length} team tables recognised (${kpi.sections.map((s) => `${s.title}: ${s.metricIds.join(', ') || 'no pairs'}`).join('; ')})` : 'could not be parsed'}`
              : 'Not found'}
          </dd>
          <dt>Target tab</dt>
          <dd>{src.targetSheet ? `${src.targetSheet}${target ? ` — ${target.sections.length} tables` : ''}` : 'Not present (optional)'}</dd>
          <dt>Columns published</dt>
          <dd>{dataset.columns.length}</dd>
          <dt>Never published</dt>
          <dd>{src.excludedColumns.length ? src.excludedColumns.join(', ') : 'None'}</dd>
        </dl>
      </Card>

      {(data.warnings.length > 0 || missing.length > 0 || dataset.quality.length > 0) && (
        <Card title="Data health" subtitle="Nothing is guessed — affected metrics show N/A or ignore the invalid cells">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.warnings.map((w) => (
              <Banner tone="warn" key={w}>
                {w}
              </Banner>
            ))}
            {missing.length > 0 && <Banner tone="warn">Mapped columns not found in the Work Sheet: {missing.join(', ')}.</Banner>}
            {dataset.quality.map((q) => (
              <Banner tone="warn" key={q.column}>
                {fmtNum(q.invalid)} non-numeric value(s) in “{q.column}” were ignored in totals (e.g. {q.examples.map((e) => `“${e}”`).join(', ')}).
              </Banner>
            ))}
          </div>
        </Card>
      )}

      <Card title="Mapping configuration" subtitle="How sheet columns become dashboard metrics">
        <p style={{ marginTop: 0 }}>
          Column names, status groups and KPI target/actual pairs are defined in <code>src/config/dashboard.config.ts</code>. Sheet tab names, excluded columns and
          date columns are in <code>config/data-source.json</code>. Edit, commit and the next GitHub Action run rebuilds the dashboard.
        </p>
        <dl className="kv">
          <dt>Completed statuses</dt>
          <dd>{dashboardConfig.statusGroups.completed.join(', ')}</dd>
          <dt>Pending statuses</dt>
          <dd>{dashboardConfig.statusGroups.pending.join(', ')}</dd>
          <dt>QC done values</dt>
          <dd>{dashboardConfig.qcDoneValues.join(', ')}</dd>
          <dt>Image delivered values</dt>
          <dd>{dashboardConfig.imageDeliveredValues.join(', ')}</dd>
          <dt>KPI pairs</dt>
          <dd>
            {dashboardConfig.kpi.metricPairs.map((p) => (
              <div key={p.id}>
                <b>{p.label}</b> ({p.scope}): target {p.target.map(String).join(' | ')} → actual {p.actual.map(String).join(' | ')}
              </div>
            ))}
          </dd>
        </dl>
      </Card>
    </>
  );
}
