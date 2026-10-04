/**
 * Team lead page (assign.html): check one or many JOB IDs, see each job's
 * details and current people, pick who uploads / edits images / does QC
 * (with everyone's open workload), and assign. Existing assignees are kept
 * unless "replace" is ticked, and nothing is written if the row changed after
 * the check.
 */
import { useEffect, useMemo, useState } from 'react';
import { readAppsScriptJson } from '../services/appsScriptResponse';
import { LOCAL_URL_KEY, localAppsScriptUrl } from '../services/appsScriptUrl';

type Cell = string | number | null;
type Job = Record<string, Cell>;
type Role = 'Uploaded by' | 'Visual editor' | 'QC By';
const ROLES: { field: Role; key: 'upload' | 'visual' | 'qc'; label: string }[] = [
  { field: 'Uploaded by', key: 'upload', label: 'Upload (Uploaded by)' },
  { field: 'Visual editor', key: 'visual', label: 'Image editing (Visual editor)' },
  { field: 'QC By', key: 'qc', label: 'QC (QC By)' },
];

interface Config {
  appsScriptUrl: string | null;
  people: string[];
  roles?: { upload: string[]; qc: string[]; visual: string[] };
}
type Workload = Record<'upload' | 'visual' | 'qc', Record<string, number>>;
interface Checked {
  id: string;
  job: Job | null;
  error?: string;
}
interface Result {
  jobId: string;
  ok: boolean;
  reason?: string;
  written?: string[];
  skipped?: string[];
}

const t = (v: Cell | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const n = (v: Cell | undefined) => (typeof v === 'number' ? v.toLocaleString('en-US') : t(v));
const day = (v: Cell | undefined) => (/^\d{4}-\d{2}-\d{2}/.test(t(v)) ? t(v).slice(0, 10) : t(v));
const parseIds = (s: string) => [...new Set(s.toUpperCase().split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean))];

function stored(key: string): [string, (v: string) => void] {
  let v = '';
  try {
    v = localStorage.getItem(key) ?? '';
  } catch {
    /* ignore */
  }
  return [
    v,
    (x) => {
      try {
        localStorage.setItem(key, x);
      } catch {
        /* ignore */
      }
    },
  ];
}

