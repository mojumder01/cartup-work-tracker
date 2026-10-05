/**
 * "My tasks" on the Job desk: pick your name → how many of your jobs are Pending / Running
 * (upload), plus image and QC work still in hand, with the list.
 */
import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { scriptRead, withAnyUrl } from '../services/scriptApi';
import { exportXlsx, stamp } from '../utils/export';
import { Waiting } from '../components/Waiting';

type Cell = string | number | null;
type Row = Record<string, Cell>;
type Part = 'Pending' | 'Running' | 'Done' | 'Image' | 'QC';
const PARTS: Part[] = ['Pending', 'Running', 'Done', 'Image', 'QC'];
const PART_LABEL: Record<Part, string> = { Pending: 'Upload pending', Running: 'Upload running', Done: 'Upload done', Image: 'Images in hand', QC: 'QC in hand' };

const COLS = ['JOB ID', 'Timestamp', 'Task Type', 'Shop Name', 'Seller Code', 'Number of SKU', 'Uploaded SKU Count', 'Upload date', 'Google drive link', 'Note', 'Status', 'Uploaded by', 'Visual editor', 'Image Status', 'QC By', 'QC Status'];
const t = (v: Cell | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const same = (a: Cell | undefined, b: string) => t(a).toLowerCase() === b.trim().toLowerCase();
const ageDays = (v: Cell | undefined) => {
  const m = t(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Math.max(0, Math.floor((Date.now() - new Date(+m[1], +m[2] - 1, +m[3]).getTime()) / 86400000)) : null;
};

function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  return fallbackCopy(text);
}
function fallbackCopy(text: string): Promise<void> {
  const box = document.createElement('textarea');
  box.value = text;
  box.setAttribute('readonly', '');
  box.style.position = 'fixed';
  box.style.opacity = '0';
  document.body.appendChild(box);
  box.select();
  const ok = document.execCommand('copy');
  box.remove();
  return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
}

/** A table cell with a small copy button that shows on hover (always visible on touch screens). */
function CopyCell({ text, className, title, children }: { text: string; className?: string; title?: string; children?: ReactNode }) {
  const [done, setDone] = useState<'ok' | 'bad' | null>(null);
  const copy = (e: MouseEvent) => {
    e.stopPropagation(); // don't open the job
    copyText(text)
      .then(() => setDone('ok'))
      .catch(() => setDone('bad'))
      .finally(() => setTimeout(() => setDone(null), 1200));
  };
  return (
    <span className={`mt-cell ${className ?? ''}`}>
      <span className="mt-val" title={title}>
        {children ?? (text || '—')}
      </span>
      {text && (
        <button type="button" className={`mt-copy ${done ?? ''}`} onClick={copy} onKeyDown={(e) => e.stopPropagation()} title={`Copy “${text.length > 60 ? text.slice(0, 60) + '…' : text}”`} aria-label="Copy">
          {done === 'ok' ? '✓' : done === 'bad' ? '!' : '⧉'}
        </button>
      )}
    </span>
  );
}

export function MyTasks({ urls, people, who, onPick, onOpen }: { urls: string[]; people: string[]; who: string; onPick: (name: string) => void; onOpen: (jobId: string) => void }) {
  const [name, setName] = useState(() => (people.some((p) => same(p, who)) ? people.find((p) => same(p, who))! : ''));
  const [rows, setRows] = useState<{ upload: Row[]; done: Row[]; doneTotal: number; image: Row[]; qc: Row[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [part, setPart] = useState<Part>('Pending');
  // Calendar filter on the day the job was requested (Timestamp).
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

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
        // Upload done: every Status except the open / rejected ones (newest rows first).
        scriptRead(u, { sheet: 'work', cols: COLS, q: name, in: ['Uploaded by'], notIn: { col: 'Status', values: ['', 'Pending', 'Running', 'Rejected'] }, limit: 3000 }),
      ]),
    )
      .then(({ value: [a, b, c, d] }) => {
        if (stop) return;
        // The search is "contains"; keep exact name matches only.
        setRows({
          upload: (a.objects as Row[]).filter((r) => same(r['Uploaded by'], name)),
          done: (d.objects as Row[]).filter((r) => same(r['Uploaded by'], name) && t(r.Status) === 'Done'),
          doneTotal: d.total,
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
    const inDates = (r: Row) => {
      const d = t(r.Timestamp).slice(0, 10);
      return (!from || (d && d >= from)) && (!to || (d && d <= to));
    };
    const up = (rows?.upload ?? []).filter(inDates);
    return {
      Pending: up.filter((r) => t(r.Status) === 'Pending' || t(r.Status) === ''),
      Running: up.filter((r) => t(r.Status) === 'Running'),
      // Done counts on the day it was uploaded (Upload date), falling back to the request day.
      Done: (rows?.done ?? []).filter((r) => {
        const d = (t(r['Upload date']) || t(r.Timestamp)).slice(0, 10);
        return (!from || (d && d >= from)) && (!to || (d && d <= to));
      }),
      Image: (rows?.image ?? []).filter(inDates),
      QC: (rows?.qc ?? []).filter(inDates),
    } as Record<Part, Row[]>;
  }, [rows, from, to]);
  const list = [...groups[part]].sort((a, b) =>
    part === 'Done' ? (t(b['Upload date']) || t(b.Timestamp)).localeCompare(t(a['Upload date']) || t(a.Timestamp)) : (ageDays(b.Timestamp) ?? 0) - (ageDays(a.Timestamp) ?? 0),
  );
  const statusOf = (r: Row) =>
    part === 'Image' ? t(r['Image Status']) || 'Not delivered' : part === 'QC' ? t(r['QC Status']) || 'QC pending' : part === 'Done' ? `Done${t(r['Upload date']) ? ' ' + t(r['Upload date']).slice(0, 10) : ''}` : t(r.Status) || 'Pending';
  const [exporting, setExporting] = useState(false);
  const exportList = async () => {
    setExporting(true);
    try {
      const head = ['JOB ID', 'Requested', 'Task Type', 'Shop Name', 'Seller Code', 'Number of SKU', 'Uploaded SKU Count', 'Upload date', 'Note', 'Google drive link', 'Status', 'Image Status', 'QC Status', 'Age (days)'];
      const rowsOut = list.map((r) => [
        t(r['JOB ID']), t(r.Timestamp).slice(0, 10), t(r['Task Type']), t(r['Shop Name']), t(r['Seller Code']),
        typeof r['Number of SKU'] === 'number' ? r['Number of SKU'] : t(r['Number of SKU']),
        typeof r['Uploaded SKU Count'] === 'number' ? r['Uploaded SKU Count'] : t(r['Uploaded SKU Count']),
        t(r['Upload date']).slice(0, 10), t(r.Note), t(r['Google drive link']), t(r.Status), t(r['Image Status']), t(r['QC Status']), ageDays(r.Timestamp),
      ]);
      const range = from || to ? `-${from || 'start'}-to-${to || 'today'}` : '';
      await exportXlsx(`my-tasks-${name}-${PART_LABEL[part]}${range}-${stamp()}.xlsx`.replace(/\s+/g, '-'), PART_LABEL[part], head, rowsOut);
    } finally {
      setExporting(false);
    }
  };

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
      {name && <Waiting active={busy} label={`Loading ${name}'s tasks from the Work Sheet`} />}
      {err && <div className="tf-msg bad">{err}</div>}
      {name && (
        <>
          <div className="mt-dates">
            <label className="field">
              <span>Requested from</span>
              <input type="date" className="input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label className="field">
              <span>to</span>
              <input type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
            </label>
            {(from || to) && (
              <button type="button" className="btn btn-sm" onClick={() => (setFrom(''), setTo(''))}>
                All dates
              </button>
            )}
          </div>
          <div className="mt-stats">
            {PARTS.map((k) => (
              <button key={k} type="button" className={`mt-stat ${part === k ? 'on' : ''} mt-${k.toLowerCase()}`} onClick={() => setPart(k)}>
                <b>{busy && !rows ? '…' : groups[k].length}</b>
                <span>{PART_LABEL[k]}</span>
              </button>
            ))}
          </div>
          <div className="mt-tools">
            <span className="tf-hint">
              {PART_LABEL[part]}: {list.length}
              {part === 'Done' ? ' · dates use the Upload date' : ''}
              {part === 'Done' && rows && rows.doneTotal > rows.done.length ? ` · newest ${rows.done.length} loaded` : ''}
            </span>
            <button type="button" className="btn btn-sm" onClick={exportList} disabled={!list.length || exporting}>
              {exporting ? 'Exporting…' : '⬇ Export Excel'}
            </button>
          </div>
          {rows && list.length === 0 && <div className="tf-hint">Nothing here for {name}{from || to ? ' in these dates' : ''}.</div>}
          {list.length > 0 && (
            <div className="mt-list">
              <div className="mt-row mt-head" aria-hidden="true">
                <span>JOB ID</span>
                <span>Shop</span>
                <span>Seller Code</span>
                <span>Note</span>
                <span>SKU</span>
                <span>Age</span>
                <span>Drive</span>
                <span>Status</span>
              </div>
              {list.slice(0, 100).map((r) => {
                const id = t(r['JOB ID']);
                const link = t(r['Google drive link']);
                const href = /^https?:\/\//i.test(link) ? link : '';
                const age = ageDays(r.Timestamp);
                return (
                  <div
                    key={id}
                    role="button"
                    tabIndex={0}
                    className="mt-row"
                    onClick={() => onOpen(id)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen(id))}
                    title="Open in “Update my task”"
                  >
                    <CopyCell text={id}>
                      <b>{id}</b>
                    </CopyCell>
                    <CopyCell className="mt-shop" text={t(r['Shop Name'])} title={t(r['Shop Name'])} />
                    <CopyCell className="mt-seller" text={t(r['Seller Code'])} />
                    <CopyCell className="mt-note" text={t(r.Note)} title={t(r.Note)} />
                    <CopyCell className="muted" text={t(r['Number of SKU'])} />
                    <CopyCell className="muted" text={age !== null ? `${age}d` : ''}>
                      {age !== null ? `${age}d` : ''}
                    </CopyCell>
                    <CopyCell text={link}>
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={href}>
                          Open ↗
                        </a>
                      ) : (
                        <span className="muted">{link || '—'}</span>
                      )}
                    </CopyCell>
                    <CopyCell className="mt-st" text={statusOf(r)} />
                  </div>
                );
              })}
              {list.length > 100 && <div className="tf-hint">Showing the oldest 100 of {list.length}.</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
