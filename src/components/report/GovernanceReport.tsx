import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGovernance } from '../../hooks/useGovernance';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { projectStats, type Project } from '../../utils/governance';
import { adhocBlock, defaultIncluded, isNewIn, projectBlock, type Cell, type ReportBlock } from '../../utils/governanceReport';
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
  showAdhocType: boolean;
  showAdhocPerson: boolean;
  /** Project id → shown (overrides the default selection). */
  pick: Record<string, boolean>;
}
const DEFAULTS: Settings = { periodType: 'week', periodStart: null, compare: 'previous', showGlance: true, showAdhocType: true, showAdhocPerson: false, pick: {} };

/** Manual text edits for one block (title / note), kept in this browser. */
type BlockEdits = Record<string, { title?: string; note?: string }>;

const fmtCell = (v: Cell) => (v === null || v === '' ? '—' : typeof v === 'number' ? fmtNum(v) : v);

function DeltaCell({ v }: { v: Cell }) {
  if (v === 'New') return <b className="rs-new">New</b>;
  if (typeof v !== 'number') return <span className="rs-muted">{fmtCell(v)}</span>;
  return <b className={v > 0 ? 'rs-up' : v < 0 ? 'rs-down' : ''}>{v > 0 ? '+' : ''}{fmtNum(v)}</b>;
}

