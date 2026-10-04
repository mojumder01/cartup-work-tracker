/** Read-only JOB search for employees: JOB ID, Seller Code or shop name → who is doing what. */
import { useState, type FormEvent } from 'react';
import { readAppsScriptJson } from '../services/appsScriptResponse';

type Cell = string | number | null;
type Row = Record<string, Cell>;

const t = (v: Cell | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const n = (v: Cell | undefined) => (typeof v === 'number' ? v.toLocaleString('en-US') : t(v));
const day = (v: Cell | undefined) => (/^\d{4}-\d{2}-\d{2}/.test(t(v)) ? t(v).slice(0, 10) : t(v));

/** One line per stage: done / in progress with whom / not assigned. */
function stage(done: boolean, doneText: string, person: string, status: string) {
  if (done) return { tone: 'good', text: doneText };
  if (person) return { tone: 'warn', text: `Not done yet — assigned to ${person}${status ? ` (${status})` : ''}` };
  return { tone: 'bad', text: `Not done yet — not assigned${status ? ` (${status})` : ''}` };
}

export function SearchPanel({ urls, onUpdate }: { urls: string[]; onUpdate: (jobId: string) => void }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<{ total: number; results: Row[] } | null>(null);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    const query = q.trim();
    setErr(null);
    setRes(null);
    if (query.length < 2) return setErr('Type at least 2 characters.');
    if (!urls.length) return setErr('The form is not connected to Google Sheets yet.');
    setBusy(true);
    let last = '';
    for (const u of urls) {
      try {
        const r = await fetch(`${u}?action=search&q=${encodeURIComponent(query)}&t=${Date.now()}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await readAppsScriptJson<{ ok: boolean; error?: string; results?: Row[]; total?: number }>(r);
        if (!j.ok) throw new Error(j.error || 'Search failed.');
        if (!Array.isArray(j.results)) throw new Error('The Apps Script Web app is an older version without search — deploy the latest script (New version).');
        setRes({ total: j.total ?? j.results.length, results: j.results });
        setBusy(false);
        return;
      } catch (e2) {
        last = (e2 as Error).message;
      }
    }
    setErr(last);
    setBusy(false);
  };

  return (
    <>
      <form className="tf-card" onSubmit={search}>
        <div className="tf-job">
          <label className="field">
            <span>Search by JOB ID, Seller Code or shop name</span>
            <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. CCWT9076, SLC000021651 or Eplaza" autoComplete="off" />
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Searching…' : 'Search'}
          </button>
        </div>
        {err && <div className="tf-msg bad">{err}</div>}
        {res && res.results.length === 0 && <div className="tf-msg warn">Nothing found for “{q.trim()}”.</div>}
        {res && res.total > res.results.length && (
          <div className="tf-hint">
            Showing the newest {res.results.length} of {res.total} matches — type more to narrow it down.
          </div>
        )}
      </form>

      {res?.results.map((r) => {
        const status = t(r.Status);
        const uploaded = status === 'Done' && !!t(r['Upload date']);
        const up = stage(
          uploaded,
          `Uploaded ${n(r['Uploaded SKU Count']) || '—'} SKUs on ${day(r['Upload date'])} by ${t(r['Uploaded by']) || '—'}`,
          t(r['Uploaded by']),
          status,
        );
        const qcSt = t(r['QC Status']);
        const qc = stage(/^QC (Done|Rejected)$/.test(qcSt), `${qcSt} by ${t(r['QC By']) || '—'}`, t(r['QC By']), qcSt);
        const imgSt = t(r['Image Status']);
        const img = stage(imgSt === 'Delivered', `Delivered ${n(r['Image count']) || '—'} images by ${t(r['Visual editor']) || '—'}`, t(r['Visual editor']), imgSt);
        return (
          <div className="tf-card" key={t(r['JOB ID'])}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <b style={{ fontSize: 16 }}>{t(r['JOB ID'])}</b>
              <span className="tf-hint">
                {t(r['Task Type'])}
                {r.Timestamp ? ` · requested ${day(r.Timestamp)}` : ''}
              </span>
              <button type="button" className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => onUpdate(t(r['JOB ID']))}>
                Update this job
              </button>
            </div>
            <dl className="tf-info">
              <dt>Shop</dt>
              <dd>{t(r['Shop Name']) || '—'}</dd>
              <dt>Seller Code</dt>
              <dd>{t(r['Seller Code']) || '—'}</dd>
              <dt>KAM</dt>
              <dd>{t(r.KAM) || '—'}</dd>
              <dt>Number of SKU</dt>
              <dd>{n(r['Number of SKU']) || '—'}</dd>
              <dt>Uploaded by</dt>
              <dd>{t(r['Uploaded by']) || '—'}</dd>
              <dt>QC by</dt>
              <dd>{t(r['QC By']) || '—'}</dd>
              <dt>Image edited by</dt>
              <dd>{t(r['Visual editor']) || '—'}</dd>
              <dt>Uploaded SKU count</dt>
              <dd>{n(r['Uploaded SKU Count']) || '—'}</dd>
            </dl>
            <div className={`tf-msg ${up.tone}`}>Upload: {up.text}</div>
            <div className={`tf-msg ${qc.tone}`}>QC: {qc.text}</div>
            <div className={`tf-msg ${img.tone}`}>Images: {img.text}</div>
            {t(r.Comments) && <div className="tf-hint">Comments: {t(r.Comments)}</div>}
          </div>
        );
      })}
    </>
  );
}
