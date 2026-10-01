import { C } from '../config/dashboard.config';
import { PEOPLE_DEFAULTS, type TeamId } from '../config/people.config';
import type { Dataset, FlatTable, KpiReport } from '../types';
import { parseDate, text } from './parse';

export interface Person {
  /** Name as written in the Work Sheet (key). */
  name: string;
  fullName: string;
  team: TeamId;
  status: 'Active' | 'Left';
  /** yyyy-mm-dd, optional. */
  leftDate: string;
  /** Where the current values come from. */
  source: 'browser' | 'sheet' | 'staff' | 'default' | 'auto';
  /** Designation from the performance sheet's Team tab. */
  designation?: string;
  /** Latest date this person appears in any role (ms). */
  lastActive: number | null;
  /** Jobs per role column across all data. */
  roleCounts: Record<string, number>;
}

export type RosterOverride = Partial<Pick<Person, 'fullName' | 'team' | 'status' | 'leftDate'>>;
export type RosterOverrides = Record<string, RosterOverride>;

const ROLE_TEAM: Record<string, TeamId> = { [C.uploadedBy]: 'Production', [C.visualEditor]: 'Visual', [C.qcBy]: 'QC' };
const ROLE_DATE: Record<string, string> = { [C.uploadedBy]: C.uploadDate, [C.visualEditor]: C.imageDate, [C.qcBy]: C.qcDate };
const TEAM_IDS: TeamId[] = ['Production', 'Visual', 'QC', 'Governance', 'Other'];

const key = (s: string) => s.trim().toLowerCase();

function normTeam(v: string): TeamId | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  if (s.startsWith('prod') || s.includes('upload')) return 'Production';
  if (s.startsWith('vis') || s.includes('image') || s.includes('design')) return 'Visual';
  if (s.startsWith('qc') || s.includes('quality')) return 'QC';
  if (s.includes('governance') || s.includes('mangrove') || s.includes('team lead')) return 'Governance';
  return TEAM_IDS.find((t) => t.toLowerCase() === s) ?? 'Other';
}

function normStatus(v: string): 'Active' | 'Left' | null {
  const s = v.trim().toLowerCase();
  if (!s) return null;
  return /left|inactive|resign|former|exit|terminat|no$/.test(s) ? 'Left' : 'Active';
}

