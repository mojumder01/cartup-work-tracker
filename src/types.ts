/** A single cell value as published by scripts/fetch-sheets.mjs. */
export type CellValue = string | number | boolean | null;

export interface ReportTab {
  sheet: string;
  /** Unformatted values (numbers, date serials). */
  values: CellValue[][];
  /** Display strings as shown in Google Sheets. */
  formatted: CellValue[][];
}

/** Shape of public/data/data.json. */
export interface DashboardData {
  schemaVersion: number;
  updatedAt: string;
  source: {
    spreadsheetTitle: string;
    tabs: string[];
    workSheet: string;
    kpiSheet: string | null;
    targetSheet: string | null;
    sellerQcSheet?: string | null;
    teamSheet?: string | null;
    workHeaderRow: number | null;
    excludedColumns: string[];
  };
  work: { sheet: string; columns: string[]; rows: CellValue[][] };
  kpi: ReportTab | null;
  target: ReportTab | null;
  /** "Admin portal QC import data" (seller-uploaded QC), selected columns only. */
  sellerQc?: FlatTable | null;
  /** Optional "Team Members" roster tab. */
  team?: FlatTable | null;
  /** Governance team tracker (separate spreadsheet). */
  governance?: GovernanceData | null;
  /** Catalogue Overall Performance spreadsheet (Daily / Monthly report). */
  performance?: PerformanceData | null;
  /** Apps Script web app URL (project writes + "Update data"). */
  appsScriptUrl?: string | null;
  warnings: string[];
}

export interface PerformanceData {
  spreadsheetTitle: string;
  tabs: string[];
  monthly: ReportTab | null;
  daily: ReportTab | null;
  kpi: ReportTab | null;
  team: FlatTable | null;
  commercial: FlatTable | null;
  retail: FlatTable | null;
}

export interface GovernanceData {
  spreadsheetTitle: string;
  tabs: string[];
  /** Regular REVAMP / Ad-Hoc task log ("Main" tab). */
  adhoc: FlatTable | null;
  /** Written by the Apps Script (apps-script/Code.gs). */
  projects: FlatTable | null;
  progress: FlatTable | null;
  /** Apps Script Web app URL used for creating/assigning projects; null = read-only. */
  writeUrl: string | null;
}

export interface FlatTable {
  sheet: string;
  columns: string[];
  rows: CellValue[][];
}

/** One Work Sheet row, with dates pre-parsed for fast filtering. */
export interface WorkRecord {
  /** Position in the sheet (0-based data row) — stable key. */
  idx: number;
  values: Record<string, CellValue>;
  /** Epoch ms per date column (null when empty/unparseable). */
  dates: Record<string, number | null>;
  /** Lower-cased concatenation of the search columns. */
  searchText: string;
}

export interface Dataset {
  columns: string[];
  has: (column: string) => boolean;
  records: WorkRecord[];
  /** Non-numeric values found in numeric columns (data-quality report). */
  quality: { column: string; invalid: number; examples: string[] }[];
}

export interface KpiMetric {
  id: string;
  label: string;
  scope: 'month' | 'today';
  targetHeader: string;
  actualHeader: string;
  target: number | null;
  actual: number | null;
  /** Actual / Target × 100, null when target is 0 or missing. */
  pct: number | null;
  /** Actual − Target, null when either is missing. */
  gap: number | null;
}

export interface KpiEmployee {
  name: string;
  metrics: KpiMetric[];
  /** Every column of the row, keyed by header (display strings). */
  cells: Record<string, string>;
}

export interface KpiSection {
  title: string;
  headers: string[];
  employees: KpiEmployee[];
  /** Metric ids found in this section. */
  metricIds: string[];
  /** Section totals per metric: sum(actual) / sum(target). */
  totals: KpiMetric[];
}

export interface KpiReport {
  sheet: string;
  period: string | null;
  asOf: string | null;
  sections: KpiSection[];
  /** Mean of section-level monthly achievement %, null if none computable. */
  headlinePct: number | null;
  headlineParts: { section: string; metric: string; pct: number }[];
}

export type Route = 'dashboard' | 'work' | 'kpi' | 'team' | 'upload' | 'qc' | 'visual' | 'reports' | 'people' | 'settings' | 'gov-tasks' | 'gov-projects';
