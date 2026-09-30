// Pure functions that turn raw Google Sheets grids into the published JSON.
// Kept free of I/O so they can be unit-tested with `npm test`.

/** Google Sheets / Excel epoch: serial 0 = 1899-12-30. */
const SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30);

const pad = (n) => String(n).padStart(2, '0');

/**
 * Converts a spreadsheet date serial into a local wall-clock ISO string.
 * Whole numbers become "YYYY-MM-DD"; fractions keep the time of day.
 * No timezone suffix is added: the sheet stores wall-clock time.
 */
export function serialToIso(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return serial;
  // Round to the nearest second to avoid 11:59:59.999 artifacts.
  const ms = Math.round((serial * 86400000) / 1000) * 1000;
  const d = new Date(SERIAL_EPOCH_MS + ms);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  if (Number.isInteger(serial)) return date;
  return `${date}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

function columnLetter(index) {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Finds the header row: the row (among the first 15) with the most matches to
 * the expected column names; falls back to the first non-empty row.
 */
export function findHeaderRow(grid, expected = []) {
  const want = new Set(expected.map((c) => c.trim().toLowerCase()));
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const row = grid[i] ?? [];
    const score = row.filter((c) => typeof c === 'string' && want.has(c.trim().toLowerCase())).length;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  if (best >= 0) return best;
  return grid.findIndex((row) => (row ?? []).some((c) => !isBlank(c)));
}

/** Makes header names unique and non-empty while preserving the originals. */
export function normalizeHeaders(row, width) {
  const seen = new Map();
  const out = [];
  for (let i = 0; i < width; i++) {
    const raw = row[i];
    let name = isBlank(raw) ? `Column ${columnLetter(i)}` : String(raw).trim();
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count > 0) name = `${name} (${count + 1})`;
    out.push(name);
  }
  return out;
}

/**
 * Converts the Work Sheet grid into { columns, rows } with rows as arrays.
 * - excluded columns are dropped entirely (never published)
 * - date serials in date columns become ISO strings
 * - completely empty rows are dropped
 */
export function transformWorkSheet(grid, { expectedColumns = [], excludeColumns = [], dateColumns = [] } = {}) {
  const warnings = [];
  const headerIndex = findHeaderRow(grid, expectedColumns);
  if (headerIndex < 0) {
    return { table: { columns: [], rows: [] }, warnings: ['The Work Sheet tab is empty.'], headerRow: null };
  }
  const body = grid.slice(headerIndex + 1);
  const width = Math.max(grid[headerIndex].length, ...body.map((r) => r.length), 0);
  const headers = normalizeHeaders(grid[headerIndex], width);

  const excluded = new Set(excludeColumns.map((c) => c.trim().toLowerCase()));
  const dateSet = new Set(dateColumns.map((c) => c.trim().toLowerCase()));
  const keep = [];
  headers.forEach((h, i) => {
    if (excluded.has(h.toLowerCase())) return;
    // Drop auto-named columns that contain no data at all.
    if (h.startsWith('Column ') && isBlank(grid[headerIndex][i]) && body.every((r) => isBlank(r[i]))) return;
    const isDate = dateSet.has(h.toLowerCase()) || /date|timestamp/i.test(h);
    keep.push({ index: i, name: h, isDate });
  });

  const rows = [];
  for (const raw of body) {
    if (!raw || raw.every(isBlank)) continue;
    rows.push(
      keep.map(({ index, isDate }) => {
        const v = raw[index];
        if (isBlank(v)) return null;
        if (isDate && typeof v === 'number') return serialToIso(v);
        return typeof v === 'string' ? v.trim() : v;
      }),
    );
  }

  const present = new Set(headers.map((h) => h.toLowerCase()));
  const missing = expectedColumns.filter(
    (c) => !present.has(c.toLowerCase()) && !excluded.has(c.toLowerCase()),
  );
  if (missing.length) warnings.push(`Work Sheet is missing expected columns: ${missing.join(', ')}.`);
  if (rows.length === 0) warnings.push('The Work Sheet tab has a header row but no data rows.');

  return {
    table: { columns: keep.map((k) => k.name), rows },
    warnings,
    headerRow: headerIndex + 1,
  };
}

/** Trims trailing empty rows and pads rows to a common width. */
export function tidyGrid(grid) {
  const rows = grid.map((r) => (r ?? []).map((v) => (isBlank(v) ? null : typeof v === 'string' ? v.trim() : v)));
  while (rows.length && rows[rows.length - 1].every((v) => v === null)) rows.pop();
  return rows;
}

/**
 * KPI / Target tabs are free-form report layouts (team blocks with their own
 * header rows), so they are published as raw grids. The dashboard parses them
 * with a configurable mapping (src/config/dashboard.config.ts).
 */
export function transformReportTab(values, formatted) {
  return { values: tidyGrid(values ?? []), formatted: tidyGrid(formatted ?? []) };
}
