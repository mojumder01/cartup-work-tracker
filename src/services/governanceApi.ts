/**
 * Governance project writes/reads through the stable Apps Script service
 * (apps-script/Code.gs v2, sheets "projects" and "progress"). Validation of
 * project fields happens in the forms; the script enforces the safety rules.
 */
import type { CellValue } from '../types';
import { asDate, OldScriptError, scriptRead, scriptWrite, type WriteOp, type WriteResult, type WriteValue } from './scriptApi';

type Row = Record<string, CellValue>;

export class GovernanceApiError extends Error {}

const wrap = async <T,>(fn: () => Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof OldScriptError) throw new GovernanceApiError(e.message);
    const msg = (e as Error).message || '';
    if (/fetch|network/i.test(msg)) throw new GovernanceApiError('Could not reach the Governance sheet service. Check your connection and try again.');
    throw new GovernanceApiError(msg);
  }
};

const check = (results: WriteResult[]) => {
  const bad = results.find((r) => !r.ok);
  if (bad) throw new GovernanceApiError(`Not saved (${bad.key}): ${bad.reason}`);
  return { id: results[0]?.key ?? '' };
};

/** Dates go to the sheet as real dates; everything else as is. */
const toValues = (row: Row): Record<string, WriteValue> =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [k, typeof v === 'string' && /(^|\s)Date$/.test(k) ? asDate(v) : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : (v as WriteValue)]),
  );

export function listLive(url: string) {
  return wrap(async () => {
    const [projects, progress] = await Promise.all([scriptRead(url, { sheet: 'projects', order: 'asc', limit: 5000 }), scriptRead(url, { sheet: 'progress', order: 'asc', limit: 5000 })]);
    return { projects: projects.objects as Row[], progress: progress.objects as Row[] };
  });
}

export const createProject = (url: string, project: Row, by: string) =>
  wrap(async () =>
    check(
      await scriptWrite(url, by || 'Dashboard', [
        {
          sheet: 'projects',
          op: 'append',
          // Project ID first so a brand-new tab gets it as column A.
          set: { 'Project ID': project['Project ID'] as WriteValue, Status: 'Planned', 'Show In Report': 'Yes', ...toValues(project), 'Created At': { now: true }, 'Updated At': { now: true }, 'Updated By': by },
        },
      ]),
    ),
  );

export const updateProject = (url: string, id: string, changes: Row, by: string) =>
  wrap(async () =>
    check(await scriptWrite(url, by || 'Dashboard', [{ sheet: 'projects', op: 'update', key: id, set: { ...toValues(changes), 'Updated At': { now: true }, 'Updated By': by } }])),
  );

export const logProgress = (url: string, logs: Row[], by = '') =>
  wrap(async () =>
    check(
      await scriptWrite(
        url,
        by || String(logs[0]?.Person ?? '') || 'Dashboard',
        logs.map((l): WriteOp => ({ sheet: 'progress', op: 'append', set: { ...toValues(l), Timestamp: { now: true } } })),
      ),
    ),
  );

export const deleteLog = (url: string, id: string, by = '') =>
  wrap(async () => check(await scriptWrite(url, by || 'Dashboard', [{ sheet: 'progress', op: 'delete', key: id }])));
