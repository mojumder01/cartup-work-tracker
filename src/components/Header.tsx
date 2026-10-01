import { fmtDate, fmtRelative } from '../utils/format';
import type { SyncState } from '../hooks/useSync';
import { Icon } from './Icon';

interface Props {
  updatedAt: string | null;
  checkedAt: number | null;
  loading: boolean;
  /** Re-read the published snapshot (no Google Sheets call). */
  onReload: () => void;
  /** Pull fresh data from Google Sheets (manual sync). */
  sync?: SyncState;
  search?: string;
  onSearch?: (v: string) => void;
}

export function Header({ updatedAt, checkedAt, loading, onReload, sync, search, onSearch }: Props) {
  const updatedMs = updatedAt ? Date.parse(updatedAt) : null;
  const busy = sync && (sync.phase === 'starting' || sync.phase === 'waiting');
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
            Data from Google Sheets: <strong>{updatedMs ? fmtDate(updatedMs, true) : '—'}</strong>
          </div>
          {updatedMs && (
            <div className="muted" title={checkedAt ? `Page checked ${fmtDate(checkedAt, true)}` : undefined}>
              {fmtRelative(updatedMs)} · updated manually
            </div>
          )}
        </div>
        <button type="button" className="icon-btn" onClick={onReload} disabled={loading} aria-label="Reload page data" title="Reload the published data (does not read Google Sheets)">
          <Icon name="refresh" size={16} className={loading && !busy ? 'spin' : undefined} />
        </button>
        {sync && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={sync.start}
            disabled={busy}
            title="Read the latest data from Google Sheets now (takes about 1–2 minutes)"
          >
            <Icon name={busy ? 'refresh' : 'download'} size={16} className={busy ? 'spin' : undefined} />
            <span>{busy ? 'Updating…' : 'Update data'}</span>
          </button>
        )}
      </div>
    </header>
  );
}
