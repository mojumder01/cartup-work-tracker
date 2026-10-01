import { useMemo, useRef, useState } from 'react';
import { TEAMS } from '../../config/people.config';
import { useApp } from '../../hooks/AppContext';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { buildCatalogueReport, type CatalogueMode, type CatPeriod } from '../../utils/catalogue';
import { fmtNum, fmtPct, toIsoDate } from '../../utils/format';
import { findPerson } from '../../utils/roster';
import { exportXlsx, stamp, type ExportRow } from '../../utils/export';
import { AchievementBadge, Card, Segmented } from '../ui';
import { Icon } from '../Icon';
import './report.css';

const DAY = 86400000;

/** Prints the report on as many A4-landscape pages as needed. */
function printDocument(el: HTMLElement, title: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('');
  doc.open();
  doc.write(`<!doctype html><html data-theme="light"><head><meta charset="utf-8"><title>${title}</title>${styles}
    <style>@page{size:A4 landscape;margin:10mm}html,body{margin:0;background:#fff}.cat-doc{box-shadow:none;width:auto}.cat-block{break-inside:avoid}
    *{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${el.outerHTML}</body></html>`);
  doc.close();
  setTimeout(() => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1500);
  }, 400);
}

const dash = (n: number | null | undefined) => (n ? fmtNum(n) : '—');

