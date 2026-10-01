/**
 * Client for the Governance Apps Script web app (apps-script/Code.gs).
 *
 * Requests are sent as text/plain so the browser does not need a CORS
 * preflight (Apps Script cannot answer OPTIONS requests). No credentials are
 * involved: the script runs as the sheet owner and validates every field.
 */
import type { CellValue } from '../types';
import { readAppsScriptJson } from './appsScriptResponse';

type Row = Record<string, CellValue>;

export class GovernanceApiError extends Error {}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'follow', ...init });
  } catch {
    throw new GovernanceApiError('Could not reach the Governance sheet service. Check your connection and try again.');
  }
  if (!res.ok) {
    throw new GovernanceApiError(
      res.status === 404
        ? 'The Governance sheet service returned HTTP 404: there is no Web app at this URL (deployment deleted, or not the /exec URL from Deploy → Manage deployments). See Settings → Connections.'
        : `The Governance sheet service returned HTTP ${res.status}.`,
    );
  }
  let json: { ok?: boolean; error?: string } & T;
  try {
    json = await readAppsScriptJson<{ ok?: boolean; error?: string } & T>(res);
  } catch (e) {
    throw new GovernanceApiError((e as Error).message);
  }
  if (json.ok === false) throw new GovernanceApiError(json.error || 'The change was rejected by the Governance sheet.');
  return json;
}

export function listLive(url: string) {
  return call<{ projects: Row[]; progress: Row[] }>(`${url}${url.includes('?') ? '&' : '?'}action=list&t=${Date.now()}`);
}

const post = (url: string, body: unknown) =>
  call<{ id: string }>(url, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });

export const createProject = (url: string, project: Row, by: string) => post(url, { action: 'createProject', project, by });
export const updateProject = (url: string, id: string, changes: Row, by: string) => post(url, { action: 'updateProject', id, changes, by });
export const logProgress = (url: string, logs: Row[]) => post(url, { action: 'logProgress', logs });
export const deleteLog = (url: string, id: string) => post(url, { action: 'deleteLog', id });
