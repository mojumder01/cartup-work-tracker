// "Catalogue Overall Performance" spreadsheet: targets, staff list (Team tab)
// and the import tabs (ContentCommercial Work, Retail Picks Upload) used by the
// Daily / Monthly performance report. Failures only warn.
import { DataSourceError } from './google-auth.mjs';
import { batchGetTabs, getSpreadsheetInfo } from './sheets-api.mjs';
import { transformReportTab, transformWorkSheet } from './transform.mjs';

/** Google tab names can be longer than the 31-character Excel copies, so match by prefix too. */
/** Tabs get renamed ("Import - ContentCommercial Work" → "Import - Content/Commercial Work Tracker"), so punctuation is ignored and a longer name still matches. */
const squash = (v) => String(v).toLowerCase().replace(/[^a-z0-9]+/g, '');
const findTab = (tabs, name) => {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  const k = squash(name);
  return (
    tabs.find((t) => t.trim().toLowerCase() === n) ??
    tabs.find((t) => t.trim().toLowerCase().startsWith(n)) ??
    tabs.find((t) => squash(t) === k) ??
    tabs.find((t) => squash(t).startsWith(k)) ??
    null
  );
};

export async function fetchPerformance(token, config, dateColumns, warnings) {
  const perf = config.performance;
  const id = process.env.PERFORMANCE_SHEET_ID || perf?.spreadsheetId;
  if (!perf || !id) return null;
  try {
    const info = await getSpreadsheetInfo(id, token);
    const t = Object.fromEntries(Object.entries(perf.tabs).map(([k, name]) => [k, findTab(info.tabs, name)]));
    for (const [k, v] of Object.entries(t)) if (!v) warnings.push(`Performance sheet: tab "${perf.tabs[k]}" not found.`);
    const report = [t.monthly, t.daily, t.kpi].filter(Boolean);
    const flat = [t.team, t.commercial, t.retail].filter(Boolean);
    const raw = await batchGetTabs(id, token, [...report, ...flat], 'UNFORMATTED_VALUE');
    const formatted = await batchGetTabs(id, token, report, 'FORMATTED_VALUE');
    const rep = (tab) => (tab ? { sheet: tab, ...transformReportTab(raw[tab], formatted[tab]) } : null);
    const table = (tab, columns) => {
      if (!tab) return null;
      const r = transformWorkSheet(raw[tab], { expectedColumns: columns, includeColumns: columns, dateColumns, label: tab });
      return { sheet: tab, ...r.table };
    };
    const out = {
      spreadsheetTitle: info.title,
      tabs: info.tabs,
      monthly: rep(t.monthly),
      daily: rep(t.daily),
      kpi: rep(t.kpi),
      team: table(t.team, perf.teamColumns),
      commercial: table(t.commercial, perf.commercialColumns),
      retail: table(t.retail, perf.retailColumns),
    };
    console.log(`Performance spreadsheet: "${info.title}" — tabs: ${info.tabs.join(', ')}`);
    for (const k of ['team', 'commercial', 'retail']) {
      if (out[k]) console.log(`  [${k}] ${out[k].rows.length} rows · columns: ${out[k].columns.join(' | ')}`);
    }
    return out;
  } catch (err) {
    const msg = err instanceof DataSourceError ? err.message : 'unexpected error';
    warnings.push(`Performance sheet could not be read: ${msg}`);
    console.log(`::warning::Performance sheet could not be read: ${msg}`);
    return null;
  }
}
