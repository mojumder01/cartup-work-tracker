/**
 * Governance team tracker mapping.
 *
 * Ad-Hoc tasks come from the "Main" tab of the Governance spreadsheet.
 * Each field lists acceptable header names (first match wins), so small
 * renames/typos in the sheet (e.g. "Wroking By") keep working.
 */
export const GOV_COLUMNS = {
  date: ['Date', 'Timestamp'],
  taskType: ['Task Type', 'Work Type'],
  project: ['Project Name', 'Project'],
  shop: ['Shop Name', 'Shop'],
  products: ['Product Count', 'SKU Count', 'Products'],
  shops: ['Shop Count', 'Shops'],
  images: ['Image Count', 'Images'],
  source: ['Source'],
  person: ['Wroking By', 'Working By', 'Worked By', 'Assign', 'Assigned To'],
  status: ['Status'],
  note: ['Note', 'Notes', 'Remarks'],
  month: ['Month'],
  year: ['Year'],
} as const;

export type GovField = keyof typeof GOV_COLUMNS;

/** Project statuses offered in the assign form (in workflow order). */
export const PROJECT_STATUSES = ['Planned', 'In Progress', 'On Hold', 'Completed', 'Cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_PRIORITIES = ['High', 'Medium', 'Low'] as const;

/** Suggested work types for new projects (free text is also allowed). */
export const PROJECT_WORK_TYPES = [
  'Category Revamp',
  'Highlight & Description',
  'Category Shifting',
  'Weight Update',
  'Image URL Change',
  'Image Check',
  'Product Name Cleanup',
  'Brand Authorization',
  'Logo Update',
  'Title Keyword Category',
  'QC Rejected Inactive to Live',
  'Rating Below 3.5',
  'Top Search Keywords',
];

/**
 * How a project is shown in the Product Governance report (one block per project).
 *  - Reviewed / Found / Updated: SKUs reviewed, issues found, issues fixed.
 *  - Working / Updated: e.g. "Highlight & Description — Working 39,848 · Updated 29,670".
 *  - Count: one number per line, e.g. "Logo — Brand 3".
 *  - Status breakdown: counts per status for the current period, e.g. Right / Wrong / Check Pending + Grand Total.
 */
export const REPORT_LAYOUTS = ['Reviewed / Found / Updated', 'Working / Updated', 'Count', 'Status breakdown'] as const;
export type ReportLayout = (typeof REPORT_LAYOUTS)[number];

export const LAYOUT_HELP: Record<ReportLayout, { lineHeader: string; example: string; fields: ('reviewed' | 'found' | 'updated')[] }> = {
  'Reviewed / Found / Updated': { lineHeader: 'Work Type', example: '', fields: ['reviewed', 'found', 'updated'] },
  'Working / Updated': { lineHeader: 'Work Type', example: 'Highlight & Description; Category Shifting', fields: ['reviewed', 'updated'] },
  Count: { lineHeader: 'Metric', example: 'Brand Auth. — Seller Count; Logo — Brand; Logo — Category', fields: ['reviewed'] },
  'Status breakdown': { lineHeader: 'Category Status', example: 'Right Category; Wrong Category; Check Pending', fields: ['reviewed'] },
};

/**
 * Sum: numbers in a period are the total of the entries logged in it (daily work).
 * Latest: each line shows the most recent entry in the period (running totals you copy from a tracker).
 */
export const VALUE_MODES = ['Sum', 'Latest'] as const;

/** Column headers of the tabs written by apps-script/Code.gs (keep in sync). Columns are matched by name. */
export const PROJECT_HEADERS = [
  'Project ID', 'Created At', 'Project Name', 'Work Type', 'Description', 'POC', 'Assignees',
  'Total SKUs', 'Start Date', 'Due Date', 'Status', 'Priority', 'Found Label', 'Updated At', 'Updated By',
  'Report Layout', 'Line Header', 'Lines', 'Value Mode', 'Report Note', 'Show In Report',
] as const;
export const PROGRESS_HEADERS = [
  'Log ID', 'Timestamp', 'Project ID', 'Date', 'Person', 'Reviewed', 'Found', 'Updated', 'Note', 'Line',
] as const;
