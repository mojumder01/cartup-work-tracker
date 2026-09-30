import { memo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtCompact, fmtNum } from '../utils/format';

export interface TrendPoint {
  label: string;
  /** Long label for the tooltip. */
  title?: string;
  value: number;
}

interface Props {
  data: TrendPoint[];
  valueLabel: string;
  color?: string;
  height?: number;
  onSelect?: (index: number) => void;
}

function TooltipBox({ active, payload, valueLabel, color }: { active?: boolean; payload?: { payload: TrendPoint }[]; valueLabel: string; color: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="chart-tooltip">
      <div className="t">{p.title ?? p.label}</div>
      <div className="r">
        <span>
          <i className="swatch" style={{ background: color }} />
          {valueLabel}
        </span>
        <b className="num">{fmtNum(p.value)}</b>
      </div>
    </div>
  );
}

/** Single-series column chart for time trends (one measure per chart — no dual axes). */
export const TrendChart = memo(function TrendChart({ data, valueLabel, color = 'var(--series-1)', height = 260, onSelect }: Props) {
  const barSize = Math.max(4, Math.min(24, Math.floor(900 / Math.max(data.length, 1)) - 4));
  return (
    <div className="chart" style={{ height }} role="img" aria-label={`${valueLabel} over time`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--axis)' }} minTickGap={16} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => fmtCompact(v)} allowDecimals={false} />
          <Tooltip cursor={{ fill: 'var(--surface-hover)' }} content={<TooltipBox valueLabel={valueLabel} color={color} />} />
          <Bar
            dataKey="value"
            fill={color}
            radius={[4, 4, 0, 0]}
            maxBarSize={barSize}
            isAnimationActive={false}
            onClick={onSelect ? (_: unknown, index: number) => onSelect(index) : undefined}
            style={onSelect ? { cursor: 'pointer' } : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});
