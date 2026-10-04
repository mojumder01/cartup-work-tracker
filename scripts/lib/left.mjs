// Who has left the job, for the Job desk / Task board name lists (form.json).
// Same sources and order as the dashboard roster (src/utils/roster.ts):
//   1. Performance sheet "Team" tab: full Name + Status ("Resigned" → left), matched to Work Sheet short names
//   2. "Team Members" tab: Name + Status / Left Date (wins over 1)
// Changes saved in a browser on the Team Members page are applied by the pages themselves.

const key = (s) => String(s ?? '').trim().toLowerCase();
const LEFT = /left|inactive|resign|former|exit|terminat|no$/;
const col = (t, name) => (t?.columns ?? []).findIndex((c) => key(c) === key(name));

export function leftNames(names, teamTable, staffTable) {
  const status = new Map(); // short name (lower) → 'Left' | 'Active'
  const list = [...names];
  if (staffTable) {
    const n = col(staffTable, 'Name');
    const s = col(staffTable, 'Status');
    if (n >= 0 && s >= 0) {
      const hits = new Map(); // short name → statuses of the full names it matches
      for (const row of staffTable.rows) {
        const full = String(row[n] ?? '').trim();
        const st = key(row[s]);
        if (!full || !st) continue;
        const tokens = full.toLowerCase().split(/[\s.]+/).filter(Boolean);
        const match = list.find((p) => key(p) === key(full)) ?? list.find((p) => p.length >= 3 && tokens.some((t) => t === key(p) || t.startsWith(key(p))));
        if (!match) continue;
        const arr = hits.get(key(match)) ?? [];
        arr.push(LEFT.test(st) ? 'Left' : 'Active');
        hits.set(key(match), arr);
      }
      // A short name that also matches someone still working is not marked left.
      for (const [k, arr] of hits) status.set(k, arr.includes('Active') ? 'Active' : 'Left');
    }
  }
  if (teamTable) {
    const n = col(teamTable, 'Name');
    const s = col(teamTable, 'Status');
    const l = col(teamTable, 'Left Date');
    if (n >= 0) {
      for (const row of teamTable.rows) {
        const name = key(row[n]);
        if (!name) continue;
        const st = s >= 0 ? key(row[s]) : '';
        if (st) status.set(name, LEFT.test(st) ? 'Left' : 'Active');
        else if (l >= 0 && row[l] !== null && row[l] !== '') status.set(name, 'Left');
      }
    }
  }
  return list.filter((p) => status.get(key(p)) === 'Left').sort((a, b) => a.localeCompare(b));
}
