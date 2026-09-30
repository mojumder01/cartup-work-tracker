import { memo, useState } from 'react';
import { fmtNum, fmtPct } from '../utils/format';

export interface BarItem {
  key: string;
  value: number;
  /** Optional second measure shown as text (e.g. SKU next to job count). */
  secondary?: number;
  color?: string;
}

interface Props {
  items: BarItem[];
  labelHeader: string;
  valueHeader: string;
  secondaryHeader?: string;
  /** Show each value's share of the total. */
  showShare?: boolean;
  limit?: number;
  activeKey?: string;
  onSelect?: (key: string) => void;
  color?: string;
  format?: (n: number) => string;
}

/**
 * Horizontal bar list: label · bar · value. Bars are read against a shared
 * scale; values are always printed so identity never relies on colour alone.
 */
export const BarList = memo(function BarList({
  items,
  labelHeader,
  valueHeader,
  secondaryHeader,
  showShare,
  limit = 8,
  activeKey,
  onSelect,
  color = 'var(--series-1)',
  format = fmtNum,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const total = items.reduce((s, i) => s + i.value, 0);
  const max = Math.max(...items.map((i) => i.value), 0);
  const shown = expanded ? items : items.slice(0, limit);
  const Row = onSelect ? 'button' : 'div';

  return (
    <div className="barlist">
      <div className="barlist-head" aria-hidden="true">
        <span>{labelHeader}</span>
        <span />
        <span style={{ textAlign: 'right' }}>
          {valueHeader}
          {secondaryHeader ? ` · ${secondaryHeader}` : ''}
          {showShare ? ' · %' : ''}
        </span>
      </div>
      {shown.map((item) => (
        <Row
          key={item.key}
          className={`barlist-row ${activeKey === item.key ? 'active' : ''}`}
          {...(onSelect
            ? {
                type: 'button' as const,
                onClick: () => onSelect(item.key),
                'aria-pressed': activeKey === item.key,
                title: activeKey === item.key ? `Clear filter ${item.key}` : `Filter by ${item.key}`,
              }
            : {})}
        >
          <span className="barlist-label">
            {item.color && <i className="swatch" style={{ background: item.color }} />}
            <span>{item.key}</span>
          </span>
          <span className="barlist-track" aria-hidden="true">
            <i style={{ width: `${max ? (item.value / max) * 100 : 0}%`, background: item.color ?? color }} />
          </span>
          <span className="barlist-val">
            {format(item.value)}
            {item.secondary !== undefined && <small>{fmtNum(item.secondary)}</small>}
            {showShare && <small>{fmtPct(total ? (item.value / total) * 100 : null)}</small>}
          </span>
        </Row>
      ))}
      {items.length > limit && (
        <button type="button" className="btn btn-ghost btn-sm barlist-more" onClick={() => setExpanded((e) => !e)}>
          {expanded ? 'Show less' : `Show all ${items.length}`}
        </button>
      )}
    </div>
  );
});
