import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGovernance } from '../../hooks/useGovernance';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { groupAdhoc, projectStats } from '../../utils/governance';
import { comparisonPeriod, comparisonTitle, listPeriods, periodContaining, type CompareMode, type Period, type PeriodType } from '../../utils/periods';
import { fmtDate, fmtNum } from '../../utils/format';
import { exportXlsx, stamp, type ExportRow } from '../../utils/export';
import { Card, ErrorState, Segmented } from '../ui';
import { Icon } from '../Icon';
import { printSlide, useFitScale } from './ReportBuilder';
import './report.css';

interface Settings {
  periodType: PeriodType;
  periodStart: number | null;
  compare: CompareMode;
  showGlance: boolean;
}
const DEFAULTS: Settings = { periodType: 'week', periodStart: null, compare: 'previous', showGlance: true };

interface Line {
  label: string;
  sub?: string;
  prev: number[];
  cur: number[];
  delta: number | null;
  isNew?: boolean;
}

const Delta = ({ v, isNew }: { v: number | null; isNew?: boolean }) => {
  if (isNew) return <b className="rs-new">New</b>;
  if (v === null) return <span className="rs-muted">—</span>;
  return <b className={v > 0 ? 'rs-up' : v < 0 ? 'rs-down' : ''}>{v > 0 ? '+' : ''}{fmtNum(v)}</b>;
};

