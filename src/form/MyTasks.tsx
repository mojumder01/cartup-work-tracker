/**
 * "My tasks" on the Job desk: pick your name → how many of your jobs are Pending / Running
 * (upload), plus image and QC work still in hand, with the list.
 */
import { useEffect, useMemo, useState } from 'react';
import { scriptRead, withAnyUrl } from '../services/scriptApi';

type Cell = string | number | null;
type Row = Record<string, Cell>;
type Part = 'Pending' | 'Running' | 'Image' | 'QC';

const COLS = ['JOB ID', 'Timestamp', 'Task Type', 'Shop Name', 'Seller Code', 'Number of SKU', 'Status', 'Uploaded by', 'Visual editor', 'Image Status', 'QC By', 'QC Status'];
const t = (v: Cell | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const same = (a: Cell | undefined, b: string) => t(a).toLowerCase() === b.trim().toLowerCase();
const ageDays = (v: Cell | undefined) => {
  const m = t(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Math.max(0, Math.floor((Date.now() - new Date(+m[1], +m[2] - 1, +m[3]).getTime()) / 86400000)) : null;
};

export function MyTasks({ urls, people, who, onPick, onOpen }: { urls: string[]; people: string[]; who: string; onPick: (name: string) => void; onOpen: (jobId: string) => void }) {
  const [name, setName] = useState(() => (people.some((p) => same(p, who)) ? people.find((p) => same(p, who))! : ''));
  const [rows, setRows] = useState<{ upload: Row[]; image: Row[]; qc: Row[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [part, setPart] = useState<Part>('Pending');

  useEffect(() => {
    if (!name || !urls.length) return setRows(null);
    let stop = false;
    setBusy(true);
    setErr(null);
    withAnyUrl(urls, (u) =>
      Promise.all([
        scriptRead(u, { sheet: 'work', cols: COLS, q: name, in: ['Uploaded by'], notIn: { col: 'Status', values: ['Done', 'Rejected'] }, limit: 1000 }),
        scriptRead(u, { sheet: 'work', cols: COLS, q: name, in: ['Visual editor'], notIn: { col: 'Image Status', values: ['Delivered', 'Rejected'] }, limit: 1000 }),
        scriptRead(u, { sheet: 'work', cols: COLS, q: name, in: ['QC By'], notIn: { col: 'QC Status', values: ['QC Done', 'QC Rejected'] }, limit: 1000 }),
      ]),
    )
      .then(({ value: [a, b, c] }) => {
        if (stop) return;
        // The search is "contains"; keep exact name matches only.
        setRows({
          upload: (a.objects as Row[]).filter((r) => same(r['Uploaded by'], name)),
          image: (b.objects as Row[]).filter((r) => same(r['Visual editor'], name) && t(r.Status) !== 'Rejected'),
          qc: (c.objects as Row[]).filter((r) => same(r['QC By'], name) && t(r.Status) !== 'Rejected'),
        });
      })
      .catch((e) => !stop && setErr((e as Error).message))
      .finally(() => !stop && setBusy(false));
    return () => {
      stop = true;
    };
  }, [name, urls.join()]);

  const groups = useMemo(() => {
    const up = rows?.upload ?? [];
    return {
      Pending: up.filter((r) => t(r.Status) === 'Pending' || t(r.Status) === ''),
      Running: up.filter((r) => t(r.Status) === 'Running'),
      Image: rows?.image ?? [],
      QC: rows?.qc ?? [],
    } as Record<Part, Row[]>;
  }, [rows]);
  const list = [...groups[part]].sort((a, b) => (ageDays(b.Timestamp) ?? 0) - (ageDays(a.Timestamp) ?? 0));

  return (
    <div className="tf-card">
      <label className="field">
        <span>My tasks — choose your name</span>
        <select
          className="select"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (e.target.value) onPick(e.target.value);
          }}
        >
          <option value="">— Select your name —</option>
          {people.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </label>
      {err && <div className="tf-msg bad">{err}</div>}
      {name && (
        <>
          <div className="mt-stats">
            {(['Pending', 'Running', 'Image', 'QC'] as Part[]).map((k) => (
              <button key={k} type="button" className={`mt-stat ${part === k ? 'on' : ''} mt-${k.toLowerCase()}`} onClick={() => setPart(k)}>
                <b>{busy && !rows ? '…' : groups[k].length}</b>
                <span>{k === 'Pending' ? 'Upload pending' : k === 'Running' ? 'Upload running' : k === 'Image' ? 'Images in hand' : 'QC in hand'}</span>
              </button>
            ))}
          </div>
          {rows && list.length === 0 && <div className="tf-hint">Nothing here for {name}.</div>}
          {list.length > 0 && (
            <div className="mt-list">
              {list.slice(0, 100).map((r) => (
                <button key={t(r['JOB ID'])} type="button" className="mt-row" onClick={() => onOpen(t(r['JOB ID']))} title="Open in “Update my task”">
                  <b>{t(r['JOB ID'])}</b>
                  <span className="mt-shop">{t(r['Shop Name']) || '—'}</span>
                  <span className="muted">{t(r['Number of SKU']) ? `${t(r['Number of SKU'])} SKU` : ''}</span>
                  <span className="muted">{ageDays(r.Timestamp) !== null ? `${ageDays(r.Timestamp)}d` : ''}</span>
                  <span className="mt-st">{part === 'Image' ? t(r['Image Status']) || 'Not delivered' : part === 'QC' ? t(r['QC Status']) || 'QC pending' : t(r.Status) || 'Pending'}</span>
                </button>
              ))}
              {list.length > 100 && <div className="tf-hint">Showing the oldest 100 of {list.length}.</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
