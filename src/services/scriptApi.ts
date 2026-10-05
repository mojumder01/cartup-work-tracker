/**
 * Client for the stable Apps Script service (apps-script/Code.gs v2): generic
 * `read` rows and `write` cells. All feature logic lives in the website, so new
 * features don't need a new Apps Script deployment.
 */
import { readAppsScriptJson } from './appsScriptResponse';

export type Cell = string | number | null;
export type WriteValue = Cell | { date: string } | { month: string } | { now: true };

export const OLD_SCRIPT_MESSAGE =
  'The Apps Script Web app is an older version. Paste the latest Code.gs into Apps Script, then Deploy → Manage deployments → ✏️ → Version: New version → Deploy (or let GitHub deploy it automatically — see Settings → Connections).';

export class OldScriptError extends Error {
  constructor() {
    super(OLD_SCRIPT_MESSAGE);
  }
}

export interface ReadParams {
  sheet: 'work' | 'projects' | 'progress' | 'log' | 'commercial' | 'adminQc';
  cols?: string[];
  key?: string;
  q?: string;
  in?: string[];
  /** Keep rows whose column value is NOT one of these … */
  notIn?: { col: string; values: string[] };
  /** … OR whose date columns fall in the last `days` days. */
  recent?: { cols: string[]; days: number };
  /** Skip rows where all of these are empty. */
  need?: string[];
  order?: 'asc' | 'desc';
  limit?: number;
}

export interface ReadResult {
  columns: string[];
  rows: Cell[][];
  total: number;
  /** key lookups: writable columns calculated by formulas. */
  locked?: string[];
  objects: Record<string, Cell>[];
}

export interface WriteOp {
  sheet: 'work' | 'projects' | 'progress';
  op: 'update' | 'append' | 'delete';
  key?: string;
  set?: Record<string, WriteValue>;
  /** Values the person saw; the row is refused if any of them changed since. */
  expect?: Record<string, Cell>;
  /** Work Sheet only: also copy the changed cells to the Content/Commercial "Uplaod Responses Form" tab. */
  mirror?: boolean;
}

export interface WriteResult {
  ok: boolean;
  key: string;
  written?: string[];
  skipped?: { field: string; reason: string }[];
  reason?: string;
  stale?: boolean;
  duplicate?: boolean;
  /** Result of the copy to the Content/Commercial sheet (script 2.1.0+, only when mirror was asked). */
  mirror?: { ok: boolean; written: string[]; skipped: { field: string; reason: string }[]; reason?: string };
}

const looksOld = (msg: string) => /unknown action|unknown sheet/i.test(msg);

/** fetch() that explains an unreachable Web app (archived / deleted deployment, wrong URL) in plain words. */
async function call(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    const id = url.match(/\/s\/([\w-]+)\/exec/)?.[1] ?? '';
    throw new Error(
      `Could not reach the Apps Script Web app …${id.slice(-21)}. If that deployment was archived or replaced, paste the current Web app URL (Manage deployments → Web app → URL) in the dashboard under Settings → Connections (“Use here”), and update "appsScriptUrl" in config/data-source.json on GitHub so everyone gets it.`,
    );
  }
}

export async function scriptRead(url: string, p: ReadParams): Promise<ReadResult> {
  const q = new URLSearchParams({ action: 'read', sheet: p.sheet, t: String(Date.now()) });
  if (p.cols) q.set('cols', p.cols.join(','));
  if (p.key) q.set('key', p.key);
  if (p.q) q.set('q', p.q);
  if (p.in) q.set('in', p.in.join('|'));
  if (p.notIn) q.set('notIn', `${p.notIn.col}:${p.notIn.values.join('|')}`);
  if (p.recent) q.set('recent', `${p.recent.cols.join('|')}:${p.recent.days}`);
  if (p.need) q.set('need', p.need.join('|'));
  if (p.order) q.set('order', p.order);
  if (p.limit) q.set('limit', String(p.limit));
  const res = await call(`${url}?${q.toString()}`);
  if (!res.ok) throw new Error(`The Google Sheets service returned HTTP ${res.status}.`);
  const j = await readAppsScriptJson<{ ok: boolean; error?: string; columns?: string[]; rows?: Cell[][]; total?: number; locked?: string[] }>(res);
  if (!j.ok) {
    if (looksOld(j.error ?? '')) throw new OldScriptError();
    throw new Error(j.error || 'Could not read the sheet.');
  }
  if (!Array.isArray(j.columns) || !Array.isArray(j.rows)) throw new OldScriptError();
  const cols = j.columns;
  return {
    columns: cols,
    rows: j.rows,
    total: j.total ?? j.rows.length,
    locked: j.locked,
    objects: j.rows.map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i] ?? null]))),
  };
}

/** Result of the Microsoft Teams message sent with a Task board assignment (script 2.1.8+). */
export interface NotifyResult {
  ok: boolean;
  sent?: boolean;
  messages?: number;
  reason?: string;
}

export async function scriptWrite(url: string, by: string, ops: WriteOp[]): Promise<WriteResult[]> {
  return (await scriptWriteNotify(url, by, ops)).results;
}

/**
 * scriptWrite + optional notify:{ field } → the script posts the jobs whose `field` it just wrote to
 * Microsoft Teams. `notify` is null when the deployed script is too old to know about it.
 */
export async function scriptWriteNotify(
  url: string,
  by: string,
  ops: WriteOp[],
  notify?: { field: string },
): Promise<{ results: WriteResult[]; notify: NotifyResult[] | null }> {
  const out: WriteResult[] = [];
  const notes: NotifyResult[] = [];
  let old = false;
  for (let i = 0; i < ops.length; i += 200) {
    const res = await call(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'write', by, ops: ops.slice(i, i + 200), ...(notify ? { notify } : {}) }),
    });
    if (!res.ok) throw new Error(`The Google Sheets service returned HTTP ${res.status}.`);
    const j = await readAppsScriptJson<{ ok: boolean; error?: string; results?: WriteResult[]; notify?: NotifyResult }>(res);
    if (!j.ok) {
      if (looksOld(j.error ?? '')) throw new OldScriptError();
      throw new Error(j.error || 'The change was rejected.');
    }
    if (!Array.isArray(j.results)) throw new OldScriptError();
    out.push(...j.results);
    if (j.notify) notes.push(j.notify);
    else if (notify) old = true;
  }
  return { results: out, notify: notify ? (old && !notes.length ? null : notes) : [] };
}

/** Try each Web app URL until one runs the current script. Returns the result and the URL that worked. */
export async function withAnyUrl<T>(urls: string[], fn: (url: string) => Promise<T>): Promise<{ value: T; url: string }> {
  let last: Error = new Error('Not connected: the Apps Script Web app URL is missing.');
  for (const u of urls) {
    try {
      return { value: await fn(u), url: u };
    } catch (e) {
      last = e as Error;
      if (!(e instanceof OldScriptError) && !/HTTP|fetch|network|Google page|could not reach/i.test(last.message)) break;
    }
  }
  throw last;
}

/** yyyy-mm-dd → date value for the sheet; '' stays empty. */
export const asDate = (v: string): WriteValue => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? { date: v } : v);
export const asMonth = (v: string): WriteValue => (/^\d{4}-\d{2}/.test(v) ? { month: v.slice(0, 7) } : v);
