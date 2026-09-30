/**
 * Dashboard data mapping.
 *
 * Everything the dashboard needs to know about the Google Sheet lives here.
 * Column names default to the exact names used in the "Work Sheet" tab of the
 * reference workbook. If a column is renamed in the live sheet, change it here;
 * metrics whose column is missing show "N/A" instead of guessed numbers.
 */

export const dashboardConfig = {
  /** Where the dashboard loads its data from (relative to the site root). */
  dataUrl: 'data/data.json',

  /** Browser re-checks data.json on this interval. Viewers can change it in Settings. */
  autoRefreshMinutes: 5,

  /** Show a warning banner when the published data is older than this. */
  staleAfterMinutes: 90,

  /** First day of the week for "This Week" (0 = Sunday, matches Google Sheets WEEKNUM default). */
  weekStartsOn: 0 as 0 | 1 | 2 | 3 | 4 | 5 | 6,

  /** Work Sheet column names. */
  columns: {
    jobId: 'JOB ID',
    timestamp: 'Timestamp',
    taskType: 'Task Type',
    shopName: 'Shop Name',
    skuCount: 'Number of SKU',
    driveLink: 'Google drive link',
    verticalHead: 'Vertical Head',
    kam: 'KAM',
    l1Category: 'L1 Category',
    sellerCode: 'Seller Code',
    fileType: 'File Type',
    status: 'Status',
    uploadedBy: 'Uploaded by',
    imageSource: 'Image Source',
    visualEditor: 'Visual editor',
    imageStatus: 'Image Status',
    imageCount: 'Image count',
    editedByHand: 'Edited (By Hand)',
    editedByAi: 'Edited (By AI)',
    uploadedSku: 'Uploaded SKU Count',
    rejectedSku: 'Rejected SKU Count',
    qcBy: 'QC By',
    qcStatus: 'QC Status',
    approvedQc: 'Approved QC Count',
    rejectedQc: 'Rejected QC Count',
    qcDate: 'QC approved date',
    uploadDate: 'Upload date',
    imageDate: 'Image Delivered Date',
    weeks: 'Weeks',
    month: 'Month',
    vertical: 'Vertical',
    uploadMonth: 'Upload Month',
    qcMonth: 'QC Approved Month',
    imageMonth: 'Image Delivered Month',
    /** SLA labels in the sheet (e.g. "72 Hours"). Shown as-is; not used as counts. */
    visualSla: 'Visual',
    uploadSla: 'Upload',
    qcSla: 'QC',
  },

  /**
   * A row counts as a work record when at least one of these columns has a value.
   * (The sheet pre-fills JOB IDs and formula columns on empty rows.)
   */
  recordRequiresAnyOf: ['Timestamp', 'Task Type', 'Shop Name'],

  /** Values of the "Status" column that count as Completed / Pending on the KPI cards. */
  statusGroups: {
    completed: ['Done'],
    pending: ['Pending', 'Running'],
  },

  /** QC Status value that means QC was completed. */
  qcDoneValues: ['QC Done'],

  /** Image Status value that means the image work was delivered. */
  imageDeliveredValues: ['Delivered'],

  /** People columns — used by the Employee filter and the Team Performance page. */
  personColumns: ['Uploaded by', 'QC By', 'Visual editor', 'Vertical Head', 'KAM'],

  /** Columns the Employee filter searches (production roles). */
  employeeFilterColumns: ['Uploaded by', 'QC By', 'Visual editor'],

  /** Global dimension filters shown in the filter bar (in order). */
  filterColumns: ['Vertical', 'Task Type', 'Status', 'Uploaded by', 'QC By', 'Visual editor', 'Shop Name', 'L1 Category'],

  /** Filters that appear in the compact (always visible) row. The rest sit behind "More filters". */
  primaryFilterColumns: ['Vertical', 'Task Type', 'Status'],

  /** Date columns the global date filter can be applied to. The first is the default. */
  dateBasisColumns: ['Timestamp', 'Upload date', 'QC approved date', 'Image Delivered Date'],

  /** Columns the global search looks in. */
  searchColumns: ['JOB ID', 'Shop Name', 'Seller Code', 'Task Type', 'KAM', 'L1 Category', 'Status', 'Uploaded by', 'QC By'],

  /** Columns visible in the Work Sheet table by default (viewers can change this). */
  defaultTableColumns: [
    'JOB ID', 'Timestamp', 'Task Type', 'Shop Name', 'Number of SKU', 'Vertical Head', 'KAM', 'L1 Category',
    'Status', 'Uploaded by', 'Uploaded SKU Count', 'Rejected SKU Count', 'QC Status', 'Approved QC Count',
    'Rejected QC Count', 'QC By', 'Visual editor', 'Image Status', 'Image count', 'Edited (By AI)',
  ],

  /**
   * KPI & Target tab mapping.
   *
   * The tab is a report layout: team blocks ("Production Team", "Visaul Team",
   * "QC Team"), each with its own header row. The parser finds every header row
   * containing an employee-name column, reads the rows below it, and pairs
   * Target and Achieved columns using the rules below (first match wins).
   */
  kpi: {
    /** Header of the employee column (regex, case-insensitive). The sheet spells it "Emplyee Name". */
    nameHeader: /^(emplyee|employee|member)\s*name$|^name$|^employee$/i,
    /** Cell holding the KPI reporting month (the sheet's formulas compare month columns with $B$1). */
    periodCell: 'B1',
    /** Cell holding the "as of" date (=TODAY() in the sheet). */
    asOfCell: 'A1',
    metricPairs: [
      {
        id: 'sellers',
        label: 'Sellers',
        scope: 'month',
        target: [/^monthly\s*target/i],
        actual: [/^achieved\s*\(sellers?\)/i],
      },
      {
        id: 'skus',
        label: 'SKUs',
        scope: 'month',
        target: [/^no\.?\s*of\s*skus?$/i, /^sku\s*target/i],
        actual: [/^total\s*achieved\s*\(skus?\)/i, /^achieved\s*\(skus?\)/i],
      },
      {
        id: 'images',
        label: 'Images',
        scope: 'month',
        target: [/^image\s*target/i],
        actual: [/^achieved\s*\(images?\)/i],
      },
      {
        id: 'sellersToday',
        label: 'Sellers today',
        scope: 'today',
        target: [/^daily\s*target/i],
        actual: [/^today\s*achieved\s*\(sellers?\)/i],
      },
    ] as KpiMetricPairRule[],
  },
};

export interface KpiMetricPairRule {
  id: string;
  label: string;
  /** "month" pairs feed the headline achievement; "today" pairs are shown separately. */
  scope: 'month' | 'today';
  target: RegExp[];
  actual: RegExp[];
}

export type DashboardConfig = typeof dashboardConfig;
export const C = dashboardConfig.columns;
