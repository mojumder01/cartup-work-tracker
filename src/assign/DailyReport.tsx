/**
 * Daily short report messages for the team chat, counted live from the Work Sheet.
 *
 * Production                                 QC
 *   24/09/2026                                 04/10/2026
 *   Uploaded SKUs: 5,413 (Seller Done 22)      Total QC: 6,740
 *   Image Edited: 21,492 (Seller 14)           No. of Sellers: 254
 *   Seller Upload Pending: 65 Seller
 *
 *   Uploaded  = Status "Done" with that Upload date (Σ Uploaded SKU Count, rows = sellers)
 *   Image     = Image Delivered Date on that day (Σ Image count, rows = sellers)
 *   Upload pending = requested by the end of that day and not uploaded by then (Rejected left out)
 *   Total QC  = Σ (Approved + Rejected QC Count) of everything QC'd that day, from three sheets
 *               (same rule as the Daily Performance tab):
 *                 Work Sheet: QC Status "QC Done", QC approved date
 *                 Admin Portal Pending QC: QC Status "Done", QC Date
 *                 Uplaod Responses Form: Task Type "Seller Upload QC", QC Status "QC Done", QC Date
 *   No. of Sellers = number of those rows
 *   QC Pending (shown beside, not in the message) = uploaded by the end of that day and not QC'd by then
 */
import { useEffect, useMemo, useState } from 'react';
import { scriptRead, withAnyUrl } from '../services/scriptApi';

type Cell = string | number | null;
type Row = Record<string, Cell>;
type Kind = 'production' | 'qc';

const COLS = ['JOB ID', 'Timestamp', 'Task Type', 'Shop Name', 'Status', 'Uploaded SKU Count', 'Upload date', 'Image count', 'Image Delivered Date', 'QC Status', 'QC approved date', 'Approved QC Count', 'Rejected QC Count'];
const t = (v: Cell | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: Cell | undefined) => (typeof v === 'number' ? v : Number(t(v).replace(/,/g, '')) || 0);
const day = (v: Cell | undefined) => t(v).slice(0, 10);
const pad = (n: number) => String(n).padStart(2, '0');
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const fmt = (n: number) => n.toLocaleString('en-US');
const QC_FINISHED = /^QC (Done|Rejected)$/;

