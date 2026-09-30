import { fmtDate, fmtRelative } from '../utils/format';
import { Icon } from './Icon';

interface Props {
  updatedAt: string | null;
  checkedAt: number | null;
  loading: boolean;
  onRefresh: () => void;
  search?: string;
  onSearch?: (v: string) => void;
}

export function Header({ updatedAt, checkedAt, loading, onRefresh, search, onSearch }: Props) {
  const updatedMs = updatedAt ? Date.parse(updatedAt) : null;
  return (
    <header className="header">
      <div className="header-title">
        <div className="eyebrow">Cartup Content</div>
        <h1>Content Work Performance Dashboard</h1>
      </div>
      <div className="header-meta">
        {onSearch && (
          <label className="search">
            <span className="sr-only">Search work records</span>
            <Icon name="search" size={16} />
            <input
              type="search"
              placeholder="Search JOB ID, shop, seller code, KAM…"
              value={search ?? ''}
              onChange={(e) => onSearch(e.target.value)}
            />
            {search && (
              <button type="button" className="icon-btn clear" onClick={() => onSearch('')} aria-label="Clear search">
                <Icon name="x" size={14} />
              </button>
            )}
          </label>
        )}
        <div className="updated" aria-live="polite">
          <div>
            Last Updated: <strong>{updatedMs ? fmtDate(updatedMs, true) : '—'}</strong>
          </div>
          {updatedMs && (
            <div className="muted" title={checkedAt ? `Checked ${fmtDate(checkedAt, true)}` : undefined}>
              {fmtRelative(updatedMs)} · synced from Google Sheets
            </div>
          )}
        </div>
        <button type="button" className="btn" onClick={onRefresh} disabled={loading} aria-label="Refresh data">
          <Icon name="refresh" size={16} className={loading ? 'spin' : undefined} />
          <span>Refresh</span>
        </button>
      </div>
    </header>
  );
}
