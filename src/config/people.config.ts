/**
 * Team roster defaults.
 *
 * `name` must match how the person is written in the Work Sheet
 * ("Uploaded by", "QC By", "Visual editor"). `fullName` is what reports print.
 * These defaults come from the Individual Summary report template.
 *
 * Roster priority (highest first):
 *   1. Changes made on the "Team Members" page (saved in that browser)
 *   2. The optional "Team Members" tab in the Google Sheet (shared with everyone)
 *   3. This file
 * People not listed anywhere are added automatically from the Work Sheet.
 */

export type TeamId = 'Production' | 'Visual' | 'QC' | 'Other';

export const TEAMS: { id: TeamId; label: string; role: string }[] = [
  { id: 'Production', label: 'Production · New Upload', role: 'Uploaded by' },
  { id: 'Visual', label: 'Visual · Seller & Image Output', role: 'Visual editor' },
  { id: 'QC', label: 'QC Performance', role: 'QC By' },
];

export interface PersonDefault {
  name: string;
  fullName?: string;
  team: TeamId;
  /** "Left" hides the person from new reports (history is kept). */
  status?: 'Active' | 'Left';
  /** yyyy-mm-dd — last working day; reports for periods before it still include them. */
  leftDate?: string;
}

export const PEOPLE_DEFAULTS: PersonDefault[] = [
  { name: 'Saiful', fullName: 'Md. Saiful Islam', team: 'Production' },
  { name: 'Asif', fullName: 'S. M. Asiful Hoque', team: 'Production' },
  { name: 'Nafim', fullName: 'Ilham Hoque Nafim', team: 'Production' },
  { name: 'Iftakhar', fullName: 'S.M. Iftakhar', team: 'Production' },
  { name: 'Muntasir', fullName: 'Muntasir', team: 'Production' },
  { name: 'Bakaul', fullName: 'Md Faysal Bakaul', team: 'Visual' },
  { name: 'Rayhan', fullName: 'Rayhan Sobhan', team: 'Visual' },
  { name: 'Jasib', fullName: 'Sk Jasibul Islam', team: 'Visual' },
  { name: 'Jerry', fullName: 'Jerry Anthony Rozario', team: 'QC' },
  { name: 'Sirajul', fullName: 'Syed Sirajul Islam', team: 'QC' },
  { name: 'Rubel', fullName: 'Md. Mahamudul Karim', team: 'QC' },
];

/**
 * Week numbering used in report titles.
 * - 'firstFullWeek': Week 1 is the first full week of the year (matches the
 *   report template: 13–19 Sep 2026 = Week 37).
 * - 'weeknum': Google Sheets WEEKNUM() (the Work Sheet "Weeks" column; 13–19 Sep 2026 = Week 38).
 */
export const WEEK_NUMBERING: 'firstFullWeek' | 'weeknum' = 'firstFullWeek';

/** Statuses that do NOT count as upload backlog (the request was closed without upload). */
export const BACKLOG_EXCLUDED_STATUSES = ['Rejected'];
