import { dashboardConfig } from '../config/dashboard.config';
import type { DashboardData } from '../types';

export class DataLoadError extends Error {
  constructor(
    public kind: 'not-published' | 'network' | 'invalid',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Loads the published snapshot. The browser never talks to Google: it only
 * reads the static data.json that the GitHub Action generated.
 */
export async function loadDashboardData(signal?: AbortSignal): Promise<DashboardData> {
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
  if (!json || !json.work || !Array.isArray(json.work.columns) || !Array.isArray(json.work.rows)) {
    throw new DataLoadError('invalid', 'The published data file has an unexpected structure. Re-run the GitHub Action.');
  }
  return json;
}
