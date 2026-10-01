/**
 * One rule for "whose work is this, and does it count yet?" — shared by every
 * per-person number in the dashboard so the Team page, charts, reports and
 * exports always agree. Rules live in dashboardConfig.credit.
 */
import { dashboardConfig } from '../config/dashboard.config';
import type { Dataset, WorkRecord } from '../types';
import { text } from './parse';

export type CreditRule = (typeof dashboardConfig.credit)[number];

export const creditRule = (column: string): CreditRule | undefined =>
  dashboardConfig.credit.find((r) => r.column.toLowerCase() === column.toLowerCase());

export interface CreditCheck {
  counted: boolean;
  /** "Counted", "Not done (status: Running)", "No Upload date" … */
  reason: string;
}

/** Is this row finished work for the person in rule.column? */
export function checkCredit(ds: Dataset, r: WorkRecord, rule: CreditRule): CreditCheck {
  if (ds.has(rule.status)) {
    const st = text(r.values[rule.status]);
    if (!rule.done.some((d) => d.toLowerCase() === st.toLowerCase())) return { counted: false, reason: `Not done (${rule.status}: ${st || 'blank'})` };
  }
  if (r.dates[rule.date] == null) return { counted: false, reason: `No ${rule.date}` };
  return { counted: true, reason: 'Counted' };
}

/** Rows that count for their person in this role (any person). */
export function creditedRecords(ds: Dataset, records: WorkRecord[], rule: CreditRule): WorkRecord[] {
  return records.filter((r) => text(r.values[rule.column]) !== '' && checkCredit(ds, r, rule).counted);
}
