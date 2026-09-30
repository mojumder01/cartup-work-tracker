import { fmtNum, fmtPct } from '../utils/format';

/** Part-to-whole bar for 2–4 parts, with a legend that always prints the numbers. */
export function SplitBar({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="split" role="img" aria-label={parts.map((p) => `${p.label} ${fmtNum(p.value)}`).join(', ')}>
        {total > 0 ? (
          parts.filter((p) => p.value > 0).map((p) => <i key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)
        ) : (
          <i style={{ width: '100%', background: 'var(--bar-track)' }} />
        )}
      </div>
      <div className="legend">
        {parts.map((p) => (
          <span key={p.label}>
            <i className="swatch" style={{ background: p.color }} />
            {p.label} <b className="num">{fmtNum(p.value)}</b>
            <span className="muted">({fmtPct(total ? (p.value / total) * 100 : null)})</span>
          </span>
        ))}
      </div>
    </div>
  );
}