function isoDate(v: unknown): string {
  const ms = parseDate(v as never);
  if (ms === null) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Reads the optional "Team Members" tab: Name | Full Name | Team | Status | Left Date. */
function sheetRoster(table: FlatTable | null | undefined): Map<string, RosterOverride & { name: string }> {
  const out = new Map<string, RosterOverride & { name: string }>();
  if (!table) return out;
  const idx = (c: string) => table.columns.findIndex((x) => key(x) === key(c));
  const [n, f, t, s, l] = ['Name', 'Full Name', 'Team', 'Status', 'Left Date'].map(idx);
  if (n < 0) return out;
  for (const row of table.rows) {
    const name = text(row[n]);
    if (!name) continue;
    const o: RosterOverride & { name: string } = { name };
    if (f >= 0 && text(row[f])) o.fullName = text(row[f]);
    if (t >= 0) {
      const tm = normTeam(text(row[t]));
      if (tm) o.team = tm;
    }
    if (s >= 0) {
      const st = normStatus(text(row[s]));
      if (st) o.status = st;
    }
    if (l >= 0 && row[l] !== null) {
      o.leftDate = isoDate(row[l]);
      if (o.leftDate && !o.status) o.status = 'Left';
    }
    out.set(key(name), o);
  }
  return out;
}

/**
 * Staff list from the performance sheet's "Team" tab (Name = full name, Role,
 * Status "Running" / "Resigned"). Full names are matched to the short names used
 * in the Work Sheet ("Asif" ↔ "S. M. Asiful Hoque").
 */
function applyStaff(map: Map<string, Person>, staff: FlatTable | null | undefined) {
  if (!staff) return;
  const col = (c: string) => staff.columns.findIndex((x) => key(x) === key(c));
  const [n, r, st, d] = ['Name', 'Role', 'Status', 'Designation'].map(col);
  if (n < 0) return;
  const people = [...map.values()];
  for (const row of staff.rows) {
    const full = text(row[n]);
    if (!full) continue;
    const tokens = full.toLowerCase().split(/[\s.]+/).filter(Boolean);
    const match =
      people.find((p) => key(p.fullName) === key(full)) ??
      people.find((p) => p.name.length >= 3 && tokens.some((t) => t === key(p.name) || t.startsWith(key(p.name))));
    if (!match) continue;
    match.fullName = full;
    // The Team tab's Role is administrative; keep report teams from people.config when set.
    if (r >= 0 && match.source === 'auto') {
      const tm = normTeam(text(row[r]));
      if (tm) match.team = tm;
    }
    if (st >= 0) {
      const s2 = normStatus(text(row[st]));
      if (s2) match.status = s2;
    }
    if (d >= 0 && text(row[d])) match.designation = text(row[d]);
    match.source = 'staff';
  }
}

/** Merges defaults, the Team / Team Members tabs, browser overrides and everyone seen in the data. */
export function buildRoster(
  ds: Dataset,
  kpi: KpiReport | null,
  teamTable: FlatTable | null | undefined,
  overrides: RosterOverrides,
  staffTable?: FlatTable | null,
): Person[] {
  const map = new Map<string, Person>();
  const ensure = (name: string): Person => {
    const k = key(name);
    let p = map.get(k);
    if (!p) {
      p = { name, fullName: name, team: 'Other', status: 'Active', leftDate: '', source: 'auto', lastActive: null, roleCounts: {} };
      map.set(k, p);
    }
    return p;
  };

  // Everyone who appears in a production role.
  for (const role of Object.keys(ROLE_TEAM)) {
    if (!ds.has(role)) continue;
    const dateCol = ROLE_DATE[role];
    for (const r of ds.records) {
      const name = text(r.values[role]);
      if (!name) continue;
      const p = ensure(name);
      p.roleCounts[role] = (p.roleCounts[role] ?? 0) + 1;
      const ms = r.dates[dateCol] ?? r.dates[C.timestamp] ?? null;
      if (ms !== null && (p.lastActive === null || ms > p.lastActive)) p.lastActive = ms;
    }
  }
  kpi?.sections.forEach((s) => s.employees.forEach((e) => ensure(e.name)));

  // Auto team = the role the person worked in most.
  for (const p of map.values()) {
    const top = Object.entries(p.roleCounts).sort((a, b) => b[1] - a[1])[0];
    if (top) p.team = ROLE_TEAM[top[0]] ?? 'Other';
  }

  const apply = (o: RosterOverride & { name?: string }, source: Person['source']) => {
    const p = ensure(o.name ?? '');
    if (o.fullName) p.fullName = o.fullName;
    if (o.team) p.team = o.team;
    if (o.status) p.status = o.status;
    if (o.leftDate !== undefined) p.leftDate = o.leftDate;
    p.source = source;
  };
  PEOPLE_DEFAULTS.forEach((d) => apply({ ...d, status: d.status ?? 'Active', leftDate: d.leftDate ?? '' }, 'default'));
  applyStaff(map, staffTable);
  sheetRoster(teamTable).forEach((o) => apply(o, 'sheet'));
  for (const [name, o] of Object.entries(overrides)) {
    const existing = map.get(key(name));
    apply({ ...o, name: existing?.name ?? name }, 'browser');
  }

  return [...map.values()]
    .filter((p) => p.name)
    .sort((a, b) => TEAM_IDS.indexOf(a.team) - TEAM_IDS.indexOf(b.team) || a.fullName.localeCompare(b.fullName));
}

/** Whether a person should be offered for a report period (left staff stay in history before their last day). */
export function activeDuring(p: Person, periodStart: number): boolean {
  if (p.status !== 'Left') return true;
  if (!p.leftDate) return false;
  return new Date(`${p.leftDate}T23:59:59`).getTime() >= periodStart;
}

export const findPerson = (roster: Person[], name: string) => roster.find((p) => key(p.name) === key(name));

/** Tab-separated rows ready to paste into the "Team Members" Google Sheet tab. */
export function rosterToTsv(roster: Person[]): string {
  const rows = [['Name', 'Full Name', 'Team', 'Status', 'Left Date'], ...roster.map((p) => [p.name, p.fullName, p.team, p.status, p.leftDate])];
  return rows.map((r) => r.join('\t')).join('\n');
}
