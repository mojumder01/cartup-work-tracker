/**
 * Team-lead task board (assign.html): live list of jobs from the Work Sheet
 * (all unfinished jobs + the last N days), one-click filters, an "in hand"
 * count per person, tick jobs and assign them to a person in one click.
 * Existing assignees are kept unless "replace" is ticked, and nothing is
 * written if a row changed after the list was loaded.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { scriptRead, scriptWrite, withAnyUrl, type WriteOp } from '../services/scriptApi';

const QUEUE_COLUMNS = ['JOB ID', 'Timestamp', 'Task Type', 'Shop Name', 'Seller Code', 'KAM', 'L1 Category', 'Number of SKU', 'Status', 'Uploaded by', 'Uploaded SKU Count', 'Upload date', 'Visual editor', 'Image Status', 'QC By', 'QC Status'];
import { LOCAL_URL_KEY, localAppsScriptUrl } from '../services/appsScriptUrl';

type Cell = string | number | null;
type Job = Record<string, Cell>;
type RoleKey = 'upload' | 'visual' | 'qc';
type StatusFilter = 'open' | 'unassigned' | 'Pending' | 'Running' | 'Done' | 'Rejected' | 'all';

const ROLES: Record<RoleKey, { field: string; label: string; short: string }> = {
  upload: { field: 'Uploaded by', label: 'Upload (Uploaded by)', short: 'Upload' },
  visual: { field: 'Visual editor', label: 'Image editing (Visual editor)', short: 'Image' },
  qc: { field: 'QC By', label: 'QC (QC By)', short: 'QC' },
};

interface Config {
  appsScriptUrl: string | null;
  people: string[];
  roles?: Record<RoleKey, string[]>;
}
interface Result {
  jobId: string;
  ok: boolean;
  reason?: string;
  written?: string[];
  skipped?: string[];
}

const t = (v: Cell | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: Cell | undefined) => (typeof v === 'number' ? v : Number(t(v).replace(/,/g, '')) || 0);
const fmt = (v: number) => v.toLocaleString('en-US');
const dayMs = (v: Cell | undefined) => {
  const m = t(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : null;
};
const ageDays = (v: Cell | undefined) => {
  const ms = dayMs(v);
  return ms === null ? null : Math.max(0, Math.floor((Date.now() - ms) / 86400000));
};
const isOpen = (j: Job) => !['Done', 'Rejected'].includes(t(j.Status));
/** Is the work for this role still to do? */
const roleOpen = (j: Job, role: RoleKey) =>
  role === 'upload' ? isOpen(j) : role === 'visual' ? !['Delivered', 'Rejected'].includes(t(j['Image Status'])) && t(j.Status) !== 'Rejected' : !/^QC (Done|Rejected)$/.test(t(j['QC Status'])) && t(j.Status) !== 'Rejected';
const roleDone = (j: Job, role: RoleKey) =>
  role === 'upload' ? t(j.Status) === 'Done' : role === 'visual' ? t(j['Image Status']) === 'Delivered' : /^QC (Done|Rejected)$/.test(t(j['QC Status']));

function useStored(key: string, init: string): [string, (v: string) => void] {
  const [v, setV] = useState(() => {
    try {
      return localStorage.getItem(key) ?? init;
    } catch {
      return init;
    }
  });
  return [
    v,
    (x) => {
      setV(x);
      try {
        localStorage.setItem(key, x);
      } catch {
        /* ignore */
      }
    },
  ];
}

const STATUS_TONE: Record<string, string> = { Done: 'var(--good)', Running: '#2563eb', Pending: '#b45309', Rejected: 'var(--bad)' };

