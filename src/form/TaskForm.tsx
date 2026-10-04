/**
 * Task update form (form.html): an employee checks a JOB ID, sees the row's
 * current values, and updates Status / Uploaded SKU Count / Upload date /
 * Upload Month / Comments. The Apps Script writes them into that JOB ID's row
 * of the Work Sheet and logs old → new values in the "Form Log" tab.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { SearchPanel } from './SearchPanel';
import { asDate, asMonth, scriptRead, scriptWrite, withAnyUrl, type WriteValue } from '../services/scriptApi';

const JOB_COLUMNS = ['JOB ID', 'Timestamp', 'Task Type', 'Shop Name', 'Seller Code', 'KAM', 'Number of SKU', 'Status', 'Uploaded by', 'Uploaded SKU Count', 'Rejected SKU Count', 'Upload date', 'Upload Month', 'QC By', 'QC Status', 'Visual editor', 'Image Status', 'Image count', 'Comments'];
import { isAppsScriptUrl, LOCAL_URL_KEY, localAppsScriptUrl } from '../services/appsScriptUrl';

type Cell = string | number | null;
interface Job {
  'JOB ID': string;
  'Task Type': Cell;
  'Shop Name': Cell;
  'Seller Code': Cell;
  'Number of SKU': Cell;
  Status: Cell;
  'Uploaded by': Cell;
  'Uploaded SKU Count': Cell;
  'Rejected SKU Count': Cell;
  'Upload date': Cell;
  'Upload Month': Cell;
  Comments: Cell;
  Timestamp: Cell;
}
interface Lookup {
  ok: boolean;
  found: boolean;
  id: string;
  job?: Job;
  locked?: string[];
  statuses?: string[];
}
interface FormConfig {
  appsScriptUrl: string | null;
  people: string[];
}

const STATUSES = ['Done', 'Running', 'Pending', 'Rejected'];
const pad = (n: number) => String(n).padStart(2, '0');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const text = (v: Cell) => (v === null || v === undefined ? '' : String(v));
/** Sheet values → yyyy-mm-dd (the script already sends dates that way). */
const isoDay = (v: Cell) => {
  const s = text(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
};
const monthOf = (iso: string) => (iso ? iso.slice(0, 7) : '');
const fmt = (v: Cell | undefined) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('en-US') : String(v));

