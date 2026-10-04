/**
 * "+ New project" / Edit: start from a template, design the table (columns, rows,
 * compare mode, totals, target), choose the report(s) and an At a Glance line,
 * and see a live preview of the report block while editing.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { LAYOUT_HELP, PROJECT_PRIORITIES, PROJECT_REPORTS, PROJECT_STATUSES, PROJECT_WORK_TYPES, REPORT_LAYOUTS, type ProjectReports, type ReportLayout } from '../../config/governance.config';
import { PROJECT_TEMPLATES, type GlanceSpec, type Project, type TableColumn } from '../../utils/governance';
import { projectBlock } from '../../utils/governanceReport';
import { comparisonPeriod, periodContaining } from '../../utils/periods';
import { toIsoDate } from '../../utils/format';
import { Banner } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { Block } from '../../components/report/ReportBlock';
import type { CellValue } from '../../types';

type Row = Record<string, CellValue>;
const today = () => toIsoDate(Date.now());

interface FormState {
  name: string;
  workType: string;
  description: string;
  pocs: string[];
  assignees: string[];
  totalSkus: string;
  startDate: string;
  dueDate: string;
  status: string;
  priority: string;
  foundLabel: string;
  layout: ReportLayout;
  lineHeader: string;
  lines: string;
  valueMode: 'Sum' | 'Latest';
  reportNote: string;
  showInReport: boolean;
  columns: TableColumn[];
  rowsFrom: 'Lines' | 'Team';
  compare: 'Weeks' | 'This period';
  showDelta: boolean;
  totalLabel: string;
  target: string;
  reports: ProjectReports;
  glanceOn: boolean;
  glance: GlanceSpec;
}

function initialState(p: Project | null): FormState {
  return {
    name: p?.name ?? '',
    workType: p?.workType ?? '',
    description: p?.description ?? '',
    pocs: p?.pocs ?? [],
    assignees: p?.assignees ?? [],
    totalSkus: p?.totalSkus != null ? String(p.totalSkus) : '',
    startDate: p?.startDate || today(),
    dueDate: p?.dueDate ?? '',
    status: p?.status ?? 'Planned',
    priority: p?.priority ?? 'Medium',
    foundLabel: p?.foundLabel && p.foundLabel !== 'Issues found' ? p.foundLabel : '',
    layout: p?.layout ?? 'Custom table',
    lineHeader: p?.lineHeader ?? 'Name',
    lines: (p?.lines ?? []).join('\n'),
    valueMode: p?.valueMode ?? 'Sum',
    reportNote: p?.reportNote ?? '',
    showInReport: p?.showInReport ?? true,
    columns: p?.columns.length ? p.columns : [{ label: 'Done', kind: 'number' }],
    rowsFrom: p?.rowsFrom ?? 'Lines',
    compare: p?.compare ?? 'Weeks',
    showDelta: p?.showDelta ?? true,
    totalLabel: p?.totalLabel ?? 'Total',
    target: p?.target != null ? String(p.target) : '',
    reports: p?.reports ?? 'Governance',
    glanceOn: !!p?.glance,
    glance: p?.glance ?? { label: '', col: '', extra: [] },
  };
}

export function ProjectForm({ initial, people, onClose, onSave }: { initial: Project | null; people: string[]; onClose: () => void; onSave: (row: Row) => Promise<void> }) {
  const [f, setF] = useState<FormState>(() => initialState(initial));
  const [picked, setPicked] = useState<string | null>(initial ? 'edit' : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const up = (patch: Partial<FormState>) => setF((x) => ({ ...x, ...patch }));
  const choices = useMemo(() => [...new Set([...people, ...f.pocs, ...f.assignees])].sort((x, y) => x.localeCompare(y)), [people, f.pocs, f.assignees]);
  const toggle = (list: string[], p: string, on: boolean) => (on ? [...list.filter((x) => x !== p), p] : list.filter((x) => x !== p));
  const custom = f.layout === 'Custom table';
  const help = LAYOUT_HELP[f.layout];

  const useTemplate = (id: string) => {
    const t = PROJECT_TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    const a = t.apply;
    setF((x) => ({
      ...x,
      ...(a.layout ? { layout: a.layout } : {}),
      ...(a.lineHeader ? { lineHeader: a.lineHeader } : {}),
      lines: a.lines ?? (a.rowsFrom === 'Team' ? '' : x.lines),
      ...(a.columns ? { columns: a.columns.map((c) => ({ ...c })) } : {}),
      ...(a.rowsFrom ? { rowsFrom: a.rowsFrom } : {}),
      ...(a.compare ? { compare: a.compare } : {}),
      ...(a.showDelta !== undefined ? { showDelta: a.showDelta } : {}),
      ...(a.totalLabel !== undefined ? { totalLabel: a.totalLabel } : {}),
      ...(a.target !== undefined ? { target: a.target } : {}),
      ...(a.valueMode ? { valueMode: a.valueMode } : {}),
      ...(a.reports ? { reports: a.reports } : {}),
      glanceOn: !!a.glance,
      glance: a.glance ? { ...a.glance, extra: [...a.glance.extra] } : x.glance,
    }));
    setPicked(id);
  };

  // Column editing
  const setCol = (i: number, patch: Partial<TableColumn>) => up({ columns: f.columns.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const moveCol = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= f.columns.length) return;
    const next = [...f.columns];
    [next[i], next[j]] = [next[j], next[i]];
    up({ columns: next });
  };
  const colLabels = f.columns.map((c) => c.label.trim()).filter(Boolean);

  /** The project as it would be saved — used for the live preview. */
  const draft: Project = useMemo(
    () => ({
      id: 'PREVIEW',
      createdAt: null,
      name: f.name.trim() || 'Project name',
      workType: f.workType,
      description: f.description,
      pocs: f.pocs,
      poc: f.pocs.join(' / '),
      assignees: f.assignees,
      totalSkus: f.totalSkus ? Number(f.totalSkus.replace(/,/g, '')) || null : null,
      startDate: f.startDate,
      dueDate: f.dueDate,
      status: f.status,
      priority: f.priority,
      foundLabel: f.foundLabel || 'Issues found',
      updatedAt: null,
      updatedBy: '',
      layout: f.layout,
      lineHeader: f.lineHeader || help.lineHeader,
      lines: f.lines.split(/[;\n]/).map((x) => x.trim()).filter(Boolean),
      valueMode: f.valueMode,
      reportNote: f.reportNote,
      showInReport: f.showInReport,
      reports: f.reports,
      glance: f.glanceOn && f.glance.label ? f.glance : null,
      columns: f.columns.filter((c) => c.label.trim()),
      rowsFrom: f.rowsFrom,
      compare: f.compare,
      showDelta: f.showDelta,
      totalLabel: f.totalLabel,
      target: f.target ? Number(f.target.replace(/,/g, '')) || null : null,
    }),
    [f, help.lineHeader],
  );
  const preview = useMemo(() => {
    const cur = periodContaining('week', Date.now());
    return projectBlock(draft, [], comparisonPeriod(cur, 'previous'), cur);
  }, [draft]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Project name is required.');
    if (f.totalSkus && !/^\d[\d,]*$/.test(f.totalSkus.trim())) return setErr('Total SKUs must be a whole number.');
    if (f.target && !/^\d[\d,]*$/.test(f.target.trim())) return setErr('Target must be a whole number.');
    if (f.dueDate && f.startDate && f.dueDate < f.startDate) return setErr('Due date is before the start date.');
    if (custom) {
      if (!colLabels.length) return setErr('Add at least one column.');
      if (new Set(colLabels.map((c) => c.toLowerCase())).size !== colLabels.length) return setErr('Column names must be different.');
      if (!f.columns.some((c) => c.kind === 'number' && c.label.trim())) return setErr('Add at least one number column (a “Total” column adds them up).');
      if (f.rowsFrom === 'Team' && !f.assignees.length && !f.pocs.length) return setErr('Rows come from the team: tick at least one person under People.');
    }
    const lines = [...new Set(f.lines.split(/[;\n]/).map((x) => x.trim()).filter(Boolean))];
    if (lines.length > 40) return setErr('Use at most 40 rows.');
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        'Project Name': f.name.trim(),
        'Work Type': f.workType.trim(),
        Description: f.description.trim(),
        POC: f.pocs.join(', '),
        Assignees: f.assignees.join(', '),
        'Total SKUs': f.totalSkus ? Number(f.totalSkus.replace(/,/g, '')) : '',
        'Start Date': f.startDate,
        'Due Date': f.dueDate,
        Status: f.status,
        Priority: f.priority,
        'Found Label': f.foundLabel.trim() || (f.layout === 'Reviewed / Found / Updated' ? 'Issues found' : ''),
        'Report Layout': f.layout,
        'Line Header': f.lineHeader.trim() || help.lineHeader,
        Lines: lines.join('; '),
        'Value Mode': f.valueMode,
        'Report Note': f.reportNote.trim(),
        'Show In Report': f.showInReport ? 'Yes' : 'No',
        Columns: custom ? JSON.stringify(f.columns.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), kind: c.kind }))) : '',
        Rows: f.rowsFrom,
        Compare: f.compare,
        'Show Delta': f.showDelta ? 'Yes' : 'No',
        'Total Label': f.totalLabel.trim(),
        Target: f.target ? Number(f.target.replace(/,/g, '')) : '',
        Reports: f.reports,
        Glance: f.glanceOn && f.glance.label.trim() ? JSON.stringify({ label: f.glance.label.trim(), col: f.glance.col, extra: f.glance.extra }) : '',
      });
      onClose();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const glanceCols = custom ? colLabels : draft.layout === 'Reviewed / Found / Updated' ? ['Reviewed', draft.foundLabel, 'Updated'] : draft.layout === 'Working / Updated' ? [f.foundLabel || 'Working', 'Updated'] : [f.foundLabel || (draft.layout === 'Count' ? 'Count' : 'Count of SKUs')];

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <form className="drawer gov-form gov-form-wide" role="dialog" aria-label={initial ? 'Edit project' : 'New project'} onSubmit={submit}>
        <div className="drawer-head">
          <h3>{initial ? `Edit · ${initial.name}` : 'New project'}</h3>
          <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="drawer-body gov-form-body">
          {/* 1 — template */}
          <div className="gov-form-section">{initial ? 'Change the table type (optional)' : '1 · Start from a template'}</div>
          <div className="pf-templates">
            {PROJECT_TEMPLATES.map((t) => (
              <button type="button" key={t.id} className={`pf-tpl ${picked === t.id ? 'on' : ''}`} onClick={() => useTemplate(t.id)}>
                <b>{t.title}</b>
                <span>{t.hint}</span>
              </button>
            ))}
          </div>

          {/* 2 — project */}
          <div className="gov-form-section">2 · Project</div>
          <label className="field">
            <span>Project name * (block title)</span>
            <input className="input" value={f.name} onChange={(e) => up({ name: e.target.value })} placeholder="e.g. Search Keyword Error Checking" autoFocus={!initial} />
          </label>
          <div className="gov-2col">
            <label className="field">
              <span>Work type</span>
              <input className="input" list="gov-work-types" value={f.workType} onChange={(e) => up({ workType: e.target.value })} placeholder="Choose or type" />
              <datalist id="gov-work-types">
                {PROJECT_WORK_TYPES.map((w) => (
                  <option key={w} value={w} />
                ))}
              </datalist>
            </label>
            <label className="field">
              <span>Status</span>
              <select className="select" value={f.status} onChange={(e) => up({ status: e.target.value })}>
                {PROJECT_STATUSES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Start date</span>
              <input type="date" className="input" value={f.startDate} onChange={(e) => up({ startDate: e.target.value })} />
            </label>
            <label className="field">
              <span>Due date</span>
              <input type="date" className="input" value={f.dueDate} onChange={(e) => up({ dueDate: e.target.value })} />
            </label>
            <label className="field">
              <span>Total SKUs in scope (optional)</span>
              <input className="input" inputMode="numeric" value={f.totalSkus} onChange={(e) => up({ totalSkus: e.target.value })} placeholder="e.g. 737503" />
            </label>
            <label className="field">
              <span>Priority</span>
              <select className="select" value={f.priority} onChange={(e) => up({ priority: e.target.value })}>
                {PROJECT_PRIORITIES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Description / scope</span>
            <textarea className="rb-textarea" style={{ minHeight: 56 }} value={f.description} onChange={(e) => up({ description: e.target.value })} placeholder="What will be checked or fixed" />
          </label>

          {/* 3 — people */}
          <div className="gov-form-section">3 · People</div>
          <div className="gov-people">
            <div className="gov-people-head">
              <span>Name</span>
              <span>POC</span>
              <span>Assigned</span>
            </div>
            {choices.map((p) => (
              <div key={p} className="gov-people-row">
                <span>{p}</span>
                <input type="checkbox" aria-label={`${p} is POC`} checked={f.pocs.includes(p)} onChange={(e) => up({ pocs: toggle(f.pocs, p, e.target.checked) })} />
                <input type="checkbox" aria-label={`Assign ${p}`} checked={f.assignees.includes(p)} onChange={(e) => up({ assignees: toggle(f.assignees, p, e.target.checked) })} />
              </div>
            ))}
          </div>

          {/* 4 — table */}
          <div className="gov-form-section">4 · Table</div>
          <div className="gov-2col">
            <label className="field">
              <span>Table type</span>
              <select className="select" value={f.layout} onChange={(e) => up({ layout: e.target.value as ReportLayout, lineHeader: f.lineHeader || LAYOUT_HELP[e.target.value as ReportLayout].lineHeader })}>
                {REPORT_LAYOUTS.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>First column header</span>
              <input className="input" value={f.lineHeader} onChange={(e) => up({ lineHeader: e.target.value })} placeholder={help.lineHeader} />
            </label>
          </div>

          {custom && (
            <>
              <div className="field">
                <span>Columns</span>
                <div className="pf-cols">
                  {f.columns.map((c, i) => (
                    <div className="pf-col" key={i}>
                      <input className="input" value={c.label} onChange={(e) => setCol(i, { label: e.target.value })} placeholder={`Column ${i + 1}`} aria-label={`Column ${i + 1} name`} />
                      <select className="select" value={c.kind} onChange={(e) => setCol(i, { kind: e.target.value as TableColumn['kind'] })} aria-label={`Column ${i + 1} type`}>
                        <option value="number">Number (entered)</option>
                        <option value="total">Total of the number columns</option>
                      </select>
                      <button type="button" className="icon-btn" onClick={() => moveCol(i, -1)} disabled={i === 0} aria-label="Move up" title="Move up">
                        ↑
                      </button>
                      <button type="button" className="icon-btn" onClick={() => moveCol(i, 1)} disabled={i === f.columns.length - 1} aria-label="Move down" title="Move down">
                        ↓
                      </button>
                      <button type="button" className="icon-btn" onClick={() => up({ columns: f.columns.filter((_, j) => j !== i) })} disabled={f.columns.length === 1} aria-label="Remove column" title="Remove">
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  ))}
                  {f.columns.length < 12 && (
                    <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => up({ columns: [...f.columns, { label: '', kind: 'number' }] })}>
                      + Add column
                    </button>
                  )}
                </div>
              </div>
              <div className="gov-2col">
                <label className="field">
                  <span>Rows are</span>
                  <select className="select" value={f.rowsFrom} onChange={(e) => up({ rowsFrom: e.target.value as 'Lines' | 'Team' })}>
                    <option value="Lines">A list I type (items / metrics)</option>
                    <option value="Team">The assigned people (one row each)</option>
                  </select>
                </label>
                <label className="field">
                  <span>Compare</span>
                  <select className="select" value={f.compare} onChange={(e) => up({ compare: e.target.value as 'Weeks' | 'This period' })}>
                    <option value="Weeks">Previous vs current period (W38 | W39)</option>
                    <option value="This period">Current period only</option>
                  </select>
                </label>
                <label className="field">
                  <span>Total row label (empty = no total row)</span>
                  <input className="input" value={f.totalLabel} onChange={(e) => up({ totalLabel: e.target.value })} placeholder="Total / Unique Total / Grand Total" />
                </label>
                <label className="field">
                  <span>Target (optional, shown in the title)</span>
                  <input className="input" inputMode="numeric" value={f.target} onChange={(e) => up({ target: e.target.value })} placeholder="e.g. 1000" />
                </label>
              </div>
              {f.compare === 'Weeks' && (
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
                  <input type="checkbox" checked={f.showDelta} onChange={(e) => up({ showDelta: e.target.checked })} /> Show a Δ (change) column for the last column
                </label>
              )}
            </>
          )}

          {(!custom || f.rowsFrom === 'Lines') && (
            <label className="field">
              <span>Rows — one per line (leave empty for a single row)</span>
              <textarea className="rb-textarea" value={f.lines} onChange={(e) => up({ lines: e.target.value })} placeholder={help.example.split('; ').join('\n') || 'e.g. SKUs Reviewed\nWrong Category Found'} />
            </label>
          )}
          <div className="gov-2col">
            {!custom && (
              <label className="field">
                <span>{f.layout === 'Reviewed / Found / Updated' ? 'Name of the “found” number' : 'Name of the number column'}</span>
                <input className="input" value={f.foundLabel} onChange={(e) => up({ foundLabel: e.target.value })} placeholder={f.layout === 'Working / Updated' ? 'Working (or Worked)' : 'Issues found'} />
              </label>
            )}
            <label className="field">
              <span>Numbers in a week / month are</span>
              <select className="select" value={f.valueMode} onChange={(e) => up({ valueMode: e.target.value as 'Sum' | 'Latest' })}>
                <option value="Sum">The sum of all entries (daily work)</option>
                <option value="Latest">The latest entry (running totals)</option>
              </select>
            </label>
          </div>

          {/* 5 — report */}
          <div className="gov-form-section">5 · Report</div>
          <div className="gov-2col">
            <label className="field">
              <span>Show in</span>
              <select className="select" value={f.reports} onChange={(e) => up({ reports: e.target.value as ProjectReports })}>
                {PROJECT_REPORTS.map((r) => (
                  <option key={r} value={r}>
                    {r === 'Governance' ? 'Product Governance report' : r === 'Both' ? 'Both reports' : 'Individual Summary report'}
                  </option>
                ))}
              </select>
            </label>
            <label className="field" style={{ justifyContent: 'flex-end' }}>
              <span>&nbsp;</span>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={f.showInReport} onChange={(e) => up({ showInReport: e.target.checked })} /> Include in reports
              </label>
            </label>
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <input type="checkbox" checked={f.glanceOn} onChange={(e) => up({ glanceOn: e.target.checked, glance: { ...f.glance, label: f.glance.label || f.name, col: f.glance.col || glanceCols[glanceCols.length - 1] || '' } })} /> Add an
            “At a Glance” line
          </label>
          {f.glanceOn && (
            <div className="gov-2col">
              <label className="field">
                <span>Glance label</span>
                <input className="input" value={f.glance.label} onChange={(e) => up({ glance: { ...f.glance, label: e.target.value } })} placeholder="e.g. Keyword Check" />
              </label>
              <label className="field">
                <span>Main number</span>
                <select className="select" value={f.glance.col} onChange={(e) => up({ glance: { ...f.glance, col: e.target.value } })}>
                  {glanceCols.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              {glanceCols.length > 1 && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <span>Also show (small)</span>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13.5 }}>
                    {glanceCols
                      .filter((c) => c !== f.glance.col)
                      .map((c) => (
                        <label key={c} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={f.glance.extra.includes(c)}
                            onChange={(e) => up({ glance: { ...f.glance, extra: e.target.checked ? [...f.glance.extra, c] : f.glance.extra.filter((x) => x !== c) } })}
                          />
                          {c}
                        </label>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <label className="field">
            <span>Note under the table (optional)</span>
            <textarea className="rb-textarea" style={{ minHeight: 50 }} value={f.reportNote} onChange={(e) => up({ reportNote: e.target.value })} placeholder="e.g. Weight Check: verifying and correcting product weights." />
          </label>

          {/* preview */}
          <div className="gov-form-section">Preview (numbers appear once progress is logged)</div>
          <div className="pf-preview report-slide">
            <Block b={preview} />
          </div>

          {err && <Banner tone="bad">{err}</Banner>}
        </div>
        <div className="gov-form-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving to Google Sheets…' : initial ? 'Save changes' : 'Create project'}
          </button>
        </div>
      </form>
    </>
  );
}
