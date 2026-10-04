/**
 * Daily short report message for the team chat, e.g.
 *   24/09/2026
 *   Uploaded SKUs: 5,413 (Seller Done 22)
 *   Image Edited: 21,492 (Seller 14)
 *   Seller Upload Pending: 65 Seller
 * Counted live from the Work Sheet for the chosen day:
 *   Uploaded = Status "Done" with that Upload date (Σ Uploaded SKU Count, rows = sellers)
 *   Image    = Image Delivered Date on that day (Σ Image count, rows = sellers)
 *   Pending  = requested by the end of that day and not uploaded by then (Rejected left out)
 */
import { useEffect, useMemo, useState } from 'react';
import { scriptRead, withAnyUrl } from '../services/scriptApi';

type Cell = string | number | null;
type Row = Record<string, Cell>;

const COLS = ['JOB ID', 'Timestamp', 'Task Type', 'Shop Name', 'Status', 'Uploaded SKU Count', 'Upload date', 'Image count', 'Image Delivered Date'];
const t = (v: Cell | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: Cell | undefined) => (typeof v === 'number' ? v : Number(t(v).replace(/,/g, '')) || 0);
const day = (v: Cell | undefined) => t(v).slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fmt = (n: number) => n.toLocaleString('en-US');

export function DailyReport({ urls }: { urls: string[] }) {
  const [date, setDate] = useState(todayIso);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = async () => {
    if (!urls.length) return;
    setLoading(true);
    setErr(null);
    setEdit(null);
    try {
      // Unfinished jobs + everything uploaded / delivered from the chosen day until today.
      const back = Math.max(1, Math.ceil((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86400000) + 1);
      const { value } = await withAnyUrl(urls, (u) =>
        scriptRead(u, {
          sheet: 'work',
          cols: COLS,
          notIn: { col: 'Status', values: ['Done', 'Rejected'] },
          recent: { cols: ['Upload date', 'Image Delivered Date'], days: back },
          need: ['Task Type', 'Shop Name'],
          limit: 5000,
        }),
      );
      setRows(value.objects);
    } catch (e) {
      setErr((e as Error).message);
    }
    setLoading(false);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, urls.join()]);

  const stats = useMemo(() => {
    if (!rows) return null;
    let skus = 0;
    let sellersDone = 0;
    let images = 0;
    let imageSellers = 0;
    let pending = 0;
    for (const r of rows) {
      if (t(r.Status) === 'Done' && day(r['Upload date']) === date) {
        skus += num(r['Uploaded SKU Count']);
        sellersDone++;
      }
      if (day(r['Image Delivered Date']) === date) {
        images += num(r['Image count']);
        imageSellers++;
      }
      const asked = day(r.Timestamp);
      const up = day(r['Upload date']);
      if (asked && asked <= date && t(r.Status) !== 'Rejected' && (!up || up > date) && !(t(r.Status) === 'Done' && !up)) pending++;
    }
    return { skus, sellersDone, images, imageSellers, pending };
  }, [rows, date]);

  const [y, m, d] = date.split('-');
  const auto = stats
    ? [`${d}/${m}/${y}`, `Uploaded SKUs: ${fmt(stats.skus)} (Seller Done ${stats.sellersDone})`, `Image Edited: ${fmt(stats.images)} (Seller ${stats.imageSellers})`, `Seller Upload Pending: ${stats.pending} Seller`].join('\n')
    : '';
  const text = edit ?? auto;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <details className="tf-card ab-daily">
      <summary>
        <b>Daily report message</b>
        <span className="muted"> · uploaded SKUs, images and upload pending for one day — copy to the team chat</span>
      </summary>
      <div className="ab-daily-body">
        <div className="ab-daily-side">
          <label className="field">
            <span>Day</span>
            <input type="date" className="input" value={date} max={todayIso()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </label>
          {stats && (
            <div className="ab-daily-stats">
              <span>
                Uploaded <b>{fmt(stats.skus)}</b> SKUs · <b>{stats.sellersDone}</b> sellers
              </span>
              <span>
                Images <b>{fmt(stats.images)}</b> · <b>{stats.imageSellers}</b> sellers
              </span>
              <span>
                Upload pending <b>{stats.pending}</b> sellers
              </span>
            </div>
          )}
          <button type="button" className="btn btn-sm" onClick={load} disabled={loading}>
            {loading ? 'Counting…' : '↻ Recount'}
          </button>
        </div>
        <div className="ab-daily-msg">
          {err && <div className="tf-msg bad">{err}</div>}
          <textarea className="input ab-daily-text" rows={6} value={loading && !rows ? 'Counting…' : text} onChange={(e) => setEdit(e.target.value)} aria-label="Daily report message" />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={copy} disabled={!text}>
              {copied ? '✓ Copied' : 'Copy message'}
            </button>
            {edit !== null && (
              <button type="button" className="rb-link" onClick={() => setEdit(null)}>
                Reset to the counted text
              </button>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
