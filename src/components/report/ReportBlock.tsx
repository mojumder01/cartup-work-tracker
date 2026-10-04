/** One table block of a report slide (project, Ad-Hoc table, custom table) — shared by both reports and the project form preview. */
import { fmtNum } from '../../utils/format';
import type { Cell, ReportBlock } from '../../utils/governanceReport';
import './report.css';

const fmtCell = (v: Cell) => (v === null || v === '' ? '—' : typeof v === 'number' ? fmtNum(v) : v);

export function DeltaCell({ v }: { v: Cell }) {
  if (v === 'New') return <b className="rs-new">New</b>;
  if (typeof v !== 'number') return <span className="rs-muted">{fmtCell(v)}</span>;
  return <b className={v > 0 ? 'rs-up' : v < 0 ? 'rs-down' : ''}>{v > 0 ? '+' : ''}{fmtNum(v)}</b>;
}

export function Block({ b }: { b: ReportBlock }) {
  const n = b.head.length;
  return (
    <div className="rs-block">
      <div className="rs-block-title">
        {b.title}
        {b.tag && <span className="rs-tag">{b.tag}</span>}
      </div>
      <table className={`rs-table cols-${n}${b.deltaCol ? '' : ' no-delta'}`}>
        <thead>
          <tr>
            {b.head.map((h, i) => (
              <th key={i} className={i === 0 ? 'rs-name' : undefined} style={{ whiteSpace: 'pre-line' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {b.rows.length === 0 && (
            <tr>
              <td colSpan={n} className="rs-muted">
                No entries in these periods
              </td>
            </tr>
          )}
          {b.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((v, i) =>
                i === 0 ? (
                  <td key={i} className="rs-name">
                    {fmtCell(v)}
                  </td>
                ) : (
                  <td key={i}>{b.deltaCol && i === n - 1 ? <DeltaCell v={v} /> : fmtCell(v)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
        {b.total && (
          <tfoot>
            <tr>
              {b.total.map((v, i) =>
                i === 0 ? (
                  <td key={i} className="rs-name">
                    {fmtCell(v)}
                  </td>
                ) : (
                  <td key={i}>{b.deltaCol && i === n - 1 ? <DeltaCell v={v} /> : fmtCell(v)}</td>
                ),
              )}
            </tr>
          </tfoot>
        )}
      </table>
      {b.note && <div className="rs-block-note">{b.note}</div>}
    </div>
  );
}