function useStored(key: string, initial: string): [string, (v: string) => void] {
  const [v, setV] = useState(() => {
    try {
      return localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });
  return [
    v,
    (x: string) => {
      setV(x);
      try {
        localStorage.setItem(key, x);
      } catch {
        /* ignore */
      }
    },
  ];
}

export function TaskForm() {
  const [cfg, setCfg] = useState<FormConfig | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [who, setWho] = useStored('cartup.formUser', '');
  const [jobInput, setJobInput] = useState(() => new URLSearchParams(location.search).get('job') ?? '');
  const [tab, setTab] = useState<'search' | 'update'>(() => (new URLSearchParams(location.search).get('job') ? 'update' : 'search'));
  const [checking, setChecking] = useState(false);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [f, setF] = useState({ status: '', sku: '', date: '', month: '', monthTouched: false, comments: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: 'good' | 'bad' | 'warn'; text: string } | null>(null);

  useEffect(() => {
    fetch(`data/form.json?t=${Date.now()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: FormConfig) => setCfg({ appsScriptUrl: j.appsScriptUrl ?? null, people: j.people ?? [] }))
      .catch(() => {
        setCfg({ appsScriptUrl: null, people: [] });
        setCfgError('The form settings are not published yet — run “Update data” on the dashboard once.');
      });
  }, []);

  const [localUrl, setLocalUrl] = useState(() => localAppsScriptUrl());
  /** URL that answered a JOB ID check correctly (used for saving). */
  const [workingUrl, setWorkingUrl] = useState<string | null>(null);
  const candidates = [...new Set([localUrl, cfg?.appsScriptUrl].filter((u): u is string => !!u))];
  const url = workingUrl || candidates[0] || null;
  const [editUrl, setEditUrl] = useState<string | null>(null);
  const saveLocalUrl = (v: string | null) => {
    try {
      if (v) localStorage.setItem(LOCAL_URL_KEY, JSON.stringify(v.trim()));
      else localStorage.removeItem(LOCAL_URL_KEY);
    } catch {
      /* ignore */
    }
    setLocalUrl(v ? v.trim() : null);
    setWorkingUrl(null);
    setEditUrl(null);
  };
  const job = lookup?.found ? lookup.job! : null;
  const locked = new Set(lookup?.locked ?? []);
  const statuses = lookup?.statuses?.length ? lookup.statuses : STATUSES;

  const check = async (raw?: string, keepResult = false) => {
    const id = (raw ?? jobInput).trim().toUpperCase();
    if (!keepResult) setResult(null);
    setLookup(null);
    setLookupError(null);
    if (!id) return setLookupError('Enter a JOB ID.');
    if (!url) return setLookupError('The form is not connected to Google Sheets yet (Apps Script Web app URL missing).');
    setJobInput(id);
    setChecking(true);
    try {
      // Try each known Web app URL (this browser's, then the default) until one runs the current script.
      const { value: r, url: used } = await withAnyUrl(candidates, (u) => scriptRead(u, { sheet: 'work', key: id, cols: JOB_COLUMNS }));
      setWorkingUrl(used);
      const j: Lookup = r.objects.length
        ? { ok: true, found: true, id, job: r.objects[0] as unknown as Job, locked: r.locked ?? [], statuses: STATUSES }
        : { ok: true, found: false, id };
      setLookup(j);
      if (j.found && j.job) {
        const d = isoDay(j.job['Upload date']);
        setF({
          status: text(j.job.Status),
          sku: text(j.job['Uploaded SKU Count']),
          date: d,
          month: monthOf(isoDay(j.job['Upload Month'])),
          monthTouched: false,
          comments: text(j.job.Comments),
        });
      }
    } catch (e) {
      setLookupError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  // Check a JOB ID passed in the link (?job=CCWT10000) once the settings are loaded.
  useEffect(() => {
    if (cfg && jobInput && !lookup && !checking) check(jobInput);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  const total = typeof job?.['Number of SKU'] === 'number' ? job['Number of SKU'] : Number(text(job?.['Number of SKU'] ?? null).replace(/,/g, '')) || null;
  const skuNum = f.sku.trim() ? Number(f.sku.replace(/,/g, '')) : null;

  const changes = useMemo(() => {
    if (!job) return {};
    const c: Record<string, string> = {};
    if (f.status !== text(job.Status)) c.Status = f.status;
    if (f.sku.trim() !== text(job['Uploaded SKU Count'])) c['Uploaded SKU Count'] = f.sku.trim().replace(/,/g, '');
    if (f.date !== isoDay(job['Upload date'])) c['Upload date'] = f.date;
    if (!locked.has('Upload Month') && f.month !== monthOf(isoDay(job['Upload Month']))) c['Upload Month'] = f.month;
    if (f.comments.trim() !== text(job.Comments).trim()) c.Comments = f.comments.trim();
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, f, lookup]);

  const problems: string[] = [];
  const warnings: string[] = [];
  if (job) {
    if (f.sku.trim() && !/^\d[\d,]*$/.test(f.sku.trim())) problems.push('Uploaded SKU Count must be a whole number.');
    if (f.status === 'Done' && !f.date) problems.push('Status “Done” needs an Upload date.');
    if (f.status === 'Done' && !f.sku.trim()) problems.push('Status “Done” needs the Uploaded SKU Count.');
    if (f.date && f.date > todayIso()) problems.push('Upload date cannot be in the future.');
    if (skuNum !== null && total !== null && skuNum > total) warnings.push(`Uploaded SKU Count (${skuNum.toLocaleString('en-US')}) is more than Number of SKU (${total.toLocaleString('en-US')}).`);
    const owner = text(job['Uploaded by']);
    if (owner && who && owner.toLowerCase() !== who.trim().toLowerCase()) warnings.push(`This job is assigned to ${owner}. Your update will be recorded under your name in the Form Log.`);
    if (!owner && who.trim()) warnings.push(`Nobody is set as “Uploaded by” yet — it will be set to ${who.trim()}.`);
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!job || !url) return;
    if (!who.trim()) return setResult({ tone: 'bad', text: 'Choose your name first.' });
    if (problems.length) return setResult({ tone: 'bad', text: problems.join(' ') });
    if (!Object.keys(changes).length) return setResult({ tone: 'warn', text: 'Nothing changed — the row already has these values.' });
    setBusy(true);
    setResult(null);
    try {
      // expect = the values shown when the JOB ID was checked; the script refuses to save if the row changed since.
      const jobRow = job as unknown as Record<string, Cell>;
      const set: Record<string, WriteValue> = {};
      for (const [k, v] of Object.entries(changes)) {
        set[k] = k === 'Upload date' ? asDate(v) : k === 'Upload Month' ? asMonth(v) : k === 'Uploaded SKU Count' ? (v === '' ? '' : Number(v)) : v;
      }
      const fields = Object.keys(set);
      // Credit the work to the person submitting when nobody is set as uploader yet.
      if (!text(job['Uploaded by']) && who.trim()) set['Uploaded by'] = who.trim();
      const expect = Object.fromEntries([...fields, 'Uploaded by'].map((k) => [k, jobRow[k] ?? null]));
      const [j] = await scriptWrite(url, who.trim(), [{ sheet: 'work', op: 'update', key: job['JOB ID'], set, expect }]);
      if (!j.ok) {
        throw new Error(
          j.stale
            ? `Not saved — this job was changed by someone else after you checked it (${j.reason?.replace(/^.*\((.*)\)$/, '$1')}). Click Check again to load the latest values.`
            : `Not saved: ${j.reason}`,
        );
      }
      const skipped = (j.skipped ?? []).map((x) => `${x.field} (${x.reason})`);
      setResult({
        tone: skipped.length ? 'warn' : 'good',
        text:
          `Saved to the Work Sheet for ${job['JOB ID']}: ${(j.written ?? []).join(', ') || 'no changes'}.` +
          (skipped.length ? ` Not changed: ${skipped.join(', ')}.` : '') +
          ' Reports include it after the next data update.',
      });
      await check(job['JOB ID'], true);
    } catch (e2) {
      setResult({ tone: 'bad', text: (e2 as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setJobInput('');
    setLookup(null);
    setLookupError(null);
    setResult(null);
  };

  return (
    <div className="tf-page">
      <div className="tf-wrap">
        <div className="tf-head">
          <div className="tf-logo" aria-hidden="true">
            C
          </div>
          <div>
            <h1>Cartup job desk</h1>
            <div className="muted">Find a job, or update your work in the Work Sheet</div>
          </div>
        </div>

        {cfgError && <div className="tf-msg warn">{cfgError}</div>}
        {cfg && !url && (
          <div className="tf-msg bad">
            The form is not connected yet: the Apps Script Web app URL is missing. Ask the dashboard admin to finish Settings → Connections.
          </div>
        )}

        <div className="tf-tabs" role="tablist">
          {(['search', 'update'] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {k === 'search' ? 'Search' : 'Update my task'}
            </button>
          ))}
        </div>

        {tab === 'search' && (
          <SearchPanel
            urls={workingUrl ? [workingUrl, ...candidates.filter((u) => u !== workingUrl)] : candidates}
            onUpdate={(id) => {
              setTab('update');
              setJobInput(id);
              check(id);
            }}
          />
        )}

        {tab === 'update' && (
          <>
        <div className="tf-card">
          <label className="field">
            <span>Your name *</span>
            <input className="input" list="tf-people" value={who} onChange={(e) => setWho(e.target.value)} placeholder="Choose or type your name" autoComplete="off" />
            <datalist id="tf-people">
              {(cfg?.people ?? []).map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <form
            className="tf-job"
            onSubmit={(e) => {
              e.preventDefault();
              check();
            }}
          >
            <label className="field">
              <span>JOB ID *</span>
              <input
                className="input"
                value={jobInput}
                onChange={(e) => setJobInput(e.target.value)}
                placeholder="e.g. CCWT10000"
                autoCapitalize="characters"
                autoComplete="off"
                inputMode="text"
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={checking || !cfg}>
              {checking ? 'Checking…' : 'Check'}
            </button>
          </form>
          {lookupError && <div className="tf-msg bad">{lookupError}</div>}
          {lookup && !lookup.found && <div className="tf-msg bad">JOB ID {lookup.id} was not found in the Work Sheet. Check the ID and try again.</div>}
          {job && (
            <dl className="tf-info">
              <dt>JOB ID</dt>
              <dd>{job['JOB ID']}</dd>
              <dt>Shop</dt>
              <dd>
                {fmt(job['Shop Name'])}
                {job['Seller Code'] ? ` · ${job['Seller Code']}` : ''}
              </dd>
              <dt>Task type</dt>
              <dd>{fmt(job['Task Type'])}</dd>
              <dt>Requested</dt>
              <dd>{fmt(isoDay(job.Timestamp) || job.Timestamp)}</dd>
              <dt>Number of SKU</dt>
              <dd>{fmt(job['Number of SKU'])}</dd>
              <dt>Uploaded by</dt>
              <dd>{fmt(job['Uploaded by'])}</dd>
              <dt>Current status</dt>
              <dd>{fmt(job.Status)}</dd>
            </dl>
          )}
        </div>

        {job && (
          <form className="tf-card" onSubmit={submit}>
            <div className="tf-row">
              <label className="field">
                <span>Status</span>
                <select className="select" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, date: e.target.value === 'Done' && !f.date ? todayIso() : f.date, month: e.target.value === 'Done' && !f.date && !f.monthTouched ? monthOf(todayIso()) : f.month })} disabled={locked.has('Status')}>
                  {!statuses.includes(f.status) && <option value={f.status}>{f.status || '—'}</option>}
                  {statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Uploaded SKU Count</span>
                <input className="input" inputMode="numeric" value={f.sku} onChange={(e) => setF({ ...f, sku: e.target.value })} placeholder="0" disabled={locked.has('Uploaded SKU Count')} />
              </label>
              <label className="field">
                <span>Upload date</span>
                <input
                  type="date"
                  className="input"
                  value={f.date}
                  max={todayIso()}
                  onChange={(e) => setF({ ...f, date: e.target.value, month: f.monthTouched ? f.month : monthOf(e.target.value) })}
                  disabled={locked.has('Upload date')}
                />
              </label>
              <label className="field">
                <span>Upload Month</span>
                <input type="month" className="input" value={f.month} onChange={(e) => setF({ ...f, month: e.target.value, monthTouched: true })} disabled={locked.has('Upload Month')} />
                {locked.has('Upload Month') && <div className="tf-hint">Calculated by the sheet from Upload date — no need to fill.</div>}
              </label>
            </div>
            <label className="field">
              <span>Comments</span>
              <textarea className="input" value={f.comments} onChange={(e) => setF({ ...f, comments: e.target.value })} placeholder="Optional" maxLength={1000} disabled={locked.has('Comments')} />
            </label>
            {warnings.map((w) => (
              <div className="tf-msg warn" key={w}>
                {w}
              </div>
            ))}
            {problems.length > 0 && <div className="tf-msg bad">{problems.join(' ')}</div>}
            {result && <div className={`tf-msg ${result.tone}`}>{result.text}</div>}
            <div className="tf-actions">
              <span className="tf-hint" style={{ marginRight: 'auto', alignSelf: 'center' }}>
                {Object.keys(changes).length ? `Will update: ${Object.keys(changes).join(', ')}` : 'No changes yet'}
              </span>
              <button type="button" className="btn" onClick={reset}>
                Another JOB ID
              </button>
              <button type="submit" className="btn btn-primary" disabled={busy || problems.length > 0 || !who.trim()}>
                {busy ? 'Saving…' : 'Save to Work Sheet'}
              </button>
            </div>
          </form>
        )}
          </>
        )}

        <div className="tf-hint" style={{ textAlign: 'center' }}>
          {url ? (
            <>
              Connected to Web app …{url.slice(-26, -5)} ({workingUrl ? 'working' : localUrl === url ? 'saved in this browser' : 'default'}) ·{' '}
            </>
          ) : null}
          <button type="button" className="rb-link" onClick={() => setEditUrl(editUrl === null ? localUrl ?? '' : null)}>
            {editUrl === null ? 'Change connection' : 'Close'}
          </button>
          {editUrl !== null && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <input className="input" value={editUrl} onChange={(e) => setEditUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
              <button type="button" className="btn btn-sm" disabled={!isAppsScriptUrl(editUrl)} onClick={() => saveLocalUrl(editUrl)}>
                Use
              </button>
              {localUrl && (
                <button type="button" className="btn btn-sm" onClick={() => saveLocalUrl(null)} title="Forget the URL saved in this browser and use the dashboard's">
                  Remove saved
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
