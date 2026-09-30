import { dashboardConfig, C } from '../config/dashboard.config';
import type { CellValue, DashboardData, Dataset, WorkRecord } from '../types';
import { isBlank, parseDate, toNumber } from './parse';

/** Columns expected to hold numbers; non-numeric entries are reported, never guessed. */
const NUMERIC_COLUMNS = [C.skuCount, C.uploadedSku, C.rejectedSku, C.approvedQc, C.rejectedQc, C.imageCount];

/** Builds typed records from the published grid (done once per data load). */
export function buildDataset(data: DashboardData): Dataset {
  const { columns, rows } = data.work;
  const colSet = new Set(columns);
  const dateCols = columns.filter((c) => dashboardConfig.dateBasisColumns.includes(c) || /date|timestamp/i.test(c));
  const searchCols = dashboardConfig.searchColumns.filter((c) => colSet.has(c));
  const required = dashboardConfig.recordRequiresAnyOf.filter((c) => colSet.has(c));
  const requiredIdx = required.map((c) => columns.indexOf(c));

  const records: WorkRecord[] = [];
  rows.forEach((row, idx) => {
    if (requiredIdx.length && requiredIdx.every((i) => isBlank(row[i] ?? null))) return;
    const values: Record<string, CellValue> = {};
    columns.forEach((c, i) => {
      values[c] = row[i] ?? null;
    });
    const dates: Record<string, number | null> = {};
    for (const c of dateCols) dates[c] = parseDate(values[c]);
    const searchText = searchCols
      .map((c) => values[c])
      .filter((v) => !isBlank(v))
      .join(' \u0001 ')
      .toLowerCase();
    records.push({ idx, values, dates, searchText });
  });

  const quality = NUMERIC_COLUMNS.filter((c) => colSet.has(c))
    .map((column) => {
      const bad = records.map((r) => r.values[column]).filter((v) => !isBlank(v) && toNumber(v) === null);
      return { column, invalid: bad.length, examples: [...new Set(bad.map(String))].slice(0, 5) };
    })
    .filter((q) => q.invalid > 0);

  return { columns, has: (c) => colSet.has(c), records, quality };
}
