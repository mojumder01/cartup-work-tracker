import { forwardRef } from 'react';
import type { IndividualReport, ReportSection } from '../../utils/individualReport';
import { comparisonTitle } from '../../utils/periods';
import { fmtDate, fmtNum } from '../../utils/format';

export interface Highlight {
  title: string;
  body: string;
}

interface Props {
  report: IndividualReport;
  summary: string;
  notes: string[];
  highlights: Highlight[];
  showGlance: boolean;
  generatedAt: number;
}

const Delta = ({ v, isNew }: { v: number | null; isNew?: boolean }) => {
  if (isNew) return <b className="rs-new">New</b>;
  if (v === null) return <span className="rs-muted">—</span>;
  const cls = v > 0 ? 'rs-up' : v < 0 ? 'rs-down' : '';
  return <b className={cls}>{v > 0 ? '+' : ''}{fmtNum(v)}</b>;
};

function SectionTable({ s, prevShort, curShort }: { s: ReportSection; prevShort: string; curShort: string }) {
  const cell = (nums: Record<string, number> | null, key: string) => (nums ? fmtNum(nums[key]) : '—');
  return (
    <div className="rs-block">
      <div className="rs-block-title">{s.title}</div>
      <table className={`rs-table cols-${s.columns.length * 2 + 2}`}>
        <thead>
          <tr>
            <th className="rs-name">Name</th>
            {s.columns.map((c) => (
              <th key={`p-${c.key}`}>
                {prevShort}
                <br />
                {c.label}
              </th>
            ))}
            {s.columns.map((c) => (
              <th key={`c-${c.key}`}>
                {curShort}
                <br />
                {c.label}
              </th>
            ))}
            <th>{s.deltaLabel}</th>
          </tr>
        </thead>
        <tbody>
          {s.rows.length === 0 && (
            <tr>
              <td colSpan={s.columns.length * 2 + 2} className="rs-muted">
                No people selected
              </td>
            </tr>
          )}
          {s.rows.map((r) => (
            <tr key={r.name}>
              <td className="rs-name">{r.fullName}</td>
              {s.columns.map((c) => (
                <td key={`p-${c.key}`}>{cell(r.prev, c.key)}</td>
              ))}
              {s.columns.map((c) => (
                <td key={`c-${c.key}`}>{cell(r.cur, c.key)}</td>
              ))}
              <td>
                <Delta v={r.delta} isNew={r.isNew} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="rs-name">Total</td>
            {s.columns.map((c) => (
              <td key={`p-${c.key}`}>{fmtNum(s.total.prev[c.key])}</td>
            ))}
            {s.columns.map((c) => (
              <td key={`c-${c.key}`}>{fmtNum(s.total.cur[c.key])}</td>
            ))}
            <td>
              <Delta v={s.total.delta} />
            </td>
          </tr>
        </tfoot>
      </table>
      {s.unavailable.length > 0 && <div className="rs-foot-note">N/A — not found in the sheet: {s.unavailable.join(', ')}</div>}
    </div>
  );
}

function GlanceValue({ prev, cur, lowerIsBetter }: { prev: number | null; cur: number | null; lowerIsBetter?: boolean }) {
  if (prev === null || cur === null) return <div className="rs-g-val">N/A</div>;
  const change = prev ? ((cur - prev) / prev) * 100 : null;
  const up = cur > prev;
  const good = lowerIsBetter ? !up : up;
  return (
    <div className="rs-g-val">
      {fmtNum(prev)} → {fmtNum(cur)}{' '}
      {change !== null && cur !== prev && (
        <span className={good ? 'rs-g-good' : 'rs-g-bad'}>
          {up ? '▲' : '▼'} {change > 0 ? '+' : ''}
          {change.toFixed(1)}%
        </span>
      )}
      {cur === prev && <span className="rs-g-flat">• 0.0%</span>}
      {change === null && cur !== prev && <span className="rs-g-good">New</span>}
    </div>
  );
}

/** 16:9 slide in the Cartup "Individual Summary" template style. Always light (it is a print document). */
export const ReportSlide = forwardRef<HTMLDivElement, Props>(function ReportSlide({ report, summary, notes, highlights, showGlance, generatedAt }, ref) {
  const { prev, cur } = report;
  const sections = Object.fromEntries(report.sections.map((s) => [s.team, s]));
  const left = [sections.Production, sections.Visual].filter(Boolean) as ReportSection[];
  const middle = [sections.QC].filter(Boolean) as ReportSection[];
  const title = comparisonTitle(prev, cur);
  const years = prev.year === cur.year ? String(cur.year) : `${prev.year}–${cur.year}`;
  const periodText = prev.type === 'year' ? `${prev.label} – ${cur.label}` : `${prev.label} – ${cur.label}, ${years}`;

  return (
    <div className="report-slide" ref={ref}>
      <header className="rs-header">
        <h1>Individual Summary — {title}</h1>
        <div className="rs-logo" aria-label="cartup">
          <span className="rs-logo-a">cart</span>
          <span className="rs-logo-b">up</span>
        </div>
      </header>
      <div className="rs-rule" />
      {summary && <p className="rs-summary">❖ {summary}</p>}

      <div className={`rs-grid ${showGlance ? '' : 'no-glance'} ${middle.length || notes.length || highlights.length ? '' : 'no-middle'}`}>
        <div className="rs-col">
          {left.map((s) => (
            <SectionTable key={s.team} s={s} prevShort={prev.short} curShort={cur.short} />
          ))}
          {highlights.slice(0, Math.ceil(highlights.length / 2)).map((h, i) => (
            <div className="rs-note rs-note-gold" key={`hl-${i}`}>
              <div className="rs-note-title">🔑 {h.title}</div>
              <div className="rs-note-body">{h.body}</div>
            </div>
          ))}
        </div>
        <div className="rs-col">
          {middle.map((s) => (
            <SectionTable key={s.team} s={s} prevShort={prev.short} curShort={cur.short} />
          ))}
          {highlights.slice(Math.ceil(highlights.length / 2)).map((h, i) => (
            <div className="rs-note rs-note-gold" key={`hr-${i}`}>
              <div className="rs-note-title">🔑 {h.title}</div>
              <div className="rs-note-body">{h.body}</div>
            </div>
          ))}
          {notes.length > 0 && (
            <div className="rs-note rs-note-teal">
              <div className="rs-note-title">🔑 Key Notes</div>
              <ul>
                {notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
        {showGlance && (
          <aside className="rs-glance">
            <div className="rs-g-title">
              {prev.short} → {cur.short}
            </div>
            <div className="rs-g-sub">At a Glance</div>
            {report.glance.map((g) => (
              <div className="rs-g-item" key={g.label}>
                <div className="rs-g-label">{g.label}</div>
                <GlanceValue prev={g.prev} cur={g.cur} lowerIsBetter={g.lowerIsBetter} />
              </div>
            ))}
            <div className="rs-g-range">
              {prev.short}: {prev.range}
              <br />
              {cur.short}: {cur.range}
            </div>
          </aside>
        )}
      </div>

      <footer className="rs-footer">
        Reporting Period: {periodText} &nbsp;|&nbsp; Content Team &nbsp;|&nbsp; Generated {fmtDate(generatedAt, true)} from Google Sheets
      </footer>
    </div>
  );
});