export function CatalogueReport() {
  const { dataset, data, roster } = useApp();
  const [mode, setMode] = useLocalStorage<CatalogueMode>('cartup.catMode', 'day');
  const [dayStr, setDayStr] = useState(() => toIsoDate(Date.now() - DAY));
  const [monthStr, setMonthStr] = useState(() => toIsoDate(Date.now()).slice(0, 7));
  const [hideLeft, setHideLeft] = useState(true);
  const docRef = useRef<HTMLDivElement>(null);

  const period: CatPeriod = useMemo(() => {
    if (mode === 'day') {
      const s = new Date(`${dayStr}T00:00:00`).getTime();
      return { mode, start: s, end: s + DAY };
    }
    const [y, m] = monthStr.split('-').map(Number);
    return { mode, start: new Date(y, m - 1, 1).getTime(), end: new Date(y, m, 1).getTime() };
  }, [mode, dayStr, monthStr]);

  const fallbackStaff = useMemo(() => {
    const by = (team: string) => roster.filter((p) => p.team === team && p.status === 'Active').map((p) => p.name);
    return { production: by('Production'), qc: by('QC'), visual: by('Visual') };
  }, [roster]);

  const report = useMemo(
    () => buildCatalogueReport({ ds: dataset, adminQc: data.sellerQc, perf: data.performance, period, fallbackStaff }),
    [dataset, data, period, fallbackStaff],
  );

  const isLeft = (name: string) => findPerson(roster, name)?.status === 'Left';
  const keep = <T extends { name: string }>(rows: T[], active: (r: T) => boolean) => (hideLeft ? rows.filter((r) => !isLeft(r.name) || active(r)) : rows);
  const production = keep(report.production, (r) => r.total + r.skus > 0);
  const qc = keep(report.qc, (r) => r.sellers + r.skus > 0);
  const visual = keep(report.visual, (r) => r.sellers + r.images > 0);
  const hidden = report.production.length + report.qc.length + report.visual.length - production.length - qc.length - visual.length;
  const sum = <T,>(rows: T[], f: (r: T) => number) => rows.reduce((s, r) => s + f(r), 0);
  const avg = (vals: (number | null)[]) => {
    const v = vals.filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  const label =
    mode === 'day'
      ? new Date(period.start).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : new Date(period.start).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const title = `Catalogue ${mode === 'day' ? 'Daily' : 'Monthly'} Performance — ${label}`;
  const S = report.summary;
  const name = (n: string) => {
    const p = findPerson(roster, n);
    return (
      <>
        {n}
        {p?.status === 'Left' && <span className="badge bad" style={{ marginLeft: 6 }}>Left</span>}
      </>
    );
  };

  const downloadExcel = async () => {
    const rows: ExportRow[] = [[title], []];
    rows.push(['Summary', 'Uploaded', 'Pending', 'QC Done', 'QC Pending', 'No of Image', 'Edited Image Count']);
    rows.push(['Seller Count', S.uploadedSellers, S.pendingSellers, S.qcDoneSellers, S.qcPendingSellers, S.images, S.edited]);
    rows.push(['SKUs Count', S.uploadedSkus, S.pendingSkus, S.qcDoneSkus, S.qcPendingSkus]);
    rows.push([]);
    rows.push(['Production Summary']);
    rows.push(['Employee Name', 'Employee Type', 'Joining Date', 'Target (Sellers)', 'Manual (Sellers)', 'Bulk (Sellers)', 'Total Uploaded (Sellers)', 'Uploaded (SKUs)', 'Achieved %', ...(mode === 'day' ? ['Retail (Sellers)'] : [])]);
    production.forEach((r) => rows.push([r.name, r.type, r.joining, r.target, r.manual, r.bulk, r.total, r.skus, r.pct === null ? null : Number(r.pct.toFixed(1)), ...(mode === 'day' ? [r.retail] : [])]));
    rows.push([]);
    rows.push(['QC Summary']);
    rows.push(['Employee Name', 'Employee Type', 'Joining Date', 'Target (SKUs)', 'Seller Count', 'SKUs Count', ...(mode === 'day' ? ['Within 48h (Sellers)', 'Within 72h (Sellers)', 'Older than 72h'] : []), 'Achieved %']);
    qc.forEach((r) => rows.push([r.name, r.type, r.joining, r.target, r.sellers, r.skus, ...(mode === 'day' ? [r.within48, r.within72, r.older] : []), r.pct === null ? null : Number(r.pct.toFixed(1))]));
    rows.push([]);
    rows.push(['Visual Summary']);
    rows.push(['Employee Name', 'Employee Type', 'Joining Date', 'Target (Sellers)', 'Seller Count', 'Total Image Count', 'Edited Image Count', 'Achieved %']);
    visual.forEach((r) => rows.push([r.name, r.type, r.joining, r.target, r.sellers, r.images, r.edited, r.pct === null ? null : Number(r.pct.toFixed(1))]));
    const w = Math.max(...rows.map((r) => r.length));
    await exportXlsx(`catalogue-${mode === 'day' ? dayStr : monthStr}-${stamp()}.xlsx`, 'Performance', Array(w).fill(''), rows.map((r) => [...r, ...Array(w - r.length).fill(null)]));
  };

  return (
    <>
      <Card
        title="Catalogue Overall Performance"
        subtitle={
          data.performance
            ? `Targets & staff from “${data.performance.spreadsheetTitle}” · numbers from the Work Sheet, Admin Portal QC, ContentCommercial Work and Retail Picks`
            : 'Performance sheet not connected yet — see Settings → Connections'
        }
        actions={
          <div className="rb-actions" style={{ alignItems: 'center' }}>
            <Segmented
              label="Report"
              value={mode}
              onChange={setMode}
              options={[
                { id: 'day', label: 'Daily' },
                { id: 'month', label: 'Monthly' },
              ]}
            />
            {mode === 'day' ? (
              <input type="date" className="input" style={{ width: 160, height: 32 }} value={dayStr} max={toIsoDate(Date.now())} onChange={(e) => e.target.value && setDayStr(e.target.value)} aria-label="Day" />
            ) : (
              <input type="month" className="input" style={{ width: 160, height: 32 }} value={monthStr} onChange={(e) => e.target.value && setMonthStr(e.target.value)} aria-label="Month" />
            )}
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
              <input type="checkbox" checked={hideLeft} onChange={(e) => setHideLeft(e.target.checked)} />
              Hide people who left
            </label>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => docRef.current && printDocument(docRef.current, title)}>
              <Icon name="download" size={14} /> PDF / Print
            </button>
            <button type="button" className="btn btn-sm" onClick={downloadExcel}>
              <Icon name="download" size={14} /> Excel
            </button>
          </div>
        }
      >
        {report.notes.length > 0 && (
          <ul className="muted" style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 12.5 }}>
            {report.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
        <div className="cat-doc" ref={docRef}>
          <div className="cat-title">
            <div>
              <div className="cat-eyebrow">Cartup Content · {mode === 'day' ? 'Daily' : 'Monthly'} Summary</div>
              <h2>{label}</h2>
            </div>
            {hidden > 0 && <span className="muted" style={{ fontSize: 12 }}>{hidden} row(s) of people who left hidden</span>}
          </div>

          <div className="cat-block">
            <table className="cat-table">
              <thead>
                <tr>
                  <th rowSpan={2} />
                  <th colSpan={2}>Production</th>
                  <th colSpan={2}>QC</th>
                  <th colSpan={2}>Visual</th>
                </tr>
                <tr>
                  <th>Uploaded</th>
                  <th>Pending</th>
                  <th>QC Done</th>
                  <th>QC Pending</th>
                  <th>No of Image</th>
                  <th>Edited Image Count</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="cat-name">Seller Count</td>
                  <td>{fmtNum(S.uploadedSellers)}</td>
                  <td>{fmtNum(S.pendingSellers)}</td>
                  <td>{fmtNum(S.qcDoneSellers)}</td>
                  <td>{fmtNum(S.qcPendingSellers)}</td>
                  <td>{fmtNum(S.images)}</td>
                  <td>{fmtNum(S.edited)}</td>
                </tr>
                <tr>
                  <td className="cat-name">SKUs Count</td>
                  <td>{fmtNum(S.uploadedSkus)}</td>
                  <td>{fmtNum(S.pendingSkus)}</td>
                  <td>{fmtNum(S.qcDoneSkus)}</td>
                  <td>{fmtNum(S.qcPendingSkus)}</td>
                  <td />
                  <td />
                </tr>
              </tbody>
            </table>
            <div className="cat-foot">Pending figures are the current backlog (not limited to the selected {mode === 'day' ? 'day' : 'month'}), as in the sheet.</div>
          </div>

          <div className="cat-block">
            <h3>{TEAMS[0].id} Summary</h3>
            <table className="cat-table">
              <thead>
                <tr>
                  <th className="cat-name">Employee Name</th>
                  <th>Employee Type</th>
                  <th>Joining Date</th>
                  <th>{mode === 'day' ? 'Daily' : 'Monthly'} Target (Sellers)</th>
                  <th>Manual (Sellers)</th>
                  <th>Bulk (Sellers)</th>
                  <th>Total Uploaded (Sellers)</th>
                  <th>Uploaded (SKUs)</th>
                  <th>Achieved %</th>
                  {mode === 'day' && <th>Retail Picks (Sellers)</th>}
                </tr>
              </thead>
              <tbody>
                {production.map((r) => (
                  <tr key={r.name}>
                    <td className="cat-name">{name(r.name)}</td>
                    <td>{r.type}</td>
                    <td>{r.joining}</td>
                    <td>{dash(r.target)}</td>
                    <td>{dash(r.manual)}</td>
                    <td>{dash(r.bulk)}</td>
                    <td>{dash(r.total)}</td>
                    <td>{dash(r.skus)}</td>
                    <td>{r.pct === null ? '—' : <AchievementBadge pct={r.pct} />}</td>
                    {mode === 'day' && <td>{dash(r.retail)}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="cat-name">Total</td>
                  <td />
                  <td />
                  <td>{fmtNum(sum(production, (r) => r.target ?? 0))}</td>
                  <td>{fmtNum(sum(production, (r) => r.manual))}</td>
                  <td>{fmtNum(sum(production, (r) => r.bulk))}</td>
                  <td>{fmtNum(sum(production, (r) => r.total))}</td>
                  <td>{fmtNum(sum(production, (r) => r.skus))}</td>
                  <td>{fmtPct(avg(production.map((r) => r.pct)))}</td>
                  {mode === 'day' && <td>{fmtNum(sum(production, (r) => r.retail))}</td>}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="cat-block">
            <h3>QC Summary</h3>
            <table className="cat-table">
              <thead>
                <tr>
                  <th className="cat-name">Employee Name</th>
                  <th>Employee Type</th>
                  <th>Joining Date</th>
                  <th>{mode === 'day' ? 'Daily' : 'Monthly'} Target (SKUs)</th>
                  <th>Seller Count</th>
                  <th>SKUs Count</th>
                  {mode === 'day' && (
                    <>
                      <th>Within 48h (Sellers)</th>
                      <th>Within 72h (Sellers)</th>
                      <th>Older than 72h</th>
                    </>
                  )}
                  <th>Achieved %</th>
                </tr>
              </thead>
              <tbody>
                {qc.map((r) => (
                  <tr key={r.name}>
                    <td className="cat-name">{name(r.name)}</td>
                    <td>{r.type}</td>
                    <td>{r.joining}</td>
                    <td>{dash(r.target)}</td>
                    <td>{dash(r.sellers)}</td>
                    <td>{dash(r.skus)}</td>
                    {mode === 'day' && (
                      <>
                        <td>{dash(r.within48)}</td>
                        <td>{dash(r.within72)}</td>
                        <td>{dash(r.older)}</td>
                      </>
                    )}
                    <td>{r.pct === null || !r.skus ? '—' : <AchievementBadge pct={r.pct} />}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="cat-name">Total</td>
                  <td />
                  <td />
                  <td />
                  <td>{fmtNum(sum(qc, (r) => r.sellers))}</td>
                  <td>{fmtNum(sum(qc, (r) => r.skus))}</td>
                  {mode === 'day' && (
                    <>
                      <td>{fmtNum(sum(qc, (r) => r.within48))}</td>
                      <td>{fmtNum(sum(qc, (r) => r.within72))}</td>
                      <td>{fmtNum(sum(qc, (r) => r.older))}</td>
                    </>
                  )}
                  <td>{fmtPct(avg(qc.filter((r) => r.skus).map((r) => r.pct)))}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="cat-block">
            <h3>Visual Summary</h3>
            <table className="cat-table">
              <thead>
                <tr>
                  <th className="cat-name">Employee Name</th>
                  <th>Employee Type</th>
                  <th>Joining Date</th>
                  <th>Target (Sellers)</th>
                  <th>Seller Count</th>
                  <th>Total Image Count</th>
                  <th>Edited Image Count</th>
                  <th>Achieved %</th>
                </tr>
              </thead>
              <tbody>
                {visual.map((r) => (
                  <tr key={r.name}>
                    <td className="cat-name">{name(r.name)}</td>
                    <td>{r.type}</td>
                    <td>{r.joining}</td>
                    <td>{dash(r.target)}</td>
                    <td>{dash(r.sellers)}</td>
                    <td>{dash(r.images)}</td>
                    <td>{dash(r.edited)}</td>
                    <td>{r.pct === null ? '—' : <AchievementBadge pct={r.pct} />}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="cat-name">Total</td>
                  <td />
                  <td />
                  <td>{fmtNum(sum(visual, (r) => r.target ?? 0))}</td>
                  <td>{fmtNum(sum(visual, (r) => r.sellers))}</td>
                  <td>{fmtNum(sum(visual, (r) => r.images))}</td>
                  <td>{fmtNum(sum(visual, (r) => r.edited))}</td>
                  <td>{fmtPct(avg(visual.map((r) => r.pct)))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="cat-foot">
            Achieved %: Production = Total Uploaded ÷ target · QC = SKUs ÷ target · Visual = Seller Count ÷ target. “—” = no target in the sheet. Generated{' '}
            {new Date().toLocaleString('en-GB')}.
          </div>
        </div>
      </Card>
    </>
  );
}
