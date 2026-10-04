// Extra Google Sheets (config "extraSources"): Retail [Picks] Upload Request and
// Admin Portal Pending QC. Each source is one tab (chosen by gid, name or the first
// tab), published as a flat table without login/password/phone/mail columns.
// Failures only add warnings — they never block the main sync.
import { DataSourceError } from './google-auth.mjs';
import { batchGetTabs, getSpreadsheetInfo } from './sheets-api.mjs';
import { transformWorkSheet } from './transform.mjs';

const SECRET_COLUMN = /password|passcode|login\s*id|secret|token|phone|mail/i;

export async function fetchExtraSources(token, config, dateColumns, warnings) {
  const out = {};
  for (const [key, src] of Object.entries(config.extraSources ?? {})) {
    const id = process.env[`${key.toUpperCase()}_SHEET_ID`] || src.spreadsheetId;
    if (!id) {
      out[key] = null;
      continue;
    }
    try {
      const info = await getSpreadsheetInfo(id, token);
      const tab =
        (src.gid !== undefined && info.gids[String(src.gid)]) ||
        (src.tab && info.tabs.find((t) => t.trim().toLowerCase() === String(src.tab).trim().toLowerCase())) ||
        info.tabs[0];
      const raw = await batchGetTabs(id, token, [tab], 'UNFORMATTED_VALUE');
      const grid = raw[tab] ?? [];
      const header = grid.find((r) => (r ?? []).some((c) => c !== null && c !== '')) ?? [];
      const exclude = header.map(String).filter((h) => SECRET_COLUMN.test(h));
      const t = transformWorkSheet(grid, { expectedColumns: src.expectedColumns ?? [], excludeColumns: exclude, dateColumns, label: `${src.label} → ${tab}` });
      warnings.push(...t.warnings.filter((w) => !/missing expected/.test(w)));
      out[key] = { label: src.label, spreadsheetTitle: info.title, tabs: info.tabs, sheet: tab, ...t.table };
      console.log(`${src.label}: "${info.title}" → tab "${tab}" · ${t.table.rows.length} rows · columns: ${t.table.columns.join(' | ')}`);
    } catch (err) {
      const msg = err instanceof DataSourceError ? err.message : 'unexpected error';
      warnings.push(`${src.label} sheet could not be read: ${msg}`);
      console.log(`::warning::${src.label} sheet could not be read: ${msg}`);
      out[key] = null;
    }
  }
  return out;
}
