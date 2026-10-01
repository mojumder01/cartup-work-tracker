/**
 * Apps Script answers with an HTML page (not JSON) when the deployment needs
 * re-authorising, is not shared with "Anyone", or the script crashed before it
 * could reply. This turns that page into a readable message.
 */
export async function readAppsScriptJson<T>(res: Response): Promise<T> {
  const body = await res.text();
  try {
    return JSON.parse(body) as T;
  } catch {
    const text = body
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 220);
    const auth = /authori[sz]|permission|sign in|access/i.test(text);
    throw new Error(
      `The Apps Script replied with a Google page instead of data${text ? ` (“${text}”)` : ''}. ` +
        (auth
          ? 'Fix: in Apps Script choose “setup” → Run and allow every permission it asks for, then Deploy → Manage deployments → ✏️ → Version: New version → Deploy (Execute as: Me, Who has access: Anyone).'
          : 'Fix: in Apps Script use Deploy → Manage deployments → ✏️ → Version: New version → Deploy, with Execute as: Me and Who has access: Anyone.'),
    );
  }
}