function Block({ b }: { b: ReportBlock }) {
  const n = b.head.length;
  return (
    <div className="rs-block">
      <div className="rs-block-title">
        {b.title}
        {b.tag && <span className="rs-tag">{b.tag}</span>}
      </div>
      <table className={`rs-table cols-${n}`}>
        <thead>
          <tr>
            {b.head.map((h, i) => (
              <th key={i} className={i === 0 ? 'rs-name' : undefined} style={{ whiteSpace: 'pre-line' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.rows.length === 0 && (
            <tr>
              <td colSpan={n} className="rs-muted">
                No entries in these periods
              </td>
            </tr>
          )}
          {b.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((v, i) =>
                i === 0 ? (
                  <td key={i} className="rs-name">
                    {fmtCell(v)}
                  </td>
                ) : (
                  <td key={i}>{b.deltaCol && i === n - 1 ? <DeltaCell v={v} /> : fmtCell(v)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
        {b.total && (
          <tfoot>
            <tr>
              {b.total.map((v, i) =>
                i === 0 ? (
                  <td key={i} className="rs-name">
                    {fmtCell(v)}
                  </td>
                ) : (
                  <td key={i}>{b.deltaCol && i === n - 1 ? <DeltaCell v={v} /> : fmtCell(v)}</td>
                ),
              )}
            </tr>
          </tfoot>
        )}
      </table>
      {b.note && <div className="rs-block-note">{b.note}</div>}
    </div>
  );
}

const pctText = (a: number, b: number) => (a ? ` (${b >= a ? '+' : ''}${(((b - a) / a) * 100).toFixed(1)}%)` : '');

export function GovernanceReport() {
  const { gov, adhoc, projects, logs } = useGovernance();
  const [st, setSt] = useLocalStorage<Settings>('cartup.govReportSettings', DEFAULTS);
  const s = { ...DEFAULTS, ...st, pick: st.pick ?? {} };
  const update = (p: Partial<Settings>) => setSt({ ...s, ...p });
  const [edits, setEdits] = useLocalStorage<BlockEdits>('cartup.govReportEdits', {});
  const [notesEdit, setNotesEdit] = useState<string | null>(null);
  const [summaryEdit, setSummaryEdit] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pptBusy, setPptBusy] = useState(false);
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
  const included = (p: Project) => s.pick[p.id] ?? defaultIncluded(p, logs, prev, cur);

  const model = useMemo(() => {
    const inP = (ms: number | null, p: Period) => ms !== null && ms >= p.start && ms < p.end;
    const tasksPrev = (adhoc?.tasks ?? []).filter((t) => inP(t.date, prev));
    const tasksCur = (adhoc?.tasks ?? []).filter((t) => inP(t.date, cur));
    const byType = adhocBlock('adhoc-type', 'REGULAR · Ad-Hoc Tasks', 'Task Type', tasksPrev, tasksCur, (t) => t.taskType, prev, cur);
    const byPerson = adhocBlock('adhoc-person', 'Ad-Hoc Tasks by Person', 'Person', tasksPrev, tasksCur, (t) => t.person, prev, cur);

    // Oldest project first, like the template.
    const chosen = [...projects].reverse().filter((p) => s.pick[p.id] ?? defaultIncluded(p, logs, prev, cur));
    const projBlocks = chosen.map((p) => projectBlock(p, logs, prev, cur));
    const statsPrev = chosen.map((p) => projectStats(p, logs, [prev.start, prev.end]));
    const statsCur = chosen.map((p) => projectStats(p, logs, [cur.start, cur.end]));
    const flowing = chosen.map((p, i) => ({ p, a: statsPrev[i], b: statsCur[i] })).filter((x) => x.p.layout !== 'Count' && x.p.layout !== 'Status breakdown');
    const worked = [flowing.reduce((z, x) => z + x.a.reviewed, 0), flowing.reduce((z, x) => z + x.b.reviewed, 0)];
    const updated = [flowing.reduce((z, x) => z + x.a.updated, 0), flowing.reduce((z, x) => z + x.b.updated, 0)];

    const [tp, tc] = [tasksPrev.reduce((z, t) => z + t.products, 0), tasksCur.reduce((z, t) => z + t.products, 0)];
    const glance = [
      { label: 'REVAMP SKUs Worked', prev: worked[0], cur: worked[1] },
      { label: 'REVAMP SKUs Updated', prev: updated[0], cur: updated[1] },
      { label: 'Ad-Hoc Tasks', prev: tasksPrev.length, cur: tasksCur.length },
      { label: 'Ad-Hoc SKUs', prev: tp, cur: tc },
      { label: 'Shops Covered', prev: tasksPrev.reduce((z, t) => z + t.shops, 0), cur: tasksCur.reduce((z, t) => z + t.shops, 0) },
      { label: 'Images Handled', prev: tasksPrev.reduce((z, t) => z + t.images, 0), cur: tasksCur.reduce((z, t) => z + t.images, 0) },
    ];

    const notes: string[] = [];
    chosen.forEach((p, i) => {
      const a = statsPrev[i];
      const b = statsCur[i];
      if (p.layout === 'Status breakdown') return;
      if (a.logs.length && b.logs.length && a.reviewed === b.reviewed && a.updated === b.updated && a.found === b.found)
        notes.push(`${p.name}: no change vs ${prev.label}${p.pocs.length ? ` — worth checking with ${p.pocs.join(' / ')}` : ''}.`);
      else if (a.logs.length && !b.logs.length && !/complete|cancel/i.test(p.status)) notes.push(`${p.name}: nothing logged in ${cur.label}.`);
    });
    const newOnes = chosen.filter((p) => isNewIn(p, logs, cur)).map((p) => p.name);
    if (newOnes.length) notes.push(`New in ${cur.label}: ${newOnes.join(', ')}.`);
    const done = projects.filter((p) => /complete/i.test(p.status) && p.updatedAt !== null && p.updatedAt >= cur.start && p.updatedAt < cur.end).map((p) => p.name);
    if (done.length) notes.push(`Completed in ${cur.label}: ${done.join(', ')}.`);
    if (tp || tc) notes.push(`Ad-Hoc volume ${fmtNum(tp)} → ${fmtNum(tc)} SKUs${pctText(tp, tc)} across ${fmtNum(tasksPrev.length)} → ${fmtNum(tasksCur.length)} tasks.`);

    const summary = done.length
      ? `Our revamp tasks for ${done.join(', ')} have been completed. ${chosen.length} REVAMP project(s) reported for ${cur.label}.`
      : `${chosen.length} REVAMP project(s) reported for ${cur.label}; Governance handled ${fmtNum(tc)} SKUs in ${fmtNum(tasksCur.length)} Ad-Hoc tasks (${fmtNum(tp)} in ${prev.label}).`;
    return { byType, byPerson, projBlocks, glance, notes, summary };
  }, [adhoc, projects, logs, prev, cur, s.pick]);

  const blocks: ReportBlock[] = useMemo(() => {
    const list = [...model.projBlocks];
    if (s.showAdhocType) list.push(model.byType);
    if (s.showAdhocPerson) list.push(model.byPerson);
    return list.map((b) => {
      const e = edits[b.id];
      return { ...b, title: e?.title ?? b.title, note: e?.note !== undefined ? e.note || undefined : b.note };
    });
  }, [model, s.showAdhocType, s.showAdhocPerson, edits]);

  const summary = summaryEdit ?? model.summary;
  const notes = (notesEdit ?? model.notes.join('\n')).split('\n').map((x) => x.trim()).filter(Boolean);
  const title = `Product Governance — ${comparisonTitle(prev, cur)}`;
  const footer = `Reporting Period: ${prev.label} – ${cur.label}, ${cur.year}  |  Governance Team  |  Generated ${fmtDate(generatedAt, true)}${gov ? ` from “${gov.spreadsheetTitle}”` : ''}`;
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
    for (const b of blocks) {
      rows.push([b.tag ? `${b.title} · ${b.tag}` : b.title]);
      rows.push(b.head.map((x) => x.replace('\n', ' ')));
      b.rows.forEach((r) => rows.push(r));
      if (b.total) rows.push(b.total);
      if (b.note) rows.push([b.note]);
      rows.push([]);
    }
    rows.push(['Key Notes']);
    notes.forEach((n) => rows.push([n]));
    const w = Math.max(...rows.map((r) => r.length));
    await exportXlsx(`product-governance-${prev.short}-vs-${cur.short}-${stamp()}.xlsx`, 'Product Governance', Array(w).fill(''), rows.map((r) => [...r, ...Array(w - r.length).fill(null)]));
  };

  const downloadPptx = async () => {
    setPptBusy(true);
    try {
      const { downloadGovernancePptx } = await import('../../utils/governancePptx');
      await downloadGovernancePptx({
        fileName: `product-governance-${prev.short}-vs-${cur.short}-${stamp()}.pptx`.replace(/\s+/g, '-'),
        title,
        summary,
        blocks,
        notes,
        glance: s.showGlance ? { title: `${prev.short} → ${cur.short}`, items: model.glance, footer: `${prev.short}: ${prev.range}\n${cur.short}: ${cur.range}` } : null,
        footer,
      });
    } finally {
      setPptBusy(false);
    }
  };

  const editBlock = editing ? blocks.find((b) => b.id === editing) : null;
  const auto = editing ? [...model.projBlocks, model.byType, model.byPerson].find((b) => b.id === editing) : null;

  return (
    <div className="rb-layout">
      <Card title="Report settings" subtitle="REVAMP projects (Projects / Project Progress tabs) + Ad-Hoc tasks (Main tab)">
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

          <div className="rb-group">
            <span className="rb-label">Blocks on the slide</span>
            {projects.length === 0 && <span className="muted" style={{ fontSize: 12.5 }}>No REVAMP projects yet — create them on the REVAMP Projects page.</span>}
            <div className="rb-checks" style={{ maxHeight: 240 }}>
              {projects.map((p) => (
                <label key={p.id}>
                  <input type="checkbox" checked={included(p)} onChange={(e) => update({ pick: { ...s.pick, [p.id]: e.target.checked } })} />
                  <span style={{ flex: 1 }}>
                    {p.name}
                    <span className="meta"> · {p.layout}</span>
                  </span>
                  <button type="button" className="rb-link" onClick={() => setEditing(p.id)}>
                    edit text
                  </button>
                </label>
              ))}
              <label>
                <input type="checkbox" checked={s.showAdhocType} onChange={(e) => update({ showAdhocType: e.target.checked })} />
                <span style={{ flex: 1 }}>Ad-Hoc Tasks by type</span>
                <button type="button" className="rb-link" onClick={() => setEditing('adhoc-type')}>
                  edit text
                </button>
              </label>
              <label>
                <input type="checkbox" checked={s.showAdhocPerson} onChange={(e) => update({ showAdhocPerson: e.target.checked })} />
                <span style={{ flex: 1 }}>Ad-Hoc Tasks by person</span>
                <button type="button" className="rb-link" onClick={() => setEditing('adhoc-person')}>
                  edit text
                </button>
              </label>
            </div>
            {Object.keys(s.pick).length > 0 && (
              <button type="button" className="rb-link" style={{ alignSelf: 'flex-start' }} onClick={() => update({ pick: {} })}>
                Reset to default selection
              </button>
            )}
          </div>

          {editBlock && auto && (
            <div className="rb-group gov-edit-block">
              <span className="rb-label">Edit block · {auto.title}</span>
              <label className="field">
                <span>Title</span>
                <input className="input" value={editBlock.title} onChange={(e) => setEdits({ ...edits, [auto.id]: { ...edits[auto.id], title: e.target.value } })} />
              </label>
              <label className="field">
                <span>Note under the table</span>
                <textarea className="rb-textarea" style={{ minHeight: 60 }} value={editBlock.note ?? ''} onChange={(e) => setEdits({ ...edits, [auto.id]: { ...edits[auto.id], note: e.target.value } })} />
              </label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-sm" onClick={() => setEditing(null)}>
                  Done
                </button>
                {edits[auto.id] && (
                  <button
                    type="button"
                    className="rb-link"
                    onClick={() => {
                      const next = { ...edits };
                      delete next[auto.id];
                      setEdits(next);
                    }}
                  >
                    Reset to the sheet's text
                  </button>
                )}
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                Edits stay in this browser and only change the report. To change the project itself, use Edit on the REVAMP Projects page (saved to Google Sheets).
              </span>
            </div>
          )}

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
            <button type="button" className="btn btn-sm" onClick={downloadPptx} disabled={pptBusy} title="Editable PowerPoint file">
              <Icon name="download" size={14} /> {pptBusy ? 'Building…' : 'PowerPoint'}
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
                <div className={`rs-grid gov ${s.showGlance ? '' : 'no-glance'}`}>
                  <div className="rs-flow">
                    {blocks.length === 0 && <div className="rs-muted">No blocks selected.</div>}
                    {blocks.map((b) => (
                      <Block key={b.id} b={b} />
                    ))}
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
                <footer className="rs-footer">{footer}</footer>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
