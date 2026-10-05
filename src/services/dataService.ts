import { dashboardConfig } from '../config/dashboard.config';
import type { DashboardData } from '../types';
import { decryptCurrent, isLockedFile } from './dashLock';

export class DataLoadError extends Error {
  constructor(
    public kind: 'not-published' | 'network' | 'invalid' | 'locked',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Loads the published snapshot. The browser never talks to Google: it only
 * reads the static data.json that the GitHub Action generated.
 */
/** The password-locked copy (data/data.enc), or null when the site is not locked. */
export async function fetchLockedData(signal?: AbortSignal): Promise<ArrayBuffer | null> {
  const res = await fetch(`${import.meta.env.BASE_URL}data/data.enc?v=${Date.now()}`, { cache: 'no-store', signal });
  if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return null;
  const buf = await res.arrayBuffer();
  return isLockedFile(buf) ? buf : null;
}

let primed: DashboardData | null = null;
/** The lock screen already decrypted the data: hand it to the first load instead of downloading it again. */
export function primeDashboardData(d: DashboardData) {
  primed = d;
}

function checkShape(json: DashboardData): DashboardData {
  if (!json || !json.work || !Array.isArray(json.work.columns) || !Array.isArray(json.work.rows)) {
    throw new DataLoadError('invalid', 'The published data file has an unexpected structure. Re-run the GitHub Action.');
  }
  return json;
}

export async function loadDashboardData(signal?: AbortSignal): Promise<DashboardData> {
  if (primed) {
    const d = primed;
    primed = null;
    return d;
  }
  let locked: ArrayBuffer | null = null;
  try {
    locked = await fetchLockedData(signal);
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }
  if (locked) {
    try {
      return checkShape((await decryptCurrent(locked)) as DashboardData);
    } catch (e) {
      if (e instanceof DataLoadError) throw e;
      throw new DataLoadError('locked', 'The dashboard password has changed. Reload the page and enter the new password.');
    }
  }
  const url = `${import.meta.env.BASE_URL}${dashboardConfig.dataUrl}?v=${Date.now()}`;
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new DataLoadError('network', 'Network error — could not reach the dashboard data. Check your connection and try again.');
  }
  // Some static servers answer a missing file with the HTML app shell instead of a 404.
  if (res.status === 404 || (res.headers.get('content-type') ?? '').includes('text/html')) {
    throw new DataLoadError(
      'not-published',
      'No data has been published yet. Run the "Sync Google Sheet & Deploy" GitHub Action to generate it.',
    );
  }
  if (!res.ok) throw new DataLoadError('network', `The dashboard data could not be loaded (HTTP ${res.status}).`);
  let json: DashboardData;
  try {
    json = await res.json();
  } catch {
    throw new DataLoadError('invalid', 'The published data file is not valid JSON. Re-run the GitHub Action.');
  }
  return checkShape(json);
}
