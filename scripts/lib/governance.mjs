// Governance team tracker: reads the separate Governance spreadsheet
// (Ad-Hoc "Main" tab + the Projects / Project Progress tabs written by the
// Apps Script). Failures here only add warnings — they never block the
// main dashboard sync.
import { DataSourceError } from './google-auth.mjs';
import { batchGetTabs, getSpreadsheetInfo } from './sheets-api.mjs';
import { transformWorkSheet } from './transform.mjs';

const findTab = (tabs, name) => tabs.find((t) => t.trim().toLowerCase() === String(name).trim().toLowerCase());

/** Columns that must never be published (credentials). */
const SECRET_COLUMN = /password|passcode|login\s*id|secret|token/i;

/** Prints the sheet layout (tab names, headers, counts, short category values) — never row data. */
function logStructure(title, tabs, tables) {
  console.log(`Governance spreadsheet: "${title}" — tabs: ${tabs.join(', ')}`);
  for (const [name, t] of Object.entries(tables)) {
    if (!t) continue;
    console.log(`  [${name}] ${t.rows.length} rows · columns: ${t.columns.join(' | ')}`);
    t.columns.forEach((c, i) => {
      const values = new Set(t.rows.map((r) => r[i]).filter((v) => typeof v === 'string' && v.length <= 40));
      if (values.size > 0 && values.size <= 15 && !SECRET_COLUMN.test(c) && !/name|seller|shop|kam|link|remark|note|comment|mail|phone/i.test(c)) {
        console.log(`      ${c}: ${[...values].join(' / ')}`);
      }
    });
  }
}

export async function fetchGovernance(token, config, dateColumns, warnings) {
  const gov = config.governance;
  const id = process.env.GOVERNANCE_SHEET_ID || gov?.spreadsheetId;
  if (!gov || !id) return null;
  try {
    const info = await getSpreadsheetInfo(id, token);
    const adhocTab = findTab(info.tabs, gov.tabs.adhoc);
    const projectsTab = findTab(info.tabs, gov.tabs.projects);
    const progressTab = findTab(info.tabs, gov.tabs.progress);
    if (!adhocTab) warnings.push(`Governance sheet: tab "${gov.tabs.adhoc}" not found — Ad-Hoc tracker will be empty.`);
    const wanted = [adhocTab, projectsTab, progressTab].filter(Boolean);
    const raw = await batchGetTabs(id, token, wanted, 'UNFORMATTED_VALUE');
    const table = (tab, label) => {
      if (!tab) return null;
      const grid = raw[tab] ?? [];
      const header = grid.find((r) => (r ?? []).some((c) => c !== null && c !== '')) ?? [];
      const exclude = header.map(String).filter((h) => SECRET_COLUMN.test(h));
      const t = transformWorkSheet(grid, { excludeColumns: exclude, dateColumns, label });
      warnings.push(...t.warnings.filter((w) => !/missing expected/.test(w)));
      return { sheet: tab, ...t.table };
    };
    const out = {
      spreadsheetTitle: info.title,
      tabs: info.tabs,
      adhoc: table(adhocTab, `Governance ${gov.tabs.adhoc}`),
      projects: table(projectsTab, 'Projects'),
      progress: table(progressTab, 'Project Progress'),
      writeUrl: gov.appsScriptUrl || null,
    };
    logStructure(info.title, info.tabs, { adhoc: out.adhoc, projects: out.projects, progress: out.progress });
    return out;
  } catch (err) {
    const msg = err instanceof DataSourceError ? err.message : 'unexpected error';
    warnings.push(`Governance sheet could not be read: ${msg}`);
    console.log(`::warning::Governance sheet could not be read: ${msg}`);
    return null;
  }
}
