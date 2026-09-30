import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { NA } from '../utils/format';

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = '',
  bodyClassName = 'card-body',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="actions">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function SectionTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
      {action && (
        <button type="button" className="link" onClick={action.onClick}>
          {action.label} →
        </button>
      )}
    </div>
  );
}

/** Stat tile. Clickable when `onClick` is given (drill-down). */
export function KpiCard({
  label,
  value,
  sub,
  color,
  onClick,
  title,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  color?: string;
  onClick?: () => void;
  title?: string;
}) {
  const body = (
    <>
      <span className="kpi-label">
        {color && <i className="dot" style={{ background: color }} />}
        {label}
      </span>
      <span className={`kpi-value ${value === NA ? 'na' : ''}`}>{value}</span>
      <span className="kpi-sub">{sub}</span>
    </>
  );
  return onClick ? (
    <button type="button" className="kpi" onClick={onClick} title={title ?? `Show ${label} records`}>
      {body}
    </button>
  ) : (
    <div className="kpi" title={title}>
      {body}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <div className={`v ${value === NA ? 'muted' : ''}`}>{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

/** Progress meter; tone follows achievement (≥100 good, ≥70 neutral, else low). */
export function Meter({ pct, label }: { pct: number | null; label?: string }) {
  const tone = pct === null ? '' : pct >= 100 ? 'good' : pct >= 70 ? '' : pct >= 40 ? 'warn' : 'bad';
  return (
    <div className={`meter ${tone}`} role="progressbar" aria-label={label} aria-valuenow={pct ?? undefined} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} />
    </div>
  );
}

export function AchievementBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="badge">N/A</span>;
  const tone = pct >= 100 ? 'good' : pct >= 70 ? 'info' : pct >= 40 ? 'warn' : 'bad';
  const icon: IconName = pct >= 100 ? 'check' : pct >= 40 ? 'clock' : 'alert';
  return (
    <span className={`badge ${tone}`}>
      <Icon name={icon} size={12} />
      {`${pct.toFixed(1).replace(/\.0$/, '')}%`}
    </span>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title = 'No records match', message = 'Try widening the date range or resetting filters.', small, action }: { title?: string; message?: string; small?: boolean; action?: ReactNode }) {
  return (
    <div className={`state ${small ? 'small' : ''}`}>
      <div className="icon">
        <Icon name="filter" />
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function ErrorState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className="state error" role="alert">
      <div className="icon">
        <Icon name="alert" />
      </div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  );
}

export function Banner({ tone, children }: { tone: 'warn' | 'bad'; children: ReactNode }) {
  return (
    <div className={`banner ${tone}`} role={tone === 'bad' ? 'alert' : 'status'}>
      <Icon name="alert" size={16} />
      <div>{children}</div>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="content" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-kpi">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton" style={{ height: 104 }} />
        ))}
      </div>
      <div className="grid grid-2">
        <div className="skeleton" style={{ height: 300 }} />
        <div className="skeleton" style={{ height: 300 }} />
      </div>
      <div className="skeleton" style={{ height: 360 }} />
    </div>
  );
}
