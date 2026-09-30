// Minimal Google Sheets API v4 client: one metadata request plus one batchGet
// per render option. The whole spreadsheet is read in a handful of requests,
// never row by row, so quota usage stays tiny.
import { DataSourceError } from './google-auth.mjs';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const MAX_ATTEMPTS = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function classify(status, spreadsheetId) {
  if (status === 401) return new DataSourceError('AUTH', 'Authentication with Google failed (HTTP 401).');
  if (status === 403)
    return new DataSourceError(
      'PERMISSION',
      'Permission denied (HTTP 403). Share the Google Sheet with the service-account email (Viewer is enough) and make sure the Google Sheets API is enabled for the project.',
    );
  if (status === 404)
    return new DataSourceError('NOT_FOUND', `Spreadsheet "${spreadsheetId}" was not found (HTTP 404). Check GOOGLE_SHEET_ID.`);
  if (status === 429) return new DataSourceError('QUOTA', 'Google Sheets API quota exceeded (HTTP 429). Try again later or reduce the schedule frequency.');
  if (status >= 500) return new DataSourceError('UNAVAILABLE', `Google Sheets API is temporarily unavailable (HTTP ${status}).`);
  return new DataSourceError('API', `Google Sheets API request failed (HTTP ${status}).`);
}

async function request(url, token, spreadsheetId) {
  for (let attempt = 1; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      if (attempt < MAX_ATTEMPTS) {
        await sleep(2 ** attempt * 1000);
        continue;
      }
      throw new DataSourceError('NETWORK', 'Network error while contacting the Google Sheets API.');
    }
    if (res.ok) return res.json();
    const retryable = res.status === 429 || res.status >= 500;
    if (retryable && attempt < MAX_ATTEMPTS) {
      await sleep(2 ** attempt * 1000);
      continue;
    }
    throw classify(res.status, spreadsheetId);
  }
}

/** Returns the spreadsheet title and the list of tab titles. */
export async function getSpreadsheetInfo(spreadsheetId, token) {
  const url = `${API}/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties(title,sheetId,hidden)`;
  const json = await request(url, token, spreadsheetId);
  return {
    title: json.properties?.title ?? '',
    tabs: (json.sheets ?? []).map((s) => s.properties.title),
  };
}

/** Quotes a tab title for A1 notation: 'KPI & Target' -> "'KPI & Target'". */
export const quoteTab = (title) => `'${title.replace(/'/g, "''")}'`;

/**
 * Reads several whole tabs in one request.
 * @param {'UNFORMATTED_VALUE'|'FORMATTED_VALUE'} valueRenderOption
 * @returns {Promise<Record<string, unknown[][]>>} tab title -> 2D grid
 */
export async function batchGetTabs(spreadsheetId, token, tabs, valueRenderOption) {
  if (tabs.length === 0) return {};
  const params = new URLSearchParams({
    valueRenderOption,
    dateTimeRenderOption: 'SERIAL_NUMBER',
    majorDimension: 'ROWS',
  });
  for (const t of tabs) params.append('ranges', quoteTab(t));
  const url = `${API}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}`;
  const json = await request(url, token, spreadsheetId);
  const out = {};
  (json.valueRanges ?? []).forEach((vr, i) => {
    out[tabs[i]] = vr.values ?? [];
  });
  return out;
}
