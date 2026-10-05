import { useEffect, type ReactNode } from 'react';
import { dashboardConfig } from './config/dashboard.config';
import { AppProvider, useApp } from './hooks/AppContext';
import { useDashboardData } from './hooks/useDashboardData';
import { useSync, type SyncState } from './hooks/useSync';
import { useHashRoute } from './hooks/useHashRoute';
import { useLocalStorage } from './hooks/useLocalStorage';
import type { Route } from './types';
import { Header } from './components/Header';
import { MobileNav, Sidebar } from './components/Navigation';
import { FilterBar } from './components/FilterBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Banner, ErrorState, LoadingState } from './components/ui';
import { Icon } from './components/Icon';
import { fmtRelative } from './utils/format';
import DashboardPage from './pages/DashboardPage';
import WorkSheetPage from './pages/WorkSheetPage';
import KpiPage from './pages/KpiPage';
import TeamPage from './pages/TeamPage';
import ReportsPage from './pages/ReportsPage';
import PeoplePage from './pages/PeoplePage';
import GovTasksPage from './pages/GovTasksPage';
import GovProjectsPage from './pages/GovProjectsPage';
import SheetsPage from './pages/SheetsPage';
import { GovernanceProvider, localAppsScriptUrl } from './hooks/useGovernance';
import SettingsPage, { type Theme } from './pages/SettingsPage';
import { QcPage, UploadPage, VisualPage } from './pages/SectionPages';
import { BuiltBy } from './components/BuiltBy';

/** Pages that do not depend on the Work Sheet filters. */
const NO_FILTER_ROUTES: Route[] = ['kpi', 'settings', 'people', 'reports', 'gov-tasks', 'gov-projects', 'sheets'];

function ConnectedHeader(props: { updatedAt: string; checkedAt: number | null; loading: boolean; onReload: () => void; sync: SyncState; route: Route }) {
  const { filters, setFilters, navigate } = useApp();
  return (
    <Header
      {...props}
      search={filters.search}
      onSearch={(v) => {
        setFilters((f) => ({ ...f, search: v }));
        if (v && props.route !== 'work' && props.route !== 'dashboard') navigate('work');
      }}
    />
  );
}

function Page({ route, prefs }: { route: Route; prefs: { refreshMinutes: number; setRefreshMinutes: (m: number) => void; theme: Theme; setTheme: (t: Theme) => void } }) {
  switch (route) {
    case 'work':
      return <WorkSheetPage />;
    case 'kpi':
      return <KpiPage />;
    case 'team':
      return <TeamPage />;
    case 'upload':
      return <UploadPage />;
    case 'qc':
      return <QcPage />;
    case 'visual':
      return <VisualPage />;
    case 'reports':
      return <ReportsPage />;
    case 'sheets':
      return <SheetsPage />;
    case 'people':
      return <PeoplePage />;
    case 'gov-tasks':
      return <GovTasksPage />;
    case 'gov-projects':
      return <GovProjectsPage />;
    case 'settings':
      return <SettingsPage {...prefs} />;
    default:
      return <DashboardPage />;
  }
}

function Shell({ route, navigate, sheetTitle, children }: { route: Route; navigate: (r: Route) => void; sheetTitle?: string; children: ReactNode }) {
  return (
    <div className="app">
      <Sidebar route={route} onNavigate={navigate} sheetTitle={sheetTitle} />
      <div className="main">{children}</div>
      <MobileNav route={route} onNavigate={navigate} />
    </div>
  );
}

export default function App() {
  const [route, navigate] = useHashRoute();
  const [refreshMinutes, setRefreshMinutes] = useLocalStorage('cartup.refreshMinutes', dashboardConfig.autoRefreshMinutes);
  const [theme, setTheme] = useLocalStorage<Theme>('cartup.theme', 'system');
  const { data, loading, error, checkedAt, refresh } = useDashboardData(refreshMinutes);
  const sync = useSync(localAppsScriptUrl() || data?.appsScriptUrl || data?.governance?.writeUrl, data?.updatedAt ?? null, refresh);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);

  if (!data) {
    return (
      <Shell route={route} navigate={navigate}>
        <Header updatedAt={null} checkedAt={checkedAt} loading={loading} onReload={refresh} />
        {loading || !error ? (
          <LoadingState />
        ) : (
          <div className="content">
            <div className="card">
              <ErrorState
                title="Dashboard data is unavailable"
                message={error}
                action={
                  <button type="button" className="btn btn-primary" onClick={refresh}>
                    Try again
                  </button>
                }
              />
            </div>
          </div>
        )}
      </Shell>
    );
  }

  const updatedMs = Date.parse(data.updatedAt);
  const stale = dashboardConfig.staleAfterMinutes > 0 && Number.isFinite(updatedMs) && Date.now() - updatedMs > dashboardConfig.staleAfterMinutes * 60000;
  const prefs = { refreshMinutes, setRefreshMinutes, theme, setTheme };

  return (
    <AppProvider data={data} navigate={navigate}>
      <GovernanceProvider>
      <Shell route={route} navigate={navigate} sheetTitle={data.source.spreadsheetTitle}>
        <ConnectedHeader updatedAt={data.updatedAt} checkedAt={checkedAt} loading={loading} onReload={refresh} sync={sync} route={route} />
        <main className="content">
          {!NO_FILTER_ROUTES.includes(route) && <FilterBar showRecordsLink={route !== 'work'} />}
          {sync.phase !== 'idle' && (
            <div className={`sync-banner ${sync.phase}`} role="status">
              <Icon name={sync.phase === 'done' ? 'check' : sync.phase === 'error' ? 'alert' : 'refresh'} size={16} className={sync.phase === 'waiting' || sync.phase === 'starting' ? 'spin' : undefined} />
              <span>{sync.message}</span>
              {sync.actionsUrl && sync.phase !== 'done' && (
                <a href={sync.actionsUrl} target="_blank" rel="noopener noreferrer">
                  GitHub Actions
                </a>
              )}
              <button type="button" className="icon-btn" onClick={sync.dismiss} aria-label="Hide">
                <Icon name="x" size={14} />
              </button>
            </div>
          )}
          {error && <Banner tone="bad">{error} Showing the last loaded data.</Banner>}
          {stale && (
            <Banner tone="warn">
              The data was last synced {fmtRelative(updatedMs)}. The scheduled GitHub Action may be failing — check the Actions tab of the repository.
            </Banner>
          )}
          {data.warnings.length > 0 && route === 'dashboard' && (
            <Banner tone="warn">
              {data.warnings.length} data warning(s) from the last sync.{' '}
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('settings')}>
                View in Settings
              </button>
            </Banner>
          )}
          <ErrorBoundary resetKey={route}>
            <Page route={route} prefs={prefs} />
          </ErrorBoundary>
          <BuiltBy />
        </main>
      </Shell>
      </GovernanceProvider>
    </AppProvider>
  );
}