export function AssignForm() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [lead, setLead] = useStored('cartup.leadUser', '');
  const [days, setDays] = useStored('cartup.boardDays', '30');
  const [role, setRole] = useStored('cartup.boardRole', 'upload') as [RoleKey, (v: string) => void];
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [workingUrl, setWorkingUrl] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusFilter>('unassigned');
  const [q, setQ] = useState('');
  const [taskType, setTaskType] = useState('');
  const [kam, setKam] = useState('');
  const [person, setPerson] = useState('');
  const [sort, setSort] = useState<'oldest' | 'newest'>('oldest');
  const [limit, setLimit] = useState(200);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assignee, setAssignee] = useState('');
  const [setRunning, setSetRunning] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);

  useEffect(() => {
    fetch(`data/form.json?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: Config) => setCfg(j))
      .catch(() => setCfg({ appsScriptUrl: null, people: [] }));
  }, []);
  const candidates = useMemo(() => [...new Set([workingUrl, localAppsScriptUrl(), cfg?.appsScriptUrl].filter((u): u is string => !!u))], [cfg, workingUrl]);

  const load = useCallback(async () => {
    if (!candidates.length) return;
    setLoading(true);
    setErr(null);
    try {
      const { value, url } = await withAnyUrl(candidates, (u) =>
        scriptRead(u, {
          sheet: 'work',
          cols: QUEUE_COLUMNS,
          notIn: { col: 'Status', values: ['Done', 'Rejected'] },
          recent: { cols: ['Timestamp', 'Upload date'], days: Number(days) },
          need: ['Task Type', 'Shop Name'],
          order: 'desc',
          limit: 5000,
        }),
      );
      setJobs(value.objects);
      setLoadedAt(Date.now());
      setWorkingUrl(url);
    } catch (e) {
      setErr((e as Error).message);
    }
    setLoading(false);
  }, [candidates, days]);

  useEffect(() => {
    if (cfg) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, days]);

  const field = ROLES[role].field;
  const all = jobs ?? [];
  const since = Date.now() - Number(days) * 86400000;
  const inRange = (j: Job) => {
    const a = dayMs(j.Timestamp);
    const b = dayMs(j['Upload date']);
    return (a !== null && a >= since) || (b !== null && b >= since);
  };

  // Counts for the filter cards (ignore the status filter itself).
  const base = useMemo(() => {
    const ids = q
      .toUpperCase()
      .split(/[\s,;]+/)
      .filter(Boolean);
    const many = ids.length > 1;
    return all.filter((j) => {
      if (taskType && t(j['Task Type']) !== taskType) return false;
      if (kam && t(j.KAM) !== kam) return false;
      if (person === '__none' ? t(j[field]) !== '' : person && t(j[field]).toLowerCase() !== person.toLowerCase()) return false;
      if (q.trim()) {
        if (many) return ids.includes(t(j['JOB ID']).toUpperCase());
        const s = q.trim().toLowerCase();
        return ['JOB ID', 'Shop Name', 'Seller Code', 'KAM', 'Uploaded by', 'Visual editor', 'QC By'].some((c) => t(j[c]).toLowerCase().includes(s));
      }
      return true;
    });
  }, [all, q, taskType, kam, person, field]);

  const matchStatus = (j: Job, s: StatusFilter) => {
    switch (s) {
      case 'open':
        return roleOpen(j, role);
      case 'unassigned':
        return roleOpen(j, role) && !t(j[field]);
      case 'all':
        return true;
      case 'Pending':
        return t(j.Status) === 'Pending' || (t(j.Status) === '' && isOpen(j));
      default:
        return t(j.Status) === s && (s !== 'Done' || inRange(j));
    }
  };
  const counts = useMemo(
    () => Object.fromEntries((['unassigned', 'open', 'Pending', 'Running', 'Done', 'Rejected', 'all'] as StatusFilter[]).map((s) => [s, base.filter((j) => matchStatus(j, s)).length])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, role, days],
  );

  const shown = useMemo(() => {
    const list = base.filter((j) => matchStatus(j, status));
    list.sort((a, b) => {
      const x = dayMs(a.Timestamp) ?? 0;
      const y = dayMs(b.Timestamp) ?? 0;
      return sort === 'oldest' ? x - y : y - x;
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, status, sort, role, days]);

  // In hand per person for the chosen role.
  const inHand = useMemo(() => {
    const m = new Map<string, { name: string; pending: number; running: number; open: number; done: number; skus: number }>();
    for (const j of all) {
      const name = t(j[field]);
      if (!name) continue;
      const g = m.get(name.toLowerCase()) ?? { name, pending: 0, running: 0, open: 0, done: 0, skus: 0 };
      if (roleOpen(j, role)) {
        g.open++;
        g.skus += num(j['Number of SKU']);
        if (t(j.Status) === 'Running') g.running++;
        else if (t(j.Status) === 'Pending' || t(j.Status) === '') g.pending++;
      } else if (roleDone(j, role) && inRange(j)) g.done++;
      m.set(name.toLowerCase(), g);
    }
    return [...m.values()].sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, role, field, days]);

  const people = useMemo(() => {
    const names = new Set([...(cfg?.roles?.[role] ?? cfg?.people ?? []), ...inHand.map((p) => p.name)]);
    const load0 = (n: string) => inHand.find((p) => p.name.toLowerCase() === n.toLowerCase())?.open ?? 0;
    return [...names].sort((a, b) => load0(a) - load0(b) || a.localeCompare(b)).map((n) => ({ name: n, open: load0(n) }));
  }, [cfg, role, inHand]);

  const taskTypes = useMemo(() => [...new Set(all.map((j) => t(j['Task Type'])).filter(Boolean))].sort(), [all]);
  const kams = useMemo(() => [...new Set(all.map((j) => t(j.KAM)).filter(Boolean))].sort(), [all]);

  const visible = shown.slice(0, limit);
  const selectedJobs = all.filter((j) => selected.has(t(j['JOB ID'])));
  const allShownSelected = shown.length > 0 && shown.every((j) => selected.has(t(j['JOB ID'])));
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    const next = new Set(selected);
    if (allShownSelected) shown.forEach((j) => next.delete(t(j['JOB ID'])));
    else shown.slice(0, 500).forEach((j) => next.add(t(j['JOB ID'])));
    setSelected(next);
  };
  const alreadyAssigned = selectedJobs.filter((j) => t(j[field]) && t(j[field]).toLowerCase() !== assignee.toLowerCase()).length;

  const assign = async () => {
    if (!lead.trim()) return setErr('Write your name (team lead) at the top first.');
    if (!assignee) return setErr('Choose who to assign.');
    if (!selectedJobs.length) return setErr('Tick at least one job.');
    setBusy(true);
    setErr(null);
    setResults(null);
    try {
      // Decide per job here: keep someone already assigned unless "replace existing" is ticked.
      const out: Result[] = [];
      const ops: WriteOp[] = [];
      for (const j of selectedJobs) {
        const id = t(j['JOB ID']);
        const cur = t(j[field]);
        if (cur.toLowerCase() === assignee.toLowerCase()) {
          out.push({ jobId: id, ok: true, written: [], skipped: [] });
          continue;
        }
        if (cur && !overwrite) {
          out.push({ jobId: id, ok: true, written: [], skipped: [`${field}: already ${cur}`] });
          continue;
        }
        const set: Record<string, string> = { [field]: assignee };
        if (role === 'upload' && setRunning && (t(j.Status) === '' || t(j.Status) === 'Pending')) set.Status = 'Running';
        // expect = what this board showed; the script refuses the row if it changed since.
        ops.push({ sheet: 'work', op: 'update', key: id, set, expect: { [field]: j[field] ?? null, Status: j.Status ?? null } });
      }
      const res = ops.length ? await scriptWrite(candidates[0], lead.trim(), ops) : [];
      for (const r of res) {
        out.push({
          jobId: r.key,
          ok: r.ok,
          reason: r.stale ? `${r.reason} — refresh and try again` : r.reason,
          written: r.written,
          skipped: (r.skipped ?? []).map((x) => `${x.field}: ${x.reason}`),
        });
      }
      const all50 = out;
      setResults(all50);
      setSelected(new Set());
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const okCount = results?.filter((r) => r.ok && r.written?.length).length ?? 0;
  const issues = results?.filter((r) => !r.ok || !r.written?.length || r.skipped?.length) ?? [];

  const Card = ({ id, label, tone }: { id: StatusFilter; label: string; tone?: string }) => (
    <button type="button" className={`ab-stat ${status === id ? 'on' : ''}`} onClick={() => setStatus(id)}>
      <span className="v" style={tone ? { color: tone } : undefined}>
        {fmt(counts[id] ?? 0)}
      </span>
      <span className="l">{label}</span>
    </button>
  );

  return (
    <div className="tf-page" style={{ paddingBottom: selected.size ? 140 : 48 }}>
      <div className="tf-wrap" style={{ maxWidth: 1280 }}>
        <div className="tf-head">
          <div className="tf-logo" aria-hidden="true">
            C
          </div>
          <div>
            <h1>Task board</h1>
            <div className="muted">Team leads · assign jobs from the Work Sheet</div>
          </div>
          <div className="ab-head-tools">
            <input className="input" style={{ width: 190 }} list="ab-people" value={lead} onChange={(e) => setLead(e.target.value)} placeholder="Your name (team lead)" aria-label="Your name (team lead)" />
            <datalist id="ab-people">
              {(cfg?.people ?? []).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            <button type="button" className="btn" onClick={load} disabled={loading}>
              {loading ? 'Loading…' : '↻ Refresh'}
            </button>
          </div>
        </div>

        {cfg && !candidates.length && <div className="tf-msg bad">Not connected: the Apps Script Web app URL is missing.</div>}
        {err && <div className="tf-msg bad">{err}</div>}

        <div className="ab-roles" role="tablist" aria-label="Work type">
          {(Object.keys(ROLES) as RoleKey[]).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={role === k}
              className={role === k ? 'on' : ''}
              onClick={() => {
                setRole(k);
                setPerson('');
                setAssignee('');
              }}
            >
              {ROLES[k].short}
            </button>
          ))}
          <span className="tf-hint" style={{ marginLeft: 'auto', alignSelf: 'center' }}>
            {loadedAt ? `${fmt(all.length)} jobs loaded · ${new Date(loadedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
        </div>

        <div className="ab-stats">
          <Card id="unassigned" label={`Not assigned (${ROLES[role].short})`} tone="var(--bad)" />
          <Card id="open" label={`Open (${ROLES[role].short})`} />
          <Card id="Pending" label="Pending" tone={STATUS_TONE.Pending} />
          <Card id="Running" label="Running" tone={STATUS_TONE.Running} />
          <Card id="Done" label={`Done · last ${days} days`} tone={STATUS_TONE.Done} />
          <Card id="Rejected" label="Rejected" tone={STATUS_TONE.Rejected} />
          <Card id="all" label="All loaded" />
        </div>

        <div className="ab-grid">
          <div className="tf-card" style={{ padding: 12, minWidth: 0 }}>
            <div className="ab-filters">
              <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search JOB ID / shop / seller code / KAM — or paste many JOB IDs" style={{ flex: '2 1 260px' }} />
              <select className="select" value={taskType} onChange={(e) => setTaskType(e.target.value)} aria-label="Task type">
                <option value="">All task types</option>
                {taskTypes.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select className="select" value={kam} onChange={(e) => setKam(e.target.value)} aria-label="KAM">
                <option value="">All KAMs</option>
                {kams.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
              <select className="select" value={person} onChange={(e) => setPerson(e.target.value)} aria-label={`${ROLES[role].field}`}>
                <option value="">Anyone ({ROLES[role].short})</option>
                <option value="__none">Not assigned</option>
                {inHand.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select className="select" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Period">
                {['7', '30', '90'].map((d) => (
                  <option key={d} value={d}>
                    Open + last {d} days
                  </option>
                ))}
              </select>
              <select className="select" value={sort} onChange={(e) => setSort(e.target.value as 'oldest' | 'newest')} aria-label="Sort">
                <option value="oldest">Oldest request first</option>
                <option value="newest">Newest first</option>
              </select>
              {(q || taskType || kam || person) && (
                <button type="button" className="btn btn-sm" onClick={() => (setQ(''), setTaskType(''), setKam(''), setPerson(''))}>
                  Clear
                </button>
              )}
            </div>

            <div className="table-wrap" style={{ maxHeight: '62vh', overflow: 'auto', marginTop: 10 }}>
              <table className="data ab-table">
                <thead>
                  <tr>
                    <th style={{ width: 34 }}>
                      <input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Select all shown" />
                    </th>
                    <th>JOB ID</th>
                    <th>Age</th>
                    <th>Task</th>
                    <th>Shop · Seller</th>
                    <th>KAM</th>
                    <th className="n">SKUs</th>
                    <th>Status</th>
                    <th>Uploaded by</th>
                    <th>Visual editor</th>
                    <th>QC By</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs === null && (
                    <tr>
                      <td colSpan={11} className="tf-hint">
                        {loading ? 'Loading jobs from the Work Sheet…' : 'No data yet.'}
                      </td>
                    </tr>
                  )}
                  {jobs !== null && shown.length === 0 && (
                    <tr>
                      <td colSpan={11} className="tf-hint">
                        No jobs match these filters.
                      </td>
                    </tr>
                  )}
                  {visible.map((j) => {
                    const id = t(j['JOB ID']);
                    const age = ageDays(j.Timestamp);
                    const st = t(j.Status) || 'Pending';
                    const cell = (f: string) => {
                      const v = t(j[f]);
                      return v ? <span className={f === field ? 'ab-person' : ''}>{v}</span> : <span className="tf-hint">—</span>;
                    };
                    return (
                      <tr key={id} className={selected.has(id) ? 'sel' : ''} onClick={() => toggle(id)}>
                        <td onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={selected.has(id)} onChange={() => toggle(id)} aria-label={`Select ${id}`} />
                        </td>
                        <td>
                          <b>{id}</b>
                        </td>
                        <td style={{ color: age !== null && age > 3 && isOpen(j) ? 'var(--bad)' : undefined }}>{age === null ? '—' : `${age}d`}</td>
                        <td>{t(j['Task Type']) || '—'}</td>
                        <td>
                          {t(j['Shop Name']) || '—'}
                          <div className="tf-hint">{t(j['Seller Code'])}</div>
                        </td>
                        <td>{t(j.KAM) || '—'}</td>
                        <td className="n">{num(j['Number of SKU']) ? fmt(num(j['Number of SKU'])) : '—'}</td>
                        <td>
                          <span style={{ color: STATUS_TONE[st], fontWeight: 600 }}>{st}</span>
                        </td>
                        <td>{cell('Uploaded by')}</td>
                        <td>
                          {cell('Visual editor')}
                          {t(j['Image Status']) && <div className="tf-hint">{t(j['Image Status'])}</div>}
                        </td>
                        <td>
                          {cell('QC By')}
                          {t(j['QC Status']) && <div className="tf-hint">{t(j['QC Status'])}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {shown.length > visible.length && (
              <div style={{ textAlign: 'center', marginTop: 8 }}>
                <button type="button" className="btn btn-sm" onClick={() => setLimit(limit + 300)}>
                  Show more ({fmt(shown.length - visible.length)} more)
                </button>
              </div>
            )}
          </div>

          <div className="tf-card" style={{ padding: 12 }}>
            <b>In hand · {ROLES[role].short}</b>
            <div className="tf-hint">Open jobs per person (click a name to filter). Done = last {days} days.</div>
            <table className="data ab-hand">
              <thead>
                <tr>
                  <th>Person</th>
                  {role === 'upload' && <th className="n">Pend</th>}
                  {role === 'upload' && <th className="n">Run</th>}
                  <th className="n">Open</th>
                  <th className="n">Done</th>
                </tr>
              </thead>
              <tbody>
                {inHand.map((p) => (
                  <tr key={p.name} className={person.toLowerCase() === p.name.toLowerCase() ? 'sel' : ''} onClick={() => (setPerson(person === p.name ? '' : p.name), setStatus('open'))} style={{ cursor: 'pointer' }}>
                    <td>{p.name}</td>
                    {role === 'upload' && <td className="n">{p.pending || ''}</td>}
                    {role === 'upload' && <td className="n">{p.running || ''}</td>}
                    <td className="n" title={p.skus ? `${fmt(p.skus)} SKUs in open jobs` : undefined}>
                      <b>{p.open}</b>
                    </td>
                    <td className="n">{p.done || ''}</td>
                  </tr>
                ))}
                {inHand.length === 0 && (
                  <tr>
                    <td colSpan={5} className="tf-hint">
                      Nobody assigned yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {results && (
          <div className="tf-card">
            <div className={`tf-msg ${issues.length ? 'warn' : 'good'}`}>
              Assigned {okCount} job(s) in the Work Sheet{issues.length ? ` · ${issues.length} need attention:` : '.'}
            </div>
            {issues.map((r) => (
              <div key={r.jobId} className="tf-hint">
                <b>{r.jobId}</b>: {!r.ok ? r.reason : r.skipped?.length ? `kept — ${r.skipped.join('; ')}` : 'already assigned to this person'}
              </div>
            ))}
            <button type="button" className="btn btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setResults(null)}>
              OK
            </button>
          </div>
        )}

        <div className="tf-hint" style={{ textAlign: 'center' }}>
          {candidates[0] ? `Connected to Web app …${candidates[0].slice(-26, -5)}` : ''}
          {localAppsScriptUrl() && (
            <>
              {' · '}
              <button
                type="button"
                className="rb-link"
                onClick={() => {
                  try {
                    localStorage.removeItem(LOCAL_URL_KEY);
                  } catch {
                    /* ignore */
                  }
                  location.reload();
                }}
              >
                Use the default connection
              </button>
            </>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="ab-bar">
          <b>{selected.size} selected</b>
          <button type="button" className="rb-link" onClick={() => setSelected(new Set())}>
            clear
          </button>
          <span>Assign {ROLES[role].short} to</span>
          <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assign to" style={{ width: 210 }}>
            <option value="">— choose person —</option>
            {people.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} · {p.open} in hand
              </option>
            ))}
          </select>
          {role === 'upload' && (
            <label className="ab-check">
              <input type="checkbox" checked={setRunning} onChange={(e) => setSetRunning(e.target.checked)} /> set Running
            </label>
          )}
          <label className="ab-check" title="Replace a different person who is already assigned">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} /> replace existing
          </label>
          {alreadyAssigned > 0 && !overwrite && <span className="ab-warn">{alreadyAssigned} already have someone — they will be kept</span>}
          <button type="button" className="btn btn-primary" onClick={assign} disabled={busy || !assignee}>
            {busy ? 'Assigning…' : `Assign ${selected.size}`}
          </button>
        </div>
      )}
    </div>
  );
}
