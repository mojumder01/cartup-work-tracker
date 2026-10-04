import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useApp } from './AppContext';
import { useLocalStorage } from './useLocalStorage';
import * as api from '../services/governanceApi';
import { parseAdhoc, tableToObjects, toProgress, toProjects, type Project, type ProgressLog } from '../utils/governance';
import type { CellValue } from '../types';

type Row = Record<string, CellValue>;

export { LOCAL_URL_KEY, isAppsScriptUrl, localAppsScriptUrl } from '../services/appsScriptUrl';
import { localAppsScriptUrl } from '../services/appsScriptUrl';

/** Writes made in this browser that the sheet has not confirmed yet (shown as "saving…/pending sync"). */
interface Pending {
  projects: Row[];
  updates: { id: string; changes: Row; at: number }[];
  logs: Row[];
  deletedLogs: string[];
}
const EMPTY: Pending = { projects: [], updates: [], logs: [], deletedLogs: [] };

function useGovernanceState() {
  const { data } = useApp();
  const gov = data.governance ?? null;
  // A Web app URL saved in Settings → Connections (this browser only) wins over the GitHub variable, so a new deployment can be tested.
  const writeUrl = localAppsScriptUrl() || gov?.writeUrl || null;
  const adhoc = useMemo(() => parseAdhoc(gov?.adhoc), [gov]);

  const [live, setLive] = useState<{ projects: Row[]; progress: Row[]; at: number } | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [pending, setPending] = useLocalStorage<Pending>('cartup.govPending', EMPTY);
  const [who, setWho] = useLocalStorage<string>('cartup.govUser', '');

  const reload = useCallback(async () => {
    if (!writeUrl) return;
    setLoadingLive(true);
    try {
      const r = await api.listLive(writeUrl);
      setLive({ projects: r.projects ?? [], progress: r.progress ?? [], at: Date.now() });
      setLiveError(null);
    } catch (e) {
      setLiveError((e as Error).message);
    } finally {
      setLoadingLive(false);
    }
  }, [writeUrl]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Source of truth: live Apps Script data when available, else the last sync.
  const baseProjects = useMemo(() => toProjects(live ? live.projects : tableToObjects(gov?.projects)), [live, gov]);
  const baseLogs = useMemo(() => toProgress(live ? live.progress : tableToObjects(gov?.progress)), [live, gov]);

  // Drop pending items once the sheet contains them.
  useEffect(() => {
    const pIds = new Set(baseProjects.map((p) => p.id));
    const lIds = new Set(baseLogs.map((l) => l.id));
    const next: Pending = {
      projects: pending.projects.filter((p) => !pIds.has(String(p['Project ID']))),
      logs: pending.logs.filter((l) => !lIds.has(String(l['Log ID']))),
      deletedLogs: pending.deletedLogs.filter((id) => lIds.has(id)),
      // Keep an update until a newer "Updated At" arrives from the sheet.
      updates: pending.updates.filter((u) => {
        const p = baseProjects.find((x) => x.id === u.id);
        return !p || (p.updatedAt ?? 0) < u.at - 5000;
      }),
    };
    if (JSON.stringify(next) !== JSON.stringify(pending)) setPending(next);
  }, [baseProjects, baseLogs, pending, setPending]);

  const projects: Project[] = useMemo(() => {
    const byId = new Map(baseProjects.map((p) => [p.id, p]));
    for (const p of toProjects(pending.projects)) byId.set(p.id, { ...p, pending: true });
    for (const u of pending.updates) {
      const p = byId.get(u.id);
      if (!p) continue;
      const merged = toProjects([{ ...projectToRow(p), ...u.changes }])[0];
      byId.set(u.id, { ...merged, createdAt: p.createdAt, pending: true });
    }
    return [...byId.values()].sort((a, b) => (b.createdAt ?? Date.now()) - (a.createdAt ?? Date.now()));
  }, [baseProjects, pending]);

  const logs: ProgressLog[] = useMemo(() => {
    const deleted = new Set(pending.deletedLogs);
    const pend = toProgress(pending.logs).map((l) => ({ ...l, pending: true }));
    const ids = new Set(baseLogs.map((l) => l.id));
    return [...baseLogs.filter((l) => !deleted.has(l.id)), ...pend.filter((l) => !ids.has(l.id))];
  }, [baseLogs, pending]);

  const guard = () => {
    if (!writeUrl) throw new api.GovernanceApiError('Project editing is not set up yet. Deploy the Apps Script and add GOVERNANCE_APPS_SCRIPT_URL (see README).');
  };

  const createProject = useCallback(
    async (row: Row) => {
      guard();
      await api.createProject(writeUrl!, row, who);
      setPending({ ...pending, projects: [...pending.projects, { ...row, 'Created At': new Date().toISOString() }] });
      reload();
    },
    [writeUrl, who, pending, reload],
  );
  const updateProject = useCallback(
    async (id: string, changes: Row) => {
      guard();
      await api.updateProject(writeUrl!, id, changes, who);
      setPending({ ...pending, updates: [...pending.updates, { id, changes, at: Date.now() }] });
      reload();
    },
    [writeUrl, who, pending, reload],
  );
  /** One or more progress entries (one per report line) in a single request. */
  const logProgress = useCallback(
    async (rows: Row[]) => {
      guard();
      await api.logProgress(writeUrl!, rows, who);
      setPending({ ...pending, logs: [...pending.logs, ...rows] });
      reload();
    },
    [writeUrl, who, pending, reload],
  );
  const deleteLog = useCallback(
    async (id: string) => {
      guard();
      await api.deleteLog(writeUrl!, id, who);
      setPending({ ...pending, deletedLogs: [...pending.deletedLogs, id], logs: pending.logs.filter((l) => l['Log ID'] !== id) });
      reload();
    },
    [writeUrl, who, pending, reload],
  );

  return {
    gov,
    adhoc,
    projects,
    logs,
    writeUrl,
    live: !!live,
    liveAt: live?.at ?? null,
    liveError,
    loadingLive,
    reload,
    who,
    setWho,
    createProject,
    updateProject,
    logProgress,
    deleteLog,
  };
}

export function projectToRow(p: Project): Row {
  return {
    'Project ID': p.id,
    'Created At': p.createdAt ? new Date(p.createdAt).toISOString() : null,
    'Project Name': p.name,
    'Work Type': p.workType,
    Description: p.description,
    POC: p.pocs.join(', '),
    Assignees: p.assignees.join(', '),
    'Total SKUs': p.totalSkus,
    'Start Date': p.startDate,
    'Due Date': p.dueDate,
    Status: p.status,
    Priority: p.priority,
    'Found Label': p.foundLabel,
    'Updated At': p.updatedAt ? new Date(p.updatedAt).toISOString() : null,
    'Updated By': p.updatedBy,
    'Report Layout': p.layout,
    'Line Header': p.lineHeader,
    Lines: p.lines.join('; '),
    'Value Mode': p.valueMode,
    'Report Note': p.reportNote,
    'Show In Report': p.showInReport ? 'Yes' : 'No',
    Columns: p.columns.length ? JSON.stringify(p.columns) : '',
    Rows: p.rowsFrom,
    Compare: p.compare,
    'Show Delta': p.showDelta ? 'Yes' : 'No',
    'Total Label': p.totalLabel,
    Target: p.target,
    Reports: p.reports,
    Glance: p.glance ? JSON.stringify(p.glance) : '',
  };
}

type GovernanceState = ReturnType<typeof useGovernanceState>;
const GovCtx = createContext<GovernanceState | null>(null);

/** One shared governance state (live fetch, pending writes) for every page and dialog. */
export function GovernanceProvider({ children }: { children: ReactNode }) {
  return createElement(GovCtx.Provider, { value: useGovernanceState() }, children);
}

export function useGovernance(): GovernanceState {
  const v = useContext(GovCtx);
  if (!v) throw new Error('useGovernance must be used inside GovernanceProvider');
  return v;
}
