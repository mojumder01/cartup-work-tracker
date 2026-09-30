import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PROJECT_PRIORITIES, PROJECT_STATUSES, PROJECT_WORK_TYPES } from '../config/governance.config';
import { useApp } from '../hooks/AppContext';
import { useGovernance } from '../hooks/useGovernance';
import { newId, projectStats, type Project, type ProjectStats } from '../utils/governance';
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

function ProjectForm({ initial, onClose, onSave }: { initial: Project | null; onClose: () => void; onSave: (row: Row) => Promise<void> }) {
  const people = usePeople();
  const [f, setF] = useState(() => ({
    name: initial?.name ?? '',
    workType: initial?.workType ?? '',
    description: initial?.description ?? '',
    poc: initial?.poc ?? '',
    assignees: initial?.assignees ?? [],
    totalSkus: initial?.totalSkus != null ? String(initial.totalSkus) : '',
    startDate: initial?.startDate || today(),
    dueDate: initial?.dueDate ?? '',
    status: initial?.status ?? 'Planned',
    priority: initial?.priority ?? 'Medium',
    foundLabel: initial?.foundLabel && initial.foundLabel !== 'Issues found' ? initial.foundLabel : '',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const up = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.name.trim()) return setErr('Project name is required.');
    if (f.totalSkus && !/^\d[\d,]*$/.test(f.totalSkus.trim())) return setErr('Total SKUs must be a whole number.');
    if (f.dueDate && f.startDate && f.dueDate < f.startDate) return setErr('Due date is before the start date.');
    setBusy(true);
    setErr(null);
    try {
      await onSave({
        'Project Name': f.name.trim(),
        'Work Type': f.workType.trim(),
        Description: f.description.trim(),
        POC: f.poc,
        Assignees: f.assignees.join(', '),
        'Total SKUs': f.totalSkus ? Number(f.totalSkus.replace(/,/g, '')) : '',
        'Start Date': f.startDate,
        'Due Date': f.dueDate,
        Status: f.status,
        Priority: f.priority,
        'Found Label': f.foundLabel.trim() || 'Issues found',
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
          <label className="field">
            <span>Project name *</span>
            <input className="input" value={f.name} onChange={(e) => up({ name: e.target.value })} placeholder="e.g. Electronics Category Revamp" autoFocus />
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
              <span>POC (owner)</span>
              <select className="select" value={f.poc} onChange={(e) => up({ poc: e.target.value })}>
                <option value="">—</option>
                {people.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Total SKUs (scope)</span>
              <input className="input" inputMode="numeric" value={f.totalSkus} onChange={(e) => up({ totalSkus: e.target.value })} placeholder="e.g. 737503" />
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
                {PROJECT_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Priority</span>
              <select className="select" value={f.priority} onChange={(e) => up({ priority: e.target.value })}>
                {PROJECT_PRIORITIES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Name of the “found” metric</span>
            <input className="input" value={f.foundLabel} onChange={(e) => up({ foundLabel: e.target.value })} placeholder="Issues found (e.g. Wrong Category Found)" />
          </label>
          <div className="field">
            <span>Assign team members</span>
            <div className="rb-checks" style={{ maxHeight: 220 }}>
              {people.map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={f.assignees.includes(p)}
                    onChange={(e) => up({ assignees: e.target.checked ? [...f.assignees, p] : f.assignees.filter((x) => x !== p) })}
                  />
                  {p}
                  {p === f.poc && <span className="meta">POC</span>}
                </label>
              ))}
            </div>
          </div>
          {err && <Banner tone="bad">{err}</Banner>}
        </div>
        <div className="gov-form-foot">
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Create project'}
          </button>
        </div>
      </form>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Project detail                                                      */
/* ------------------------------------------------------------------ */

function ProgressForm({ project, onSave }: { project: Project; onSave: (row: Row) => Promise<void> }) {
  const { who } = useGovernance();
  const people = usePeople();
  const choices = project.assignees.length ? [...new Set([...project.assignees, project.poc].filter(Boolean))] : people;
  const [f, setF] = useState({ date: today(), person: choices.includes(who) ? who : choices[0] ?? '', reviewed: '', found: '', updated: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'bad' | 'warn'; text: string } | null>(null);
  const up = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const n = (s: string) => (s.trim() ? Number(s.replace(/,/g, '')) : 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const vals = [f.reviewed, f.found, f.updated];
    if (vals.some((v) => v.trim() && !/^\d[\d,]*$/.test(v.trim()))) return setMsg({ tone: 'bad', text: 'Counts must be whole numbers.' });
    if (vals.every((v) => !v.trim())) return setMsg({ tone: 'bad', text: 'Enter at least one count.' });
    if (!f.person) return setMsg({ tone: 'bad', text: 'Choose who did the work.' });
    setBusy(true);
    setMsg(null);
    try {
      await onSave({
        'Log ID': newId('LOG'),
        'Project ID': project.id,
        Date: f.date,
        Person: f.person,
        Reviewed: n(f.reviewed),
        Found: n(f.found),
        Updated: n(f.updated),
        Note: f.note.trim(),
      });
      setF({ ...f, reviewed: '', found: '', updated: '', note: '' });
      setMsg({ tone: 'warn', text: 'Saved to the Governance sheet.' });
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
          <input type="date" className="input" value={f.date} max={today()} onChange={(e) => up({ date: e.target.value })} />
        </label>
        <label className="field">
          <span>Worked by</span>
          <select className="select" value={f.person} onChange={(e) => up({ person: e.target.value })}>
            {choices.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Reviewed</span>
          <input className="input" inputMode="numeric" value={f.reviewed} onChange={(e) => up({ reviewed: e.target.value })} placeholder="0" />
        </label>
        <label className="field">
          <span>{project.foundLabel}</span>
          <input className="input" inputMode="numeric" value={f.found} onChange={(e) => up({ found: e.target.value })} placeholder="0" />
        </label>
        <label className="field">
          <span>Updated</span>
          <input className="input" inputMode="numeric" value={f.updated} onChange={(e) => up({ updated: e.target.value })} placeholder="0" />
        </label>
      </div>
      <label className="field">
        <span>Note</span>
        <input className="input" value={f.note} onChange={(e) => up({ note: e.target.value })} placeholder="Optional" />
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
            <dt>Reviewed</dt>
            <dd>
              {fmtNum(stats.reviewed)} ({fmtPct(stats.progressPct)})
            </dd>
            <dt>{project.foundLabel}</dt>
            <dd>{fmtNum(stats.found)}</dd>
            <dt>Updated</dt>
            <dd>
              {fmtNum(stats.updated)} ({fmtPct(stats.fixPct)} of found)
            </dd>
            <dt>Pending</dt>
            <dd>{fmtNum(stats.pending)}</dd>
          </dl>

          {writeUrl && (
            <Card title="Log progress" subtitle="Daily / weekly numbers for this project">
              <ProgressForm project={project} onSave={logProgress} />
            </Card>
          )}

          {stats.byPerson.length > 0 && (
            <Card title="By person" bodyClassName="">
              <div className="table-wrap flush">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Person</th>
                      <th className="n">Logs</th>
                      <th className="n">Reviewed</th>
                      <th className="n">{project.foundLabel}</th>
                      <th className="n">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byPerson.map((p) => (
                      <tr key={p.person}>
                        <td>{p.person}</td>
                        <td className="n">{p.logs}</td>
                        <td className="n">{fmtNum(p.reviewed)}</td>
                        <td className="n">{fmtNum(p.found)}</td>
                        <td className="n">{fmtNum(p.updated)}</td>
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
                      <th className="n">Reviewed</th>
                      <th className="n">Found</th>
                      <th className="n">Updated</th>
                      <th>Note</th>
                      {writeUrl && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {[...stats.logs].reverse().map((l) => (
                      <tr key={l.id} style={l.pending ? { opacity: 0.6 } : undefined}>
                        <td>{l.date}</td>
                        <td>{l.person}</td>
                        <td className="n">{fmtNum(l.reviewed)}</td>
                        <td className="n">{fmtNum(l.found)}</td>
                        <td className="n">{fmtNum(l.updated)}</td>
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
    if (person && p.poc !== person && !p.assignees.includes(person)) return false;
    return true;
  });
  const active = withStats.filter(({ p }) => !/complete|cancel/i.test(p.status));
  const sum = (k: 'reviewed' | 'found' | 'updated' | 'pending') => active.reduce((s, x) => s + x.s[k], 0);
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
          <b>Read-only:</b> project assigning is not switched on yet. Deploy <code>apps-script/Code.gs</code> in the Governance sheet and add its Web app URL as the GitHub
          variable <code>GOVERNANCE_APPS_SCRIPT_URL</code> (steps in the README). Until then this page shows the “Projects” tabs from the last sync.
        </Banner>
      )}
      {g.liveError && <Banner tone="bad">{g.liveError} Showing the last synced data.</Banner>}

      <div className="grid grid-kpi">
        <KpiCard label="Active projects" value={fmtNum(active.length)} sub={`${fmtNum(withStats.length - active.length)} completed / cancelled`} color="var(--series-1)" />
        <KpiCard label="Reviewed (active)" value={fmtNum(sum('reviewed'))} sub={`of ${fmtNum(active.reduce((s, x) => s + (x.p.totalSkus ?? 0), 0))} SKUs in scope`} color="var(--series-3)" />
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
                    Reviewed <b className="num">{fmtNum(s.reviewed)}</b>
                    {p.totalSkus ? ` / ${fmtNum(p.totalSkus)}` : ''}
                  </span>
                  <b className="num">{fmtPct(s.progressPct, 0)}</b>
                </div>
                <Meter pct={s.progressPct} label={`${p.name} progress`} />
                <div className="gov-card-nums">
                  <span>
                    {p.foundLabel}
                    <b className="num">{fmtNum(s.found)}</b>
                  </span>
                  <span>
                    Updated<b className="num">{fmtNum(s.updated)}</b>
                  </span>
                  <span>
                    Pending<b className="num">{fmtNum(s.pending)}</b>
                  </span>
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