export function AssignForm() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [lead, setLeadState] = useState(() => stored('cartup.leadUser')[0]);
  const setLead = (v: string) => {
    setLeadState(v);
    stored('cartup.leadUser')[1](v);
  };
  const [idsText, setIdsText] = useState('');
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState<Checked[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [workload, setWorkload] = useState<Workload | null>(null);
  const [pick, setPick] = useState<Record<Role, string>>({ 'Uploaded by': '', 'Visual editor': '', 'QC By': '' });
  const [setRunning, setSetRunning] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [workingUrl, setWorkingUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch(`data/form.json?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: Config) => setCfg(j))
      .catch(() => setCfg({ appsScriptUrl: null, people: [] }));
  }, []);

  const candidates = useMemo(() => [...new Set([workingUrl, localAppsScriptUrl(), cfg?.appsScriptUrl].filter((u): u is string => !!u))], [cfg, workingUrl]);

  /** GET from the first Web app URL that runs the current script. */
  const get = async <T,>(query: string, isCurrent: (j: T & { ok: boolean }) => boolean): Promise<T> => {
    let last = 'The page is not connected to Google Sheets yet (Apps Script Web app URL missing).';
    for (const u of candidates) {
      try {
        const r = await fetch(`${u}?${query}&t=${Date.now()}`);
        if (!r.ok) throw new Error(`The Google Sheets service returned HTTP ${r.status}.`);
        const j = await readAppsScriptJson<T & { ok: boolean; error?: string }>(r);
        if (!j.ok) throw new Error(j.error || 'Request failed.');
        if (!isCurrent(j)) throw new Error('The Apps Script Web app is an older version — deploy the latest script (Manage deployments → New version).');
        setWorkingUrl(u);
        return j;
      } catch (e) {
        last = (e as Error).message;
      }
    }
    throw new Error(last);
  };

  const loadWorkload = () =>
    get<Workload>('action=workload', (j) => typeof (j as Workload).upload === 'object')
      .then(setWorkload)
      .catch(() => setWorkload(null));
  useEffect(() => {
    if (cfg) loadWorkload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  const check = async () => {
    const ids = parseIds(idsText);
    setErr(null);
    setResults(null);
    if (!ids.length) return setErr('Enter at least one JOB ID.');
    if (ids.length > 50) return setErr('Check up to 50 JOB IDs at a time.');
    setChecking(true);
    const out: Checked[] = [];
    for (const id of ids) {
      try {
        const j = await get<{ found: boolean; job?: Job }>(`action=job&id=${encodeURIComponent(id)}`, (x) => typeof x.found === 'boolean');
        out.push({ id, job: j.found ? j.job ?? null : null, error: j.found ? undefined : 'Not in the Work Sheet' });
      } catch (e) {
        out.push({ id, job: null, error: (e as Error).message });
      }
      setChecked([...out]);
    }
    setChecking(false);
  };

  const valid = checked.filter((c) => c.job);
  const chosen = ROLES.filter((r) => pick[r.field]);

  /** What will happen to one job, before saving. */
  const plan = (job: Job) =>
    chosen.map((r) => {
      const cur = t(job[r.field]);
      const want = pick[r.field];
      if (cur === want) return { role: r.field, text: `${want} (already)`, tone: '' };
      if (cur && !overwrite) return { role: r.field, text: `keeps ${cur}`, tone: 'warn' };
      return { role: r.field, text: cur ? `${cur} → ${want}` : `→ ${want}`, tone: 'good' };
    });

  const options = (key: 'upload' | 'visual' | 'qc') => {
    const names = new Set([...(cfg?.roles?.[key] ?? cfg?.people ?? []), ...Object.keys(workload?.[key] ?? {})]);
    return [...names].sort((a, b) => (workload?.[key]?.[a] ?? 0) - (workload?.[key]?.[b] ?? 0) || a.localeCompare(b));
  };

  const assign = async () => {
    if (!lead.trim()) return setErr('Choose your name first.');
    if (!valid.length) return setErr('Check the JOB IDs first.');
    if (!chosen.length) return setErr('Choose at least one person to assign.');
    setBusy(true);
    setErr(null);
    try {
      const url = candidates[0];
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'assignTasks',
          by: lead.trim(),
          jobs: valid.map((c) => ({
            jobId: c.id,
            expect: { 'Uploaded by': c.job!['Uploaded by'], 'Visual editor': c.job!['Visual editor'], 'QC By': c.job!['QC By'], Status: c.job!.Status },
          })),
          assign: Object.fromEntries(chosen.map((r) => [r.field, pick[r.field]])),
          setRunning,
          overwrite,
        }),
      });
      if (!res.ok) throw new Error(`The Google Sheets service returned HTTP ${res.status}.`);
      const j = await readAppsScriptJson<{ ok: boolean; error?: string; results?: Result[] }>(res);
      if (!j.ok) throw new Error(j.error || 'Assigning failed.');
      if (!Array.isArray(j.results)) throw new Error('The Apps Script Web app is an older version — deploy the latest script (Manage deployments → New version).');
      setResults(j.results);
      loadWorkload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tf-page">
      <div className="tf-wrap" style={{ maxWidth: 900 }}>
        <div className="tf-head">
          <div className="tf-logo" aria-hidden="true">
            C
          </div>
          <div>
            <h1>Assign tasks</h1>
            <div className="muted">Team lead · assigns JOB IDs in the Work Sheet (existing data is never overwritten unless you choose to)</div>
          </div>
        </div>
        {cfg && !candidates.length && <div className="tf-msg bad">Not connected: the Apps Script Web app URL is missing.</div>}

        <div className="tf-card">
          <label className="field">
            <span>Your name (team lead) *</span>
            <input className="input" list="as-people" value={lead} onChange={(e) => setLead(e.target.value)} placeholder="Choose or type your name" autoComplete="off" />
            <datalist id="as-people">
              {(cfg?.people ?? []).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label className="field">
            <span>JOB IDs — one or many (paste from the sheet: new line, space or comma)</span>
            <textarea className="input" value={idsText} onChange={(e) => setIdsText(e.target.value)} placeholder={'CCWT10010\nCCWT10011'} />
          </label>
          <div className="tf-actions">
            <span className="tf-hint" style={{ marginRight: 'auto', alignSelf: 'center' }}>
              {parseIds(idsText).length} JOB ID(s)
            </span>
            <button type="button" className="btn btn-primary" onClick={check} disabled={checking || !cfg}>
              {checking ? `Checking ${checked.length + 1}/${parseIds(idsText).length}…` : 'Check'}
            </button>
          </div>
          {err && <div className="tf-msg bad">{err}</div>}
        </div>

        {checked.length > 0 && (
          <div className="tf-card" style={{ overflowX: 'auto' }}>
            <table className="data">
              <thead>
                <tr>
                  <th>JOB ID</th>
                  {chosen.length > 0 && <th>Will change</th>}
                  <th>Shop · Seller Code</th>
                  <th>Task · Requested</th>
                  <th className="n">SKUs</th>
                  <th>Status</th>
                  <th>Uploaded by</th>
                  <th>Visual editor</th>
                  <th>QC By</th>
                </tr>
              </thead>
              <tbody>
                {checked.map((c) =>
                  c.job ? (
                    <tr key={c.id}>
                      <td>
                        <b>{c.id}</b>
                      </td>
                      {chosen.length > 0 && (
                        <td>
                          {plan(c.job).map((p) => (
                            <div key={p.role} style={{ color: p.tone === 'warn' ? '#b45309' : p.tone === 'good' ? 'var(--good)' : undefined, fontSize: 12.5 }}>
                              {p.role}: {p.text}
                            </div>
                          ))}
                        </td>
                      )}
                      <td>
                        {t(c.job['Shop Name']) || '—'}
                        <div className="tf-hint">{t(c.job['Seller Code'])}</div>
                      </td>
                      <td>
                        {t(c.job['Task Type']) || '—'}
                        <div className="tf-hint">{day(c.job.Timestamp)}</div>
                      </td>
                      <td className="n">{n(c.job['Number of SKU']) || '—'}</td>
                      <td>{t(c.job.Status) || '—'}</td>
                      <td>{t(c.job['Uploaded by']) || <span className="tf-hint">not assigned</span>}</td>
                      <td>{t(c.job['Visual editor']) || <span className="tf-hint">not assigned</span>}</td>
                      <td>{t(c.job['QC By']) || <span className="tf-hint">not assigned</span>}</td>
                    </tr>
                  ) : (
                    <tr key={c.id}>
                      <td>
                        <b>{c.id}</b>
                      </td>
                      <td colSpan={chosen.length ? 8 : 7} style={{ color: 'var(--bad)' }}>
                        {c.error}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        {valid.length > 0 && (
          <div className="tf-card">
            <div className="tf-row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              {ROLES.map((r) => (
                <label className="field" key={r.field}>
                  <span>{r.label}</span>
                  <select className="select" value={pick[r.field]} onChange={(e) => setPick({ ...pick, [r.field]: e.target.value })}>
                    <option value="">— don't change —</option>
                    {options(r.key).map((p) => (
                      <option key={p} value={p}>
                        {p}
                        {workload ? ` · ${workload[r.key]?.[p] ?? 0} open` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="tf-hint">Names are sorted by fewest open jobs first, so work goes to whoever has the least.</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" checked={setRunning} onChange={(e) => setSetRunning(e.target.checked)} />
              Set Status to “Running” for jobs that are Pending or blank
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
              <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
              Replace people who are already assigned (re-assign)
            </label>
            {overwrite && <div className="tf-msg warn">Re-assign is on: existing names in the chosen columns will be replaced. Every change is kept in the Form Log.</div>}
            <div className="tf-actions">
              <button type="button" className="btn btn-primary" onClick={assign} disabled={busy || !chosen.length || !lead.trim()}>
                {busy ? 'Assigning…' : `Assign ${valid.length} job(s)`}
              </button>
            </div>
          </div>
        )}

        {results && (
          <div className="tf-card">
            {results.map((r) => (
              <div key={r.jobId} className={`tf-msg ${!r.ok ? 'bad' : r.skipped?.length ? 'warn' : 'good'}`}>
                <b>{r.jobId}</b>:{' '}
                {!r.ok
                  ? r.reason
                  : `${r.written?.length ? `assigned ${r.written.join(', ')}` : 'nothing changed'}${r.skipped?.length ? ` · kept: ${r.skipped.join('; ')}` : ''}`}
              </div>
            ))}
            <div className="tf-hint">Saved in the Work Sheet and the Form Log. The dashboard shows it after the next “Update data”.</div>
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
                Use the dashboard's connection
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
