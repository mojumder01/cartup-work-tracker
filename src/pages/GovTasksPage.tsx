import { useMemo, useState } from 'react';
import { useGovernance } from '../hooks/useGovernance';
import { useApp } from '../hooks/AppContext';
import { leftChecker } from '../utils/roster';
import { groupAdhoc, type AdhocTask } from '../utils/governance';
import { presetRange, DATE_PRESETS, emptyFilters, type DatePreset } from '../utils/filters';
import { fmtDate, fmtNum } from '../utils/format';
import { weekStartOf } from '../utils/periods';
import { monthKeyOf, monthLabel, monthShort } from '../utils/parse';
import { exportCsv, stamp } from '../utils/export';
import { BarList } from '../charts/BarList';
import { TrendChart } from '../charts/TrendChart';
import { Card, EmptyState, ErrorState, KpiCard, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { AdhocIndividual } from './gov/AdhocIndividual';

type Measure = 'products' | 'tasks' | 'shops' | 'images';
const MEASURES: { id: Measure; label: string }[] = [
  { id: 'products', label: 'Products' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'shops', label: 'Shops' },
  { id: 'images', label: 'Images' },
];
const PAGE = 50;

export default function GovTasksPage() {
  const { gov, adhoc } = useGovernance();
  const { roster } = useApp();
  const [preset, setPreset] = useState<DatePreset>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [taskType, setTaskType] = useState('');
  const [person, setPerson] = useState('');
  const [project, setProject] = useState('');
  const [q, setQ] = useState('');
  const [measure, setMeasure] = useState<Measure>('products');
  const [gran, setGran] = useState<'week' | 'month'>('week');
  const [page, setPage] = useState(0);

  const options = useMemo(() => {
    const t = adhoc?.tasks ?? [];
    const uniq = (f: (x: AdhocTask) => string) => [...new Set(t.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const isLeft = leftChecker(roster);
    return { types: uniq((x) => x.taskType), people: uniq((x) => x.person).filter((p) => !isLeft(p)), projects: uniq((x) => x.project) };
  }, [adhoc, roster]);

  const rows = useMemo(() => {
    const range = presetRange({ ...emptyFilters(), datePreset: preset, dateFrom: from, dateTo: to });
    const needle = q.trim().toLowerCase();
    return (adhoc?.tasks ?? []).filter((t) => {
      if (range && (t.date === null || t.date < range[0] || t.date >= range[1])) return false;
      if (taskType && t.taskType !== taskType) return false;
      if (person && t.person !== person) return false;
      if (project && t.project !== project) return false;
      if (needle && ![t.taskType, t.project, t.shop, t.person, t.note, t.source].join(' ').toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [adhoc, preset, from, to, taskType, person, project, q]);

  const totals = useMemo(() => groupAdhoc(rows, () => 'all')[0] ?? { tasks: 0, products: 0, shops: 0, images: 0 }, [rows]);
  const byType = useMemo(() => groupAdhoc(rows, (t) => t.taskType), [rows]);
  const byPerson = useMemo(() => groupAdhoc(rows, (t) => t.person), [rows]);
  const trend = useMemo(() => {
    const m = new Map<number, { ms: number; tasks: number; products: number; shops: number; images: number }>();
    for (const t of rows) {
      if (t.date === null) continue;
      const d = new Date(t.date);
      const ms = gran === 'week' ? weekStartOf(t.date) : new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      const g = m.get(ms) ?? { ms, tasks: 0, products: 0, shops: 0, images: 0 };
      g.tasks++;
      g.products += t.products;
      g.shops += t.shops;
      g.images += t.images;
      m.set(ms, g);
    }
    return [...m.values()]
      .sort((a, b) => a.ms - b.ms)
      .map((g) => ({
        label: gran === 'week' ? new Date(g.ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : monthShort(monthKeyOf(g.ms)),
        title: gran === 'week' ? `Week of ${fmtDate(g.ms)}` : monthLabel(monthKeyOf(g.ms)),
        value: g[measure],
      }));
  }, [rows, gran, measure]);

  if (!gov) {
    return (
      <Card title="Governance · Ad-Hoc Tasks">
        <ErrorState
          title="Governance sheet not synced yet"
          message="The Governance spreadsheet has not been read by the sync yet (or it is not shared with the service account). Run the GitHub Action and check its log."
        />
      </Card>
    );
  }
  if (!adhoc) {
    return (
      <Card title="Governance · Ad-Hoc Tasks">
        <ErrorState title="“Main” tab not found" message={`Tabs in “${gov.spreadsheetTitle}”: ${gov.tabs.join(', ')}. Update governance.tabs.adhoc in config/data-source.json.`} />
      </Card>
    );
  }

  const set = (fn: () => void) => {
    fn();
    setPage(0);
  };
  const shown = [...rows].sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const missing = (Object.entries(adhoc.map) as [string, string | null][]).filter(([, v]) => !v).map(([k]) => k);
  const measureLabel = MEASURES.find((m) => m.id === measure)!.label;

  return (
    <>
      <div className="filterbar" role="region" aria-label="Filters">
        <div className="filter-row">
          <label className="field">
            <span>Date</span>
            <select className={`select ${preset !== 'all' ? 'is-set' : ''}`} value={preset} onChange={(e) => set(() => setPreset(e.target.value as DatePreset))}>
              {DATE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          {preset === 'custom' && (
            <>
              <label className="field">
                <span>From</span>
                <input type="date" className="input is-set" value={from} onChange={(e) => set(() => setFrom(e.target.value))} />
              </label>
              <label className="field">
                <span>To</span>
                <input type="date" className="input is-set" value={to} onChange={(e) => set(() => setTo(e.target.value))} />
              </label>
            </>
          )}
          {[
            { label: 'Task Type', value: taskType, set: setTaskType, opts: options.types },
            { label: 'Working By', value: person, set: setPerson, opts: options.people },
            { label: 'Project Name', value: project, set: setProject, opts: options.projects },
          ].map((f) => (
            <label className="field" key={f.label}>
              <span>{f.label}</span>
              <select className={`select ${f.value ? 'is-set' : ''}`} value={f.value} onChange={(e) => set(() => f.set(e.target.value))}>
                <option value="">All</option>
                {f.opts.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <label className="field">
            <span>Search</span>
            <input className={`input ${q ? 'is-set' : ''}`} value={q} placeholder="Shop, note, project…" onChange={(e) => set(() => setQ(e.target.value))} />
          </label>
          <div className="filter-actions">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() =>
                set(() => {
                  setPreset('all');
                  setTaskType('');
                  setPerson('');
                  setProject('');
                  setQ('');
                })
              }
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-kpi">
        <KpiCard label="Tasks" value={fmtNum(totals.tasks)} sub={`rows in “${adhoc && gov ? gov.adhoc?.sheet : ''}”`} color="var(--series-1)" />
        <KpiCard label="Products" value={adhoc.map.products ? fmtNum(totals.products) : 'N/A'} sub={adhoc.map.products ?? 'column missing'} color="var(--series-3)" />
        <KpiCard label="Shops" value={adhoc.map.shops ? fmtNum(totals.shops) : 'N/A'} sub={adhoc.map.shops ?? 'column missing'} color="var(--series-7)" />
        <KpiCard label="Images" value={adhoc.map.images ? fmtNum(totals.images) : 'N/A'} sub={adhoc.map.images ?? 'column missing'} color="var(--series-2)" />
      </div>

      <div className="grid grid-2">
        <Card
          title="By Task Type"
          subtitle="Click a row to filter"
          actions={<Segmented label="Measure" value={measure} onChange={setMeasure} options={MEASURES} />}
        >
          {byType.length ? (
            <BarList
              labelHeader="Task Type"
              valueHeader={measureLabel}
              showShare
              items={byType.map((g) => ({ key: g.key, value: g[measure] })).sort((a, b) => b.value - a.value)}
              activeKey={taskType}
              onSelect={(k) => set(() => setTaskType(taskType === k ? '' : k))}
              limit={14}
              color="var(--series-7)"
            />
          ) : (
            <EmptyState small />
          )}
        </Card>
        <Card title="By person" subtitle={`${adhoc.map.person ?? 'Working By'} · click to filter`}>
          {byPerson.length ? (
            <BarList
              labelHeader="Person"
              valueHeader={measureLabel}
              secondaryHeader={measure === 'tasks' ? undefined : 'Tasks'}
              items={byPerson.map((g) => ({ key: g.key, value: g[measure], secondary: measure === 'tasks' ? undefined : g.tasks })).sort((a, b) => b.value - a.value)}
              activeKey={person}
              onSelect={(k) => set(() => setPerson(person === k ? '' : k))}
              limit={12}
              color="var(--series-3)"
            />
          ) : (
            <EmptyState small />
          )}
        </Card>
        <Card
          title="Trend"
          subtitle={`${measureLabel} by ${gran === 'week' ? 'week' : 'month'} (${adhoc.map.date ?? 'Date'})`}
          className="span-2"
          actions={
            <Segmented
              label="Granularity"
              value={gran}
              onChange={setGran}
              options={[
                { id: 'week', label: 'Weekly' },
                { id: 'month', label: 'Monthly' },
              ]}
            />
          }
        >
          {trend.length ? <TrendChart data={trend} valueLabel={measureLabel} color="var(--series-7)" /> : <EmptyState small />}
        </Card>
      </div>

      <AdhocIndividual tasks={adhoc.tasks} people={options.people} />

      <Card
        title="Ad-Hoc task log"
        subtitle={`${fmtNum(rows.length)} rows · newest first${missing.length ? ` · not in sheet: ${missing.join(', ')}` : ''}`}
        bodyClassName=""
        actions={
          <button
            type="button"
            className="btn btn-sm"
            disabled={!rows.length}
            onClick={() => exportCsv(`governance-adhoc-${stamp()}.csv`, adhoc.columns, shown.map((t) => adhoc.columns.map((c) => t.values[c])))}
          >
            <Icon name="download" size={14} /> CSV
          </button>
        }
      >
        {rows.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="table-wrap" style={{ borderTop: '1px solid var(--border)' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Task Type</th>
                    <th>Project</th>
                    <th>Shop</th>
                    <th className="n">Products</th>
                    <th className="n">Shops</th>
                    <th className="n">Images</th>
                    <th>Working By</th>
                    <th>Status</th>
                    <th>Source</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(cur * PAGE, cur * PAGE + PAGE).map((t) => (
                    <tr key={t.idx}>
                      <td>{t.date !== null ? fmtDate(t.date) : <span className="muted">—</span>}</td>
                      <td>{t.taskType}</td>
                      <td>{t.project || <span className="muted">—</span>}</td>
                      <td>{t.shop ? <span className="cell-trunc" title={t.shop}>{t.shop}</span> : <span className="muted">—</span>}</td>
                      <td className="n">{fmtNum(t.products)}</td>
                      <td className="n">{fmtNum(t.shops)}</td>
                      <td className="n">{fmtNum(t.images)}</td>
                      <td>{t.person || <span className="muted">—</span>}</td>
                      <td>{t.status ? <span className={`badge ${/done|complete/i.test(t.status) ? 'good' : ''}`}>{t.status}</span> : <span className="muted">—</span>}</td>
                      <td>{t.source ? <span className="cell-trunc" title={t.source}>{/^https?:/i.test(t.source) ? <a href={t.source} target="_blank" rel="noopener noreferrer">Open</a> : t.source}</span> : <span className="muted">—</span>}</td>
                      <td>{t.note ? <span className="cell-trunc" title={t.note}>{t.note}</span> : <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <span>
                Page {cur + 1} / {pages}
              </span>
              <span className="spacer" />
              <button type="button" className="btn btn-sm" disabled={cur === 0} onClick={() => setPage(cur - 1)} aria-label="Previous page">
                <Icon name="chevronLeft" size={14} />
              </button>
              <button type="button" className="btn btn-sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)} aria-label="Next page">
                <Icon name="chevronRight" size={14} />
              </button>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
