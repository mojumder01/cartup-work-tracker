import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { LAYOUT_HELP, PROJECT_PRIORITIES, PROJECT_STATUSES, PROJECT_WORK_TYPES, REPORT_LAYOUTS, type ReportLayout } from '../config/governance.config';
import { useApp } from '../hooks/AppContext';
import { useGovernance } from '../hooks/useGovernance';
import { metricLabels, newId, projectStats, type Project, type ProjectStats } from '../utils/governance';
import { fmtDate, fmtNum, fmtPct, fmtRelative, toIsoDate } from '../utils/format';
import { Banner, Card, EmptyState, ErrorState, KpiCard, Meter, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import type { CellValue } from '../types';

type Row = Record<string, CellValue>;

const STATUS_TONE: Record<string, string> = { Planned: 'info', 'In Progress': 'warn', 'On Hold': '', Completed: 'good', Cancelled: 'bad' };
const StatusBadge = ({ s }: { s: string }) => <span className={`badge ${STATUS_TONE[s] ?? ''}`}>{s}</span>;
const today = () => toIsoDate(Date.now());

function usePeople() {
  const { roster } = useApp();
  const { adhoc } = useGovernance();
  return useMemo(() => {
    const set = new Set<string>();
    roster.filter((p) => p.status === 'Active').forEach((p) => set.add(p.name));
    adhoc?.tasks.forEach((t) => t.person && set.add(t.person));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [roster, adhoc]);
}

/* ------------------------------------------------------------------ */
/* Create / edit form                                                  */
/* ------------------------------------------------------------------ */

const layoutDefaults = (l: ReportLayout) => LAYOUT_HELP[l];

function ProjectForm({ initial, onClose, onSave }: { initial: Project | null; onClose: () => void; onSave: (row: Row) => Promise<void> }) {
  const people = usePeople();
  const [f, setF] = useState(() => ({
    name: initial?.name ?? '',
    workType: initial?.workType ?? '',
    description: initial?.description ?? '',
    pocs: initial?.pocs ?? [],
    assignees: initial?.assignees ?? [],
    totalSkus: initial?.totalSkus != null ? String(initial.totalSkus) : '',
    startDate: initial?.startDate || today(),
    dueDate: initial?.dueDate ?? '',
    status: initial?.status ?? 'Planned',
    priority: initial?.priority ?? 'Medium',
    foundLabel: initial?.foundLabel && initial.foundLabel !== 'Issues found' ? initial.foundLabel : '',
    layout: (initial?.layout ?? 'Working / Updated') as ReportLayout,
    lineHeader: initial?.lineHeader ?? layoutDefaults('Working / Updated').lineHeader,
    lines: (initial?.lines ?? []).join('\n'),
    valueMode: initial?.valueMode ?? 'Sum',
    reportNote: initial?.reportNote ?? '',
    showInReport: initial?.showInReport ?? true,
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const up = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  // People listed in the project but no longer in the roster stay selectable.
  const choices = useMemo(() => [...new Set([...people, ...f.pocs, ...f.assignees])].sort((x, y) => x.localeCompare(y)), [people, f.pocs, f.assignees]);
  const toggle = (list: string[], p: string, on: boolean) => (on ? [...list.filter((x) => x !== p), p] : list.filter((x) => x !== p));
  const setLayout = (layout: ReportLayout) => {
    const oldDefault = layoutDefaults(f.layout).lineHeader;
    up({ layout, lineHeader: !f.lineHeader || f.lineHeader === oldDefault ? layoutDefaults(layout).lineHeader : f.lineHeader });
  };
  const help = layoutDefaults(f.layout);
  const firstLabel = f.layout === 'Reviewed / Found / Updated' ? 'Name of the “found” number' : 'Name of the number column';
  const firstPlaceholder =
    f.layout === 'Reviewed / Found / Updated' ? 'Issues found (e.g. Wrong Category Found)' : f.layout === 'Working / Updated' ? 'Working (or Worked)' : f.layout === 'Count' ? 'Count' : 'Count of SKUs';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Project name is required.');
    if (f.totalSkus && !/^\d[\d,]*$/.test(f.totalSkus.trim())) return setErr('Total SKUs must be a whole number.');
    if (f.dueDate && f.startDate && f.dueDate < f.startDate) return setErr('Due date is before the start date.');
    const lines = [...new Set(f.lines.split(/[;\n]/).map((x) => x.trim()).filter(Boolean))];
    if (lines.length > 30) return setErr('Use at most 30 report lines.');
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        'Project Name': f.name.trim(),
        'Work Type': f.workType.trim(),
        Description: f.description.trim(),
        POC: f.pocs.join(', '),
        Assignees: [...new Set([...f.assignees])].join(', '),
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
      });
      onClose();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <form className="drawer gov-form" role="dialog" aria-label={initial ? 'Edit project' : 'New project'} onSubmit={submit}>
        <div className="drawer-head">
          <h3>{initial ? `Edit · ${initial.name}` : 'New REVAMP project'}</h3>
          <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="drawer-body gov-form-body">
          <div className="gov-form-section">Project</div>
          <label className="field">
            <span>Project name * (report block title)</span>
            <input className="input" value={f.name} onChange={(e) => up({ name: e.target.value })} placeholder="e.g. QC Rejected Inactive to Live" autoFocus />
          </label>
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
            <span>Description / scope</span>
            <textarea className="rb-textarea" value={f.description} onChange={(e) => up({ description: e.target.value })} placeholder="What will be reviewed and fixed" />
          </label>
          <div className="gov-2col">
            <label className="field">
              <span>Total SKUs (scope)</span>
              <input className="input" inputMode="numeric" value={f.totalSkus} onChange={(e) => up({ totalSkus: e.target.value })} placeholder="e.g. 101402" />
            </label>
            <label className="field">
              <span>Priority</span>
              <select className="select" value={f.priority} onChange={(e) => up({ priority: e.target.value })}>
                {PROJECT_PRIORITIES.map((x) => (
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
              <span>Status</span>
              <select className="select" value={f.status} onChange={(e) => up({ status: e.target.value })}>
                {PROJECT_STATUSES.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="gov-form-section">People</div>
          <div className="field">
            <span>POC and team — tick POC for the owner(s) shown in the report (“POC: Limon / Muntasir”)</span>
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
                  <input
                    type="checkbox"
                    aria-label={`Assign ${p}`}
                    checked={f.assignees.includes(p)}
                    onChange={(e) => up({ assignees: toggle(f.assignees, p, e.target.checked) })}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="gov-form-section">Report block (Product Governance slide)</div>
          <label className="field">
            <span>Table type</span>
            <select className="select" value={f.layout} onChange={(e) => setLayout(e.target.value as ReportLayout)}>
              {REPORT_LAYOUTS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
          <div className="gov-2col">
            <label className="field">
              <span>First column header</span>
              <input className="input" value={f.lineHeader} onChange={(e) => up({ lineHeader: e.target.value })} placeholder={help.lineHeader} />
            </label>
            <label className="field">
              <span>{firstLabel}</span>
              <input className="input" value={f.foundLabel} onChange={(e) => up({ foundLabel: e.target.value })} placeholder={firstPlaceholder} />
            </label>
          </div>
          <label className="field">
            <span>Report lines — one per row (leave empty for a single line)</span>
            <textarea className="rb-textarea" value={f.lines} onChange={(e) => up({ lines: e.target.value })} placeholder={help.example.split('; ').join('\n') || 'e.g. Deep Category'} />
          </label>
          <div className="gov-2col">
            <label className="field">
              <span>Numbers in a week / month are</span>
              <select className="select" value={f.valueMode} onChange={(e) => up({ valueMode: e.target.value as 'Sum' | 'Latest' })}>
                <option value="Sum">Sum of the entries (daily work)</option>
                <option value="Latest">Latest entry (running total)</option>
              </select>
            </label>
            <label className="field" style={{ justifyContent: 'flex-end' }}>
              <span>&nbsp;</span>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="checkbox" checked={f.showInReport} onChange={(e) => up({ showInReport: e.target.checked })} />
                Show in the governance report
              </label>
            </label>
          </div>
          <label className="field">
            <span>Report note (shown under the block)</span>
            <textarea
              className="rb-textarea"
              style={{ minHeight: 60 }}
              value={f.reportNote}
              onChange={(e) => up({ reportNote: e.target.value })}
              placeholder="e.g. Product Name: title length/tag cleanup. Image Check: background & low-res cleanup."
            />
          </label>
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

/* ------------------------------------------------------------------ */
/* Project detail                                                      */
/* ------------------------------------------------------------------ */

function ProgressForm({ project, onSave }: { project: Project; onSave: (rows: Row[]) => Promise<void> }) {
  const { who } = useGovernance();
  const people = usePeople();
  const choices = project.assignees.length || project.pocs.length ? [...new Set([...project.assignees, ...project.pocs])] : people;
  const lines = project.lines.length ? project.lines : [''];
  const fields = metricLabels(project);
  const blank = () => Object.fromEntries(lines.map((l) => [l, { reviewed: '', found: '', updated: '' }])) as Record<string, Record<'reviewed' | 'found' | 'updated', string>>;
  const [f, setF] = useState({ date: today(), person: choices.includes(who) ? who : choices[0] ?? '', note: '' });
  const [vals, setVals] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'bad' | 'warn'; text: string } | null>(null);
  const n = (s: string) => (s.trim() ? Number(s.replace(/,/g, '')) : 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const all = lines.flatMap((l) => fields.map((k) => vals[l]?.[k.key] ?? ''));
    if (all.some((v) => v.trim() && !/^\d[\d,]*$/.test(v.trim()))) return setMsg({ tone: 'bad', text: 'Counts must be whole numbers.' });
    if (all.every((v) => !v.trim())) return setMsg({ tone: 'bad', text: 'Enter at least one count.' });
    if (!f.person) return setMsg({ tone: 'bad', text: 'Choose who did the work.' });
    const rows: Row[] = lines
      .filter((l) => fields.some((k) => (vals[l]?.[k.key] ?? '').trim()))
      .map((l) => ({
        'Log ID': newId('LOG'),
        'Project ID': project.id,
        Date: f.date,
        Person: f.person,
        Line: l,
        Reviewed: n(vals[l].reviewed),
        Found: n(vals[l].found),
        Updated: n(vals[l].updated),
        Note: f.note.trim(),
      }));
    setBusy(true);
    setMsg(null);
    try {
      await onSave(rows);
      setVals(blank());
      setF({ ...f, note: '' });
      setMsg({ tone: 'warn', text: `Saved ${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} to the Governance sheet.` });
    } catch (e2) {
      setMsg({ tone: 'bad', text: (e2 as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="gov-log-form">
      <div className="gov-log-grid">
        <label className="field">
          <span>Date</span>
          <input type="date" className="input" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} />
        </label>
        <label className="field">
          <span>Worked by</span>
          <select className="select" value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })}>
            {choices.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      <table className="data gov-log-table">
        <thead>
          <tr>
            <th>{project.lineHeader}</th>
            {fields.map((k) => (
              <th key={k.key} className="n">
                {k.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l || '_'}>
              <td>{l || project.name}</td>
              {fields.map((k) => (
                <td key={k.key} className="n">
                  <input
                    className="input"
                    inputMode="numeric"
                    aria-label={`${l || project.name} ${k.label}`}
                    value={vals[l]?.[k.key] ?? ''}
                    onChange={(e) => setVals({ ...vals, [l]: { ...vals[l], [k.key]: e.target.value } })}
                    placeholder="0"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {project.valueMode === 'Latest' && <div className="muted" style={{ fontSize: 12 }}>This project uses running totals: enter the current total for each line, not today's increase.</div>}
      <label className="field">
        <span>Note</span>
        <input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" />
      </label>
      <div className="rb-actions" style={{ alignItems: 'center' }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Saving…' : 'Add progress'}
        </button>
        {msg && <span style={{ color: msg.tone === 'bad' ? 'var(--bad)' : 'var(--good)', fontSize: 13 }}>{msg.text}</span>}
      </div>
    </form>
  );
}

function ProjectDrawer({ project, stats, onClose, onEdit }: { project: Project; stats: ProjectStats; onClose: () => void; onEdit: () => void }) {
  const { writeUrl, updateProject, logProgress, deleteLog, adhoc } = useGovernance();
  const [err, setErr] = useState<string | null>(null);
  const labels = metricLabels(project);
  const hasLines = project.lines.length > 0 || stats.logs.some((l) => l.line);
  const related = useMemo(
    () => (adhoc?.tasks ?? []).filter((t) => t.project && t.project.toLowerCase() === project.name.toLowerCase()),
    [adhoc, project.name],
  );
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  const setStatus = async (status: string) => {
    try {
      setErr(null);
      await updateProject(project.id, { Status: status });
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer gov-drawer" role="dialog" aria-label={`Project ${project.name}`}>
        <div className="drawer-head">
          <div style={{ minWidth: 0 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              {project.workType || 'REVAMP project'} · {project.id}
            </div>
            <h3>{project.name}</h3>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            {writeUrl && (
              <button type="button" className="btn btn-sm" onClick={onEdit}>
                Edit
              </button>
            )}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 14 }}>
          {err && <Banner tone="bad">{err}</Banner>}
          <div className="gov-stat-row">
            <div>
              <div className="muted">Status</div>
              {writeUrl ? (
                <select className="select" style={{ height: 30, width: 150 }} value={project.status} onChange={(e) => setStatus(e.target.value)}>
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <StatusBadge s={project.status} />
              )}
            </div>
            <div>
              <div className="muted">POC</div>
              <b>{project.poc || '—'}</b>
            </div>
            <div>
              <div className="muted">Due</div>
              <b style={stats.overdue ? { color: 'var(--bad)' } : undefined}>{project.dueDate ? fmtDate(new Date(`${project.dueDate}T00:00:00`).getTime()) : '—'}</b>
            </div>
            <div>
              <div className="muted">Priority</div>
              <b>{project.priority}</b>
            </div>
          </div>
          {project.description && <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{project.description}</p>}
          <div>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>
              Team
            </div>
            <div className="roles">{project.assignees.length ? project.assignees.map((a) => <span className="badge info" key={a}>{a}</span>) : <span className="muted">Nobody assigned yet</span>}</div>
          </div>

          <dl className="kv">
            <dt>Total SKUs</dt>
            <dd>{fmtNum(project.totalSkus)}</dd>
            <dt>{labels[0].label}</dt>
            <dd>
              {fmtNum(stats.reviewed)}
              {project.totalSkus ? ` (${fmtPct(stats.progressPct)} of scope)` : ''}
            </dd>
            {labels.slice(1).map((k) => (
              <Fragment key={k.key}>
                <dt>{k.label}</dt>
                <dd>{fmtNum(stats[k.key])}</dd>
              </Fragment>
            ))}
            {project.layout !== 'Count' && project.layout !== 'Status breakdown' && (
              <>
                <dt>Pending</dt>
                <dd>
                  {fmtNum(stats.pending)} ({fmtPct(stats.fixPct)} done)
                </dd>
              </>
            )}
            <dt>Report</dt>
            <dd>
              {project.showInReport ? 'Shown' : 'Hidden'} · {project.layout} · {project.valueMode === 'Latest' ? 'latest entry per period' : 'sum per period'}
            </dd>
          </dl>
          {project.reportNote && (
            <p className="muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
              📝 {project.reportNote}
            </p>
          )}

          {(project.lines.length > 0 || project.layout === 'Status breakdown') && (
            <Card title="Report lines" subtitle={project.valueMode === 'Latest' ? 'Latest entry per line' : 'All entries added up'} bodyClassName="">
              <div className="table-wrap flush">
                <table className="data">
                  <thead>
                    <tr>
                      <th>{project.lineHeader}</th>
                      {labels.map((k) => (
                        <th className="n" key={k.key}>
                          {k.label}
                        </th>
                      ))}
                      <th className="n">Entries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.lines.map((l) => (
                      <tr key={l.line || '_'}>
                        <td>{l.line || project.name}</td>
                        {labels.map((k) => (
                          <td className="n" key={k.key}>
                            {fmtNum(l[k.key])}
                          </td>
                        ))}
                        <td className="n">{l.entries}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {writeUrl && (
            <Card title="Log progress" subtitle="Daily / weekly numbers for this project">
              <ProgressForm project={project} onSave={logProgress} />
            </Card>
          )}

          {stats.byPerson.length > 0 && project.valueMode === 'Sum' && (
            <Card title="By person" bodyClassName="">
              <div className="table-wrap flush">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th className="n">Logs</th>
                      {labels.map((k) => (
                        <th className="n" key={k.key}>
                          {k.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byPerson.map((p) => (
                      <tr key={p.person}>
                        <td>{p.person}</td>
                        <td className="n">{p.logs}</td>
                        {labels.map((k) => (
                          <td className="n" key={k.key}>
                            {fmtNum(p[k.key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <Card title="Progress history" subtitle={`${stats.logs.length} entries`} bodyClassName="">
            {stats.logs.length === 0 ? (
              <EmptyState small title="No progress logged yet" message="Use “Log progress” to add the first numbers." />
            ) : (
              <div className="table-wrap flush" style={{ maxHeight: 320 }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Person</th>
                      {hasLines && <th>{project.lineHeader}</th>}
                      {labels.map((k) => (
                        <th className="n" key={k.key}>
                          {k.label}
                        </th>
                      ))}
                      <th>Note</th>
                      {writeUrl && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {[...stats.logs].reverse().map((l) => (
                      <tr key={l.id} style={l.pending ? { opacity: 0.6 } : undefined}>
                        <td>{l.date}</td>
                        <td>{l.person}</td>
                        {hasLines && <td>{l.line || '—'}</td>}
                        {labels.map((k) => (
                          <td className="n" key={k.key}>
                            {fmtNum(l[k.key])}
                          </td>
                        ))}
                        <td>{l.note ? <span className="cell-trunc" title={l.note}>{l.note}</span> : ''}</td>
                        {writeUrl && (
                          <td>
                            <button
                              type="button"
                              className="icon-btn"
                              title="Delete this entry"
                              aria-label="Delete entry"
                              onClick={async () => {
                                if (!window.confirm(`Delete the ${l.date} entry by ${l.person}?`)) return;
                                try {
                                  await deleteLog(l.id);
                                } catch (e) {
                                  setErr((e as Error).message);
                                }
                              }}
                            >
                              <Icon name="x" size={14} />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {related.length > 0 && (
            <Card title="Related Ad-Hoc log rows" subtitle={`Rows in the Main tab with Project Name “${project.name}” (shown for reference, not added to the totals)`}>
              <div className="stats">
                <div className="stat">
                  <div className="v">{fmtNum(related.length)}</div>
                  <div className="l">Rows</div>
                </div>
                <div className="stat">
                  <div className="v">{fmtNum(related.reduce((s, t) => s + t.products, 0))}</div>
                  <div className="l">Products</div>
                </div>
              </div>
            </Card>
          )}
        </div>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function GovProjectsPage() {
  const g = useGovernance();
  const { navigate } = useApp();
  const { projects, logs, writeUrl } = g;
  const [show, setShow] = useState<'active' | 'done' | 'all'>('active');
  const [person, setPerson] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<{ edit: Project | null } | null>(null);
  const people = usePeople();

  const withStats = useMemo(() => projects.map((p) => ({ p, s: projectStats(p, logs) })), [projects, logs]);
  const visible = withStats.filter(({ p }) => {
    const closed = /complete|cancel/i.test(p.status);
    if (show === 'active' && closed) return false;
    if (show === 'done' && !closed) return false;
    if (person && !p.pocs.includes(person) && !p.assignees.includes(person)) return false;
    return true;
  });
  const active = withStats.filter(({ p }) => !/complete|cancel/i.test(p.status));
  // Seller / logo counts and status breakdowns are not SKU work, so they stay out of the SKU totals.
  const skuWork = active.filter(({ p }) => p.layout === 'Reviewed / Found / Updated' || p.layout === 'Working / Updated');
  const sum = (k: 'reviewed' | 'found' | 'updated' | 'pending') => skuWork.reduce((s, x) => s + x.s[k], 0);
  const open = openId ? withStats.find((x) => x.p.id === openId) : null;

  if (!g.gov) {
    return (
      <Card title="Governance · REVAMP Projects">
        <ErrorState title="Governance sheet not synced yet" message="Run the GitHub Action once the Governance spreadsheet is shared with the service account." />
      </Card>
    );
  }

  return (
    <>
      {!writeUrl && (
        <Banner tone="warn">
          <b>Read-only:</b> project assigning is not switched on yet. It needs the one-time Apps Script setup (about 5 minutes).{' '}
          <button type="button" className="btn btn-sm" onClick={() => navigate('settings')}>
            Open the setup guide →
          </button>
        </Banner>
      )}
      {g.liveError && <Banner tone="bad">{g.liveError} Showing the last synced data.</Banner>}

      <div className="grid grid-kpi">
        <KpiCard label="Active projects" value={fmtNum(active.length)} sub={`${fmtNum(withStats.length - active.length)} completed / cancelled`} color="var(--series-1)" />
        <KpiCard label="Reviewed / worked (active)" value={fmtNum(sum('reviewed'))} sub={`of ${fmtNum(skuWork.reduce((s, x) => s + (x.p.totalSkus ?? 0), 0))} SKUs in scope`} color="var(--series-3)" />
        <KpiCard label="Updated (active)" value={fmtNum(sum('updated'))} sub={`${fmtNum(sum('found'))} found`} color="var(--series-7)" />
        <KpiCard label="Pending fixes" value={fmtNum(sum('pending'))} sub={`${active.filter((x) => x.s.overdue).length} project(s) overdue`} color="var(--bad)" />
      </div>

      <Card
        title="REVAMP projects"
        subtitle={g.live ? `Live from the Governance sheet · refreshed ${fmtRelative(g.liveAt ?? Date.now())}` : 'From the last sync'}
        actions={
          <>
            <Segmented
              label="Show"
              value={show}
              onChange={setShow}
              options={[
                { id: 'active', label: 'Active' },
                { id: 'done', label: 'Completed' },
                { id: 'all', label: 'All' },
              ]}
            />
            <select className="select" style={{ width: 150, height: 32 }} value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Filter by person">
              <option value="">Everyone</option>
              {people.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            {writeUrl && (
              <>
                <input
                  className="input"
                  style={{ width: 150, height: 32 }}
                  placeholder="Your name"
                  value={g.who}
                  onChange={(e) => g.setWho(e.target.value)}
                  title="Saved as “Updated By” on changes you make"
                />
                <button type="button" className="btn btn-sm" onClick={g.reload} disabled={g.loadingLive}>
                  <Icon name="refresh" size={14} className={g.loadingLive ? 'spin' : undefined} />
                </button>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setForm({ edit: null })}>
                  + New project
                </button>
              </>
            )}
          </>
        }
      >
        {visible.length === 0 ? (
          <EmptyState
            title={projects.length ? 'No projects match' : 'No projects yet'}
            message={projects.length ? 'Change the filter above.' : writeUrl ? 'Click “+ New project” to create and assign the first REVAMP project.' : 'Projects appear here once the Apps Script is set up.'}
          />
        ) : (
          <div className="gov-cards">
            {visible.map(({ p, s }) => (
              <button type="button" key={p.id} className="gov-card" onClick={() => setOpenId(p.id)}>
                <div className="gov-card-top">
                  <StatusBadge s={p.status} />
                  {p.priority === 'High' && <span className="badge bad">High</span>}
                  {s.overdue && <span className="badge bad">Overdue</span>}
                  {p.pending && <span className="badge">Saving…</span>}
                </div>
                <div className="gov-card-title">{p.name}</div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {p.workType || 'REVAMP'} · POC {p.poc || '—'}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginTop: 10 }}>
                  <span>
                    {metricLabels(p)[0].label} <b className="num">{fmtNum(s.reviewed)}</b>
                    {p.totalSkus ? ` / ${fmtNum(p.totalSkus)}` : ''}
                  </span>
                  <b className="num">{fmtPct(s.progressPct, 0)}</b>
                </div>
                <Meter pct={s.progressPct} label={`${p.name} progress`} />
                <div className="gov-card-nums">
                  {metricLabels(p)
                    .slice(1)
                    .map((k) => (
                      <span key={k.key}>
                        {k.label}
                        <b className="num">{fmtNum(s[k.key])}</b>
                      </span>
                    ))}
                  {(p.layout === 'Reviewed / Found / Updated' || p.layout === 'Working / Updated') && (
                    <span>
                      Pending<b className="num">{fmtNum(s.pending)}</b>
                    </span>
                  )}
                  {p.lines.length > 0 && (
                    <span>
                      Lines<b className="num">{p.lines.length}</b>
                    </span>
                  )}
                </div>
                <div className="gov-card-foot">
                  <span className="roles">
                    {p.assignees.slice(0, 4).map((a) => (
                      <span className="avatar-sm" key={a} title={a}>
                        {a.slice(0, 1).toUpperCase()}
                      </span>
                    ))}
                    {p.assignees.length > 4 && <span className="muted">+{p.assignees.length - 4}</span>}
                  </span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {p.dueDate ? `Due ${p.dueDate}` : s.lastLog ? `Last log ${s.lastLog}` : ''}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {open && <ProjectDrawer project={open.p} stats={open.s} onClose={() => setOpenId(null)} onEdit={() => setForm({ edit: open.p })} />}
      {form && (
        <ProjectForm
          initial={form.edit}
          onClose={() => setForm(null)}
          onSave={async (row) => {
            if (form.edit) await g.updateProject(form.edit.id, row);
            else await g.createProject({ ...row, 'Project ID': newId('PRJ') });
          }}
        />
      )}
    </>
  );
}
