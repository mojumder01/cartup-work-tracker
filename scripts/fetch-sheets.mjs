#!/usr/bin/env node
// Fetches the live Google Sheet and writes public/data/data.json for the dashboard.
//
// Runs in GitHub Actions (see .github/workflows/deploy.yml). Credentials come
// only from environment variables populated by GitHub secrets:
//   GOOGLE_SERVICE_ACCOUNT_JSON  service-account key (raw JSON or base64)
//   GOOGLE_SHEET_ID              optional; overrides config/data-source.json
// For local runs only, GOOGLE_SERVICE_ACCOUNT_FILE may point to a key file kept
// outside git (e.g. credentials/service_account.json, which is .gitignored).
//
// Exit codes: 0 = data written, 1 = fatal error (the previous deployment stays live).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSourceError, getAccessToken, parseServiceAccount } from './lib/google-auth.mjs';
import { batchGetTabs, getSpreadsheetInfo } from './lib/sheets-api.mjs';
import { transformReportTab, transformWorkSheet } from './lib/transform.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(root, process.env.DATA_OUTPUT ?? 'public/data/data.json');

/** Accepts a bare ID or a full Google Sheets URL. */
export function extractSheetId(value) {
  if (!value) return '';
  const m = String(value).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return (m ? m[1] : String(value)).trim();
}

const findTab = (tabs, name) => tabs.find((t) => t.trim().toLowerCase() === name.trim().toLowerCase());

async function main() {
  const config = JSON.parse(await readFile(resolve(root, 'config/data-source.json'), 'utf8'));
  const spreadsheetId = extractSheetId(process.env.GOOGLE_SHEET_ID || config.spreadsheetId);
  if (!spreadsheetId) throw new DataSourceError('CONFIG', 'No spreadsheet ID. Set the GOOGLE_SHEET_ID secret.');

  let rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!rawKey && process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    rawKey = await readFile(resolve(root, process.env.GOOGLE_SERVICE_ACCOUNT_FILE), 'utf8').catch(() => {
      throw new DataSourceError('AUTH', 'GOOGLE_SERVICE_ACCOUNT_FILE could not be read.');
    });
  }
  const serviceAccount = parseServiceAccount(rawKey);
  const token = await getAccessToken(serviceAccount);
  const info = await getSpreadsheetInfo(spreadsheetId, token);
  console.log(`Spreadsheet: "${info.title}" — tabs: ${info.tabs.join(', ')}`);

  const warnings = [];
  const workTab = findTab(info.tabs, config.tabs.work);
  if (!workTab) {
    throw new DataSourceError('WORKSHEET_NOT_FOUND', `Worksheet "${config.tabs.work}" was not found in the spreadsheet.`);
  }
  const kpiTab = findTab(info.tabs, config.tabs.kpi);
  if (!kpiTab) warnings.push(`Worksheet "${config.tabs.kpi}" was not found — KPI & Target section will show N/A.`);
  const targetTab = (config.tabs.target ?? []).map((n) => findTab(info.tabs, n)).find(Boolean) ?? null;

  const reportTabs = [kpiTab, targetTab].filter(Boolean);
  // Two batched requests in total: numbers/serials, then display strings for report tabs.
  const raw = await batchGetTabs(spreadsheetId, token, [workTab, ...reportTabs], 'UNFORMATTED_VALUE');
  const formatted = await batchGetTabs(spreadsheetId, token, reportTabs, 'FORMATTED_VALUE');

  const work = transformWorkSheet(raw[workTab], {
    expectedColumns: config.expectedWorkColumns,
    excludeColumns: config.excludeColumns,
    dateColumns: config.dateColumns,
  });
  warnings.push(...work.warnings);
  if (work.table.columns.length === 0) {
    throw new DataSourceError('INVALID_DATA', 'The Work Sheet tab has no header row; refusing to publish empty data.');
  }

  const report = (tab) => (tab ? { sheet: tab, ...transformReportTab(raw[tab], formatted[tab]) } : null);
  const kpi = report(kpiTab);
  if (kpi && kpi.values.length === 0) warnings.push(`Worksheet "${kpiTab}" is empty.`);

  const data = {
    schemaVersion: 1,
    updatedAt: new Date().toISOString(),
    source: {
      spreadsheetTitle: info.title,
      tabs: info.tabs,
      workSheet: workTab,
      kpiSheet: kpiTab ?? null,
      targetSheet: targetTab,
      workHeaderRow: work.headerRow,
      excludedColumns: config.excludeColumns,
    },
    work: { sheet: workTab, ...work.table },
    kpi,
    target: report(targetTab),
    warnings,
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(data));
  console.log(`Wrote ${OUTPUT}: ${work.table.rows.length} work rows, ${work.table.columns.length} columns.`);
  for (const w of warnings) console.log(`::warning::${w}`);
}

// Only run when executed directly (tests import extractSheetId).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    // Never print raw errors that could include request details; only our friendly messages.
    const msg = err instanceof DataSourceError ? `${err.code}: ${err.message}` : `UNEXPECTED: ${err?.message ?? err}`;
    console.error(`::error::${msg}`);
    process.exit(1);
  });
}
