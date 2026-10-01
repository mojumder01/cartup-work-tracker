/** Apps Script Web app URL helpers (shared by the dashboard and the task form). */
export const LOCAL_URL_KEY = 'cartup.appsScriptUrlLocal';
export const isAppsScriptUrl = (u: string) => /^https:\/\/script\.google\.com\/(a\/macros\/[\w.-]+|macros)\/s\/[\w-]+\/exec$/.test(u.trim());
export function localAppsScriptUrl(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(LOCAL_URL_KEY) ?? 'null');
    return typeof v === 'string' && isAppsScriptUrl(v) ? v.trim() : null;
  } catch {
    return null;
  }
}
