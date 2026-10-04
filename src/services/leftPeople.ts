/**
 * "Left the job" for the Job desk and Task board: the names published by the sync
 * (form.json → left: Team tab "Resigned" / Team Members tab) plus changes saved on the
 * dashboard's Team Members page in this browser (same site, so same storage).
 */
const key = (s: string) => s.trim().toLowerCase();

export function makeIsLeft(published: string[] | undefined): (name: string) => boolean {
  const left = new Set((published ?? []).map(key));
  let overrides: Record<string, { status?: string }> = {};
  try {
    overrides = JSON.parse(localStorage.getItem('cartup.roster') ?? '{}') ?? {};
  } catch {
    /* no browser changes */
  }
  const local = new Map(Object.entries(overrides).map(([k, v]) => [key(k), v?.status]));
  return (name: string) => {
    const k = key(name);
    const st = local.get(k);
    if (st === 'Left') return true;
    if (st === 'Active') return false;
    return left.has(k);
  };
}