function Table({ title, cols, deltaLabel, lines, total, prev, cur }: { title: string; cols: string[]; deltaLabel: string; lines: Line[]; total?: Line; prev: Period; cur: Period }) {
  return (
    <div className="rs-block">
      <div className="rs-block-title">{title}</div>
      <table className={`rs-table cols-${cols.length * 2 + 2}`}>
        <thead>
          <tr>
            <th className="rs-name">Name</th>
            {cols.map((c) => (
              <th key={`p${c}`}>
                {prev.short}
                <br />
                {c}
              </th>
            ))}
            {cols.map((c) => (
              <th key={`c${c}`}>
                {cur.short}
                <br />
                {c}
              </th>
            ))}
            <th>{deltaLabel}</th>
          </tr>
        </thead>
        <tbody>
          {lines.length === 0 && (
            <tr>
              <td colSpan={cols.length * 2 + 2} className="rs-muted">
                No activity in these periods
              </td>
            </tr>
          )}
          {lines.map((l) => (
            <tr key={l.label}>
              <td className="rs-name">
                {l.label}
                {l.sub && <div className="rs-muted" style={{ fontSize: 9.5 }}>{l.sub}</div>}
              </td>
              {l.prev.map((v, i) => (
                <td key={`p${i}`}>{v ? fmtNum(v) : '—'}</td>
              ))}
              {l.cur.map((v, i) => (
                <td key={`c${i}`}>{v ? fmtNum(v) : '—'}</td>
              ))}
              <td>
                <Delta v={l.delta} isNew={l.isNew} />
              </td>
            </tr>
          ))}
        </tbody>
        {total && (
          <tfoot>
            <tr>
              <td className="rs-name">Total</td>
              {total.prev.map((v, i) => (
                <td key={`p${i}`}>{fmtNum(v)}</td>
              ))}
              {total.cur.map((v, i) => (
                <td key={`c${i}`}>{fmtNum(v)}</td>
              ))}
              <td>
                <Delta v={total.delta} />
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

const pctText = (a: number, b: number) => (a ? ` (${b >= a ? '+' : ''}${(((b - a) / a) * 100).toFixed(1)}%)` : '');

export function GovernanceReport() {
  const { gov, adhoc, projects, logs } = useGovernance();
  const [st, setSt] = useLocalStorage<Settings>('cartup.govReportSettings', DEFAULTS);
  const s = { ...DEFAULTS, ...st };
  const update = (p: Partial<Settings>) => setSt({ ...s, ...p });
  const [notesEdit, setNotesEdit] = useState<string | null>(null);
  const [summaryEdit, setSummaryEdit] = useState<string | null>(null);
  const [generatedAt] = useState(() => Date.now());

  const periods = useMemo(() => {
    const dates = [...(adhoc?.tasks ?? []).map((t) => t.date ?? Infinity), ...logs.map((l) => (l.date ? new Date(`${l.date}T00:00:00`).getTime() : Infinity))];
    const min = Math.min(...dates, Date.now());
    return listPeriods(s.periodType, min, Date.now());
  }, [adhoc, logs, s.periodType]);
  const cur: Period = useMemo(
    () => (s.periodStart !== null ? periods.find((p) => p.start === s.periodStart) : undefined) ?? periods[1] ?? periods[0] ?? periodContaining(s.periodType, Date.now()),
    [periods, s.periodStart, s.periodType],
  );
  const prev = useMemo(() => comparisonPeriod(cur, s.compare), [cur, s.compare]);

  const model = useMemo(() => {
    const inP = (ms: number | null, p: Period) => ms !== null && ms >= p.start && ms < p.end;
    const tasksPrev = (adhoc?.tasks ?? []).filter((t) => inP(t.date, prev));
    const tasksCur = (adhoc?.tasks ?? []).filter((t) => inP(t.date, cur));
    const typeLines = (key: (t: (typeof tasksCur)[number]) => string): { lines: Line[]; total: Line } => {
      const a = new Map(groupAdhoc(tasksPrev, key).map((g) => [g.key, g]));
      const b = new Map(groupAdhoc(tasksCur, key).map((g) => [g.key, g]));
      const keys = [...new Set([...a.keys(), ...b.keys()])];
      const lines = keys
        .map((k) => {
          const x = a.get(k);
          const y = b.get(k);
          return { label: k, prev: [x?.tasks ?? 0, x?.products ?? 0], cur: [y?.tasks ?? 0, y?.products ?? 0], delta: (y?.products ?? 0) - (x?.products ?? 0), isNew: !x && !!y };
        })
        .sort((m, n) => n.cur[1] + n.prev[1] - (m.cur[1] + m.prev[1]));
      const sum = (arr: typeof tasksCur) => [arr.length, arr.reduce((z, t) => z + t.products, 0)];
      const tp = sum(tasksPrev);
      const tc = sum(tasksCur);
      return { lines, total: { label: 'Total', prev: tp, cur: tc, delta: tc[1] - tp[1] } };
    };
    const byType = typeLines((t) => t.taskType);
    const byPerson = typeLines((t) => t.person);

    const projLines: Line[] = [];
    let pt = [0, 0, 0];
    let ct = [0, 0, 0];
    for (const p of projects) {
      const a = projectStats(p, logs, [prev.start, prev.end]);
      const b = projectStats(p, logs, [cur.start, cur.end]);
      const closed = /complete|cancel/i.test(p.status);
      // Closed projects appear only if they logged work in one of the two periods.
      if (!a.logs.length && !b.logs.length && closed) continue;
      const all = projectStats(p, logs);
      projLines.push({
        label: p.name,
        sub: `${p.status}${p.poc ? ` · POC ${p.poc}` : ''} · overall ${fmtNum(all.reviewed)}${p.totalSkus ? ` / ${fmtNum(p.totalSkus)}` : ''} reviewed, ${fmtNum(all.pending)} pending`,
        prev: [a.reviewed, a.found, a.updated],
        cur: [b.reviewed, b.found, b.updated],
        delta: b.updated - a.updated,
        isNew: !a.logs.length && b.logs.length > 0,
      });
      pt = [pt[0] + a.reviewed, pt[1] + a.found, pt[2] + a.updated];
      ct = [ct[0] + b.reviewed, ct[1] + b.found, ct[2] + b.updated];
    }
    const pendingNow = projects.filter((p) => !/complete|cancel/i.test(p.status)).reduce((z, p) => z + projectStats(p, logs).pending, 0);
    const glance = [
      { label: 'Ad-Hoc Tasks', prev: byType.total.prev[0], cur: byType.total.cur[0] },
      { label: 'Ad-Hoc Products', prev: byType.total.prev[1], cur: byType.total.cur[1] },
      { label: 'Shops Covered', prev: tasksPrev.reduce((z, t) => z + t.shops, 0), cur: tasksCur.reduce((z, t) => z + t.shops, 0) },
      { label: 'Images Handled', prev: tasksPrev.reduce((z, t) => z + t.images, 0), cur: tasksCur.reduce((z, t) => z + t.images, 0) },
      { label: 'REVAMP SKUs Reviewed', prev: pt[0], cur: ct[0] },
      { label: 'REVAMP SKUs Updated', prev: pt[2], cur: ct[2] },
    ];
    const notes: string[] = [];
    const [tp, tc] = [byType.total.prev[1], byType.total.cur[1]];
    notes.push(`Ad-Hoc volume ${fmtNum(tp)} → ${fmtNum(tc)} products${pctText(tp, tc)} across ${fmtNum(byType.total.prev[0])} → ${fmtNum(byType.total.cur[0])} tasks.`);
    const movers = byType.lines.filter((l) => !l.isNew).sort((m, n) => (n.delta ?? 0) - (m.delta ?? 0));
    if (movers.length && (movers[0].delta ?? 0) > 0) notes.push(`Biggest increase: ${movers[0].label} (+${fmtNum(movers[0].delta)} products).`);
    const low = movers[movers.length - 1];
    if (low && (low.delta ?? 0) < 0) notes.push(`Biggest decrease: ${low.label} (${fmtNum(low.delta)} products).`);
    const newTypes = byType.lines.filter((l) => l.isNew).map((l) => l.label);
    if (newTypes.length) notes.push(`New task types this period: ${newTypes.join(', ')}.`);
    const unchanged = projLines.filter((l) => l.prev.some(Boolean) && l.prev.join() === l.cur.join()).map((l) => l.label);
    if (unchanged.length) notes.push(`No change vs ${prev.label}: ${unchanged.join(', ')} — worth checking.`);
    const newProj = projLines.filter((l) => l.isNew).map((l) => l.label);
    if (newProj.length) notes.push(`Projects started logging in ${cur.label}: ${newProj.join(', ')}.`);
    if (projLines.length) notes.push(`REVAMP pending fixes across active projects: ${fmtNum(pendingNow)}.`);
    const summary = `Governance handled ${fmtNum(tc)} products in ${fmtNum(byType.total.cur[0])} Ad-Hoc tasks in ${cur.label} (${fmtNum(tp)} in ${prev.label}); ${projLines.length} REVAMP project(s) reported.`;
    return { byType, byPerson, projLines, projTotal: { label: 'Total', prev: pt, cur: ct, delta: ct[2] - pt[2] } as Line, glance, notes, summary };
  }, [adhoc, projects, logs, prev, cur]);

  const summary = summaryEdit ?? model.summary;
  const notes = (notesEdit ?? model.notes.join('\n')).split('\n').map((x) => x.trim()).filter(Boolean);
  const title = `Product Governance — ${comparisonTitle(prev, cur)}`;
  const slideRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const scale = useFitScale(stageRef);
  const [h, setH] = useState(720);
  useLayoutEffect(() => {
    if (slideRef.current) setH(slideRef.current.offsetHeight);
  });

  if (!gov) {
    return (
      <Card title="Product Governance">
        <ErrorState title="Governance sheet not synced yet" message="Run the GitHub Action once the Governance spreadsheet is shared with the service account." />
      </Card>
    );
  }

  const downloadExcel = async () => {
    const rows: ExportRow[] = [[title], [summary], []];
    const add = (name: string, cols: string[], lines: Line[], total?: Line) => {
      rows.push([name]);
      rows.push(['Name', ...cols.map((c) => `${prev.short} ${c}`), ...cols.map((c) => `${cur.short} ${c}`), 'Δ']);
      lines.forEach((l) => rows.push([l.label, ...l.prev, ...l.cur, l.isNew ? 'New' : l.delta]));
      if (total) rows.push(['Total', ...total.prev, ...total.cur, total.delta]);
      rows.push([]);
    };
    add('Ad-Hoc by Task Type', ['Tasks', 'Products'], model.byType.lines, model.byType.total);
    add('Ad-Hoc by Person', ['Tasks', 'Products'], model.byPerson.lines, model.byPerson.total);
    add('REVAMP Projects', ['Reviewed', 'Found', 'Updated'], model.projLines, model.projTotal);
    rows.push(['Key Notes']);
    notes.forEach((n) => rows.push([n]));
    const w = Math.max(...rows.map((r) => r.length));
    await exportXlsx(`product-governance-${prev.short}-vs-${cur.short}-${stamp()}.xlsx`, 'Product Governance', Array(w).fill(''), rows.map((r) => [...r, ...Array(w - r.length).fill(null)]));
  };

  return (
    <div className="rb-layout">
      <Card title="Report settings" subtitle="Ad-Hoc tasks from the “Main” tab + REVAMP project progress">
        <div className="rb-panel">
          <div className="rb-group">
            <span className="rb-label">Report type</span>
            <Segmented
              label="Report type"
              value={s.periodType}
              onChange={(v) => update({ periodType: v, periodStart: null })}
              options={[
                { id: 'week', label: 'Weekly' },
                { id: 'month', label: 'Monthly' },
                { id: 'year', label: 'Yearly' },
              ]}
            />
          </div>
          <label className="field">
            <span>Period</span>
            <select className="select" value={cur.start} onChange={(e) => update({ periodStart: Number(e.target.value) })}>
              {periods.map((p, i) => (
                <option key={p.start} value={p.start}>
                  {p.type === 'week' ? `${p.label}, ${p.year} · ${p.range}` : p.label}
                  {i === 0 ? ' (in progress)' : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="rb-group">
            <span className="rb-label">Compare with</span>
            <Segmented
              label="Compare with"
              value={s.compare}
              onChange={(v) => update({ compare: v })}
              options={[
                { id: 'previous', label: s.periodType === 'week' ? 'Previous week' : s.periodType === 'month' ? 'Previous month' : 'Previous year' },
                ...(s.periodType === 'year' ? [] : [{ id: 'lastYear' as const, label: 'Same period last year' }]),
              ]}
            />
            <span className="muted" style={{ fontSize: 12 }}>
              {prev.label} ({prev.range}) → {cur.label} ({cur.range})
            </span>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={s.showGlance} onChange={(e) => update({ showGlance: e.target.checked })} />
            Show “At a Glance” panel
          </label>
          <label className="field">
            <span>Summary line</span>
            <textarea className="rb-textarea" style={{ minHeight: 70 }} value={summary} onChange={(e) => setSummaryEdit(e.target.value)} />
          </label>
          <label className="field">
            <span>Key notes (one per line)</span>
            <textarea className="rb-textarea" value={notesEdit ?? model.notes.join('\n')} onChange={(e) => setNotesEdit(e.target.value)} />
          </label>
          {(summaryEdit !== null || notesEdit !== null) && (
            <button type="button" className="rb-link" style={{ alignSelf: 'flex-start' }} onClick={() => (setNotesEdit(null), setSummaryEdit(null))}>
              Reset text to automatic
            </button>
          )}
        </div>
      </Card>
      <Card
        title={title}
        subtitle={`${prev.range} vs ${cur.range}`}
        bodyClassName=""
        actions={
          <div className="rb-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => slideRef.current && printSlide(slideRef.current, title)}>
              <Icon name="download" size={14} /> PDF / Print
            </button>
            <button type="button" className="btn btn-sm" onClick={downloadExcel}>
              <Icon name="download" size={14} /> Excel
            </button>
          </div>
        }
      >
        <div className="report-stage" ref={stageRef}>
          <div style={{ height: h * scale, width: 1280 * scale }}>
            <div className="report-scale" style={{ transform: `scale(${scale})` }}>
              <div className="report-slide" ref={slideRef}>
                <header className="rs-header">
                  <h1>{title}</h1>
                  <div className="rs-logo" aria-label="cartup">
                    <span className="rs-logo-a">cart</span>
                    <span className="rs-logo-b">up</span>
                  </div>
                </header>
                <div className="rs-rule" />
                {summary && <p className="rs-summary">❖ {summary}</p>}
                <div className={`rs-grid ${s.showGlance ? '' : 'no-glance'}`}>
                  <div className="rs-col">
                    <Table title="REGULAR · Ad-Hoc Tasks by Type" cols={['Tasks', 'Products']} deltaLabel="Δ Products" lines={model.byType.lines} total={model.byType.total} prev={prev} cur={cur} />
                    <Table title="Ad-Hoc by Person" cols={['Tasks', 'Products']} deltaLabel="Δ Products" lines={model.byPerson.lines} total={model.byPerson.total} prev={prev} cur={cur} />
                  </div>
                  <div className="rs-col">
                    <Table title="REVAMP Projects" cols={['Reviewed', 'Found', 'Updated']} deltaLabel="Δ Updated" lines={model.projLines} total={model.projLines.length ? model.projTotal : undefined} prev={prev} cur={cur} />
                    {notes.length > 0 && (
                      <div className="rs-note rs-note-teal">
                        <div className="rs-note-title">🔑 Key Notes</div>
                        <ul>
                          {notes.map((n, i) => (
                            <li key={i}>{n}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  {s.showGlance && (
                    <aside className="rs-glance">
                      <div className="rs-g-title">
                        {prev.short} → {cur.short}
                      </div>
                      <div className="rs-g-sub">At a Glance</div>
                      {model.glance.map((g) => {
                        const ch = g.prev ? ((g.cur - g.prev) / g.prev) * 100 : null;
                        return (
                          <div className="rs-g-item" key={g.label}>
                            <div className="rs-g-label">{g.label}</div>
                            <div className="rs-g-val">
                              {fmtNum(g.prev)} → {fmtNum(g.cur)}{' '}
                              {ch !== null && g.cur !== g.prev && (
                                <span className={g.cur > g.prev ? 'rs-g-good' : 'rs-g-bad'}>
                                  {g.cur > g.prev ? '▲' : '▼'} {ch > 0 ? '+' : ''}
                                  {ch.toFixed(1)}%
                                </span>
                              )}
                              {g.cur === g.prev && <span className="rs-g-flat">• 0.0%</span>}
                            </div>
                          </div>
                        );
                      })}
                      <div className="rs-g-range">
                        {prev.short}: {prev.range}
                        <br />
                        {cur.short}: {cur.range}
                      </div>
                    </aside>
                  )}
                </div>
                <footer className="rs-footer">
                  Reporting Period: {prev.label} – {cur.label}, {cur.year} &nbsp;|&nbsp; Governance Team &nbsp;|&nbsp; Generated {fmtDate(generatedAt, true)} from “{gov.spreadsheetTitle}”
                </footer>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
