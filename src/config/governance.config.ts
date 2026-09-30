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

/** Column headers of the tabs written by apps-script/Code.gs (keep in sync). */
export const PROJECT_HEADERS = [
  'Project ID', 'Created At', 'Project Name', 'Work Type', 'Description', 'POC', 'Assignees',
  'Total SKUs', 'Start Date', 'Due Date', 'Status', 'Priority', 'Found Label', 'Updated At', 'Updated By',
] as const;
export const PROGRESS_HEADERS = [
  'Log ID', 'Timestamp', 'Project ID', 'Date', 'Person', 'Reviewed', 'Found', 'Updated', 'Note',
] as const;