export function DailyReport({ urls }: { urls: string[] }) {
  const [date, setDate] = useState(todayIso);
  const [kind, setKind] = useState<Kind>('production');
  const [rows, setRows] = useState<Row[] | null>(null);
  /** Other QC sheets (null = not readable — older Apps Script or no access). */
  const [extraQc, setExtraQc] = useState<{ admin: Row[] | null; seller: Row[] | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [edits, setEdits] = useState<Partial<Record<Kind, string>>>({});
  const [copied, setCopied] = useState(false);

  const load = async () => {
    if (!urls.length) return;
    setLoading(true);
    setErr(null);
    setEdits({});
    try {
      const back = Math.max(1, Math.ceil((Date.now() - new Date(`${date}T00:00:00`).getTime()) / 86400000) + 1);
      const { value } = await withAnyUrl(urls, async (u) => {
        // Production: unfinished uploads + everything uploaded / delivered since the day.
        // QC: everything not QC'd yet + everything QC'd since the day.
        const [a, b] = await Promise.all([
          scriptRead(u, { sheet: 'work', cols: COLS, notIn: { col: 'Status', values: ['Done', 'Rejected'] }, recent: { cols: ['Upload date', 'Image Delivered Date'], days: back }, need: ['Task Type', 'Shop Name'], limit: 5000 }),
          scriptRead(u, { sheet: 'work', cols: COLS, notIn: { col: 'QC Status', values: ['QC Done', 'QC Rejected'] }, recent: { cols: ['QC approved date'], days: back }, need: ['Task Type', 'Shop Name'], limit: 5000 }),
        ]);
        const byId = new Map<string, Row>();
        for (const r of [...a.objects, ...b.objects]) byId.set(t(r['JOB ID']) || `row-${byId.size}`, r as Row);
        // The two other QC sheets (Apps Script 2.1.7+); a failure only leaves them out.
        const qcCols = ['Timestamp', 'Task Type', 'QC Status', 'QC Date', 'Approved QC Count', 'Rejected QC Count'];
        const [admin, seller] = await Promise.all([
          scriptRead(u, { sheet: 'adminQc', cols: qcCols, recent: { cols: ['QC Date'], days: back }, limit: 5000 }).then((x) => x.objects as Row[], () => null),
          scriptRead(u, { sheet: 'commercial', cols: qcCols, recent: { cols: ['QC Date'], days: back }, limit: 5000 }).then((x) => x.objects as Row[], () => null),
        ]);
        setExtraQc({ admin, seller });
        return [...byId.values()];
      });
      setRows(value);
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
    const s = { skus: 0, sellersDone: 0, images: 0, imageSellers: 0, pending: 0, qcSkus: 0, qcSellers: 0, qcPending: 0, wsQc: 0, adminQc: 0, sellerQc: 0 };
    for (const r of rows) {
      const status = t(r.Status);
      const up = day(r['Upload date']);
      if (status === 'Done' && up === date) {
        s.skus += num(r['Uploaded SKU Count']);
        s.sellersDone++;
      }
      if (day(r['Image Delivered Date']) === date) {
        s.images += num(r['Image count']);
        s.imageSellers++;
      }
      const asked = day(r.Timestamp);
      if (asked && asked <= date && status !== 'Rejected' && (!up || up > date) && !(status === 'Done' && !up)) s.pending++;
      const qcDay = day(r['QC approved date']);
      if (t(r['QC Status']) === 'QC Done' && qcDay === date) {
        s.qcSkus += num(r['Approved QC Count']) + num(r['Rejected QC Count']);
        s.qcSellers++;
        s.wsQc++;
      }
      // Uploaded by the end of the day, not QC'd by then.
      if (status === 'Done' && up && up <= date && (!QC_FINISHED.test(t(r['QC Status'])) || (qcDay && qcDay > date))) s.qcPending++;
    }
    for (const r of extraQc?.admin ?? []) {
      if (t(r['QC Status']).toLowerCase() !== 'done' || day(r['QC Date']) !== date) continue;
      s.qcSkus += num(r['Approved QC Count']) + num(r['Rejected QC Count']);
      s.qcSellers++;
      s.adminQc++;
    }
    for (const r of extraQc?.seller ?? []) {
      if (t(r['Task Type']) !== 'Seller Upload QC' || t(r['QC Status']) !== 'QC Done' || day(r['QC Date']) !== date) continue;
      s.qcSkus += num(r['Approved QC Count']) + num(r['Rejected QC Count']);
      s.qcSellers++;
      s.sellerQc++;
    }
    return s;
  }, [rows, extraQc, date]);

  const [y, m, d] = date.split('-');
  const auto: Record<Kind, string> = stats
    ? {
        production: [`${d}/${m}/${y}`, `Uploaded SKUs: ${fmt(stats.skus)} (Seller Done ${stats.sellersDone})`, `Image Edited: ${fmt(stats.images)} (Seller ${stats.imageSellers})`, `Seller Upload Pending: ${stats.pending} Seller`].join('\n'),
        qc: [`${d}/${m}/${y}`, `Total QC: ${fmt(stats.qcSkus)}`, `No. of Sellers: ${fmt(stats.qcSellers)}`].join('\n'),
      }
    : { production: '', qc: '' };
  const text = edits[kind] ?? auto[kind];

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
        <span className="muted"> · production and QC numbers for one day — copy to the team chat</span>
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
              <span>
                Total QC <b>{fmt(stats.qcSkus)}</b> · <b>{stats.qcSellers}</b> sellers
              </span>
              <span className="muted" style={{ fontSize: 12 }}>
                Work Sheet {stats.wsQc} · Admin Portal {extraQc?.admin ? stats.adminQc : 'n/a'} · Seller Upload QC {extraQc?.seller ? stats.sellerQc : 'n/a'}
              </span>
              <span>
                QC pending <b>{stats.qcPending}</b> sellers
              </span>
            </div>
          )}
          <button type="button" className="btn btn-sm" onClick={load} disabled={loading}>
            {loading ? 'Counting…' : '↻ Recount'}
          </button>
        </div>
        <div className="ab-daily-msg">
          {err && <div className="tf-msg bad">{err}</div>}
          {kind === 'qc' && extraQc && (!extraQc.admin || !extraQc.seller) && (
            <div className="tf-msg warn">
              {[!extraQc.admin && 'Admin Portal Pending QC', !extraQc.seller && 'Uplaod Responses Form (Seller Upload QC)'].filter(Boolean).join(' and ')} could not be read, so Total QC is incomplete. Update the Apps Script to version 2.1.7 (Settings → Connections) and make sure its account can open those sheets.
            </div>
          )}
          <div className="ab-roles" role="tablist" aria-label="Report" style={{ margin: 0 }}>
            {(['production', 'qc'] as Kind[]).map((k) => (
              <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
                {k === 'production' ? 'Production report' : 'QC report'}
              </button>
            ))}
          </div>
          <textarea
            className="input ab-daily-text"
            rows={6}
            value={loading && !rows ? 'Counting…' : text}
            onChange={(e) => setEdits({ ...edits, [kind]: e.target.value })}
            aria-label="Daily report message"
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={copy} disabled={!text}>
              {copied ? '✓ Copied' : 'Copy message'}
            </button>
            {edits[kind] !== undefined && (
              <button type="button" className="rb-link" onClick={() => setEdits({ ...edits, [kind]: undefined })}>
                Reset to the counted text
              </button>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}
