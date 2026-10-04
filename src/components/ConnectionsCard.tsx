import { useEffect, useState } from 'react';
import codeGs from '../../apps-script/Code.gs?raw';
import { useApp } from '../hooks/AppContext';
import { detect, PENDING_QC_FIELDS, RETAIL_FIELDS } from '../utils/extraSources';
import { readAppsScriptJson } from '../services/appsScriptResponse';
import { isAppsScriptUrl, LOCAL_URL_KEY, localAppsScriptUrl } from '../hooks/useGovernance';
import { BUILD } from '../utils/buildInfo';
import { fmtNum } from '../utils/format';
import { Card } from './ui';
import { Icon } from './Icon';

/** Version written in apps-script/Code.gs (SCRIPT_VERSION). */
const LATEST_SCRIPT = codeGs.match(/SCRIPT_VERSION = '([\d.]+)'/)?.[1] ?? '';

const Ok = ({ ok, children }: { ok: boolean | null; children: React.ReactNode }) => (
  <span className={`badge ${ok === null ? '' : ok ? 'good' : 'bad'}`}>
    <Icon name={ok ? 'check' : 'alert'} size={12} />
    {children}
  </span>
);

/** Which Google Sheets / tabs feed the dashboard, and the one-time Apps Script setup. */
export function ConnectionsCard() {
  const { data } = useApp();
  const sharedUrl = data.appsScriptUrl || data.governance?.writeUrl || null;
  const localUrl = localAppsScriptUrl();
  // A URL saved in this browser wins, so a new deployment can be tested before the GitHub variable is changed.
  const url = localUrl || sharedUrl;
  const [draftUrl, setDraftUrl] = useState(localUrl ?? '');
  const saveLocal = (v: string | null) => {
    try {
      if (v) localStorage.setItem(LOCAL_URL_KEY, JSON.stringify(v.trim()));
      else localStorage.removeItem(LOCAL_URL_KEY);
    } catch {
      /* ignore */
    }
    window.location.reload();
  };
  const [ping, setPing] = useState<{ ok: boolean; sync?: boolean; sheet?: boolean; sheetError?: string; work?: boolean; workError?: string; account?: string; version?: string; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const repoUrl = BUILD.repo ? `https://github.com/${BUILD.repo}` : null;

  useEffect(() => {
    if (!url) return;
    fetch(`${url}${url.includes('?') ? '&' : '?'}action=ping`)
      .then((r) => {
        if (!r.ok) {
          throw new Error(
            r.status === 404
              ? 'HTTP 404 — Google has no Web app at this URL. The deployment was deleted/archived or the URL is not the one from Deploy → Manage deployments (it must end in /exec and must not contain /u/0/ or /dev). Copy the Web app URL again from Manage deployments.'
              : `HTTP ${r.status} from the Web app. Check Deploy → Manage deployments: Execute as Me, Who has access Anyone.`,
          );
        }
        return readAppsScriptJson<{ ok?: boolean; sync?: boolean; sheet?: boolean; sheetError?: string; work?: boolean; workError?: string; account?: string; version?: string }>(r);
      })
      .then((j) => setPing({ ok: !!j.ok, sync: !!j.sync, sheet: j.sheet, sheetError: j.sheetError ?? undefined, work: j.work, workError: j.workError ?? undefined, account: j.account ?? undefined, version: j.version ?? '' }))
      .catch((e) => setPing({ ok: false, error: (e as Error).message || 'Not reachable — check the deployment access is “Anyone”.' }));
  }, [url]);

  const perfWarning = data.warnings.find((w) => w.startsWith('Performance sheet could not be read')) ?? null;
  const usedPerf = ['daily performance', 'monthly performance', 'kpi', 'team', 'import - contentcommercial work', 'import - retail picks upload'];
  const otherPerfTabs = (data.performance?.tabs ?? []).filter((t) => !usedPerf.some((u) => t.trim().toLowerCase() === u || t.trim().toLowerCase().startsWith(u)));
  const has = (tabs: string[] | undefined, name: string) => !!tabs?.some((t) => t.toLowerCase().startsWith(name.toLowerCase()));
  const sheets = [
    {
      name: data.source.spreadsheetTitle || 'Cartup Content Work Tracker',
      purpose: 'Main work data',
      connected: true,
      tabs: [
        { tab: data.source.workSheet, use: `Work records (${fmtNum(data.work.rows.length)} rows)`, ok: true },
        { tab: 'KPI & Target', use: 'KPI & Target page, Individual Summary', ok: !!data.kpi },
        { tab: 'Admin portal QC import data', use: 'Seller-upload QC (reports)', ok: !!data.sellerQc },
        { tab: 'Team Members', use: 'Optional shared roster', ok: !!data.team, optional: true },
      ],
    },
    {
      name: data.governance?.spreadsheetTitle || 'Governance Work Tracker',
      purpose: 'Governance team',
      connected: !!data.governance,
      tabs: [
        { tab: 'Main', use: 'Ad-Hoc tasks', ok: !!data.governance?.adhoc },
        { tab: 'Projects', use: 'REVAMP projects — created and edited from the dashboard (or by hand in the sheet)', ok: !!data.governance?.projects || has(data.governance?.tabs, 'Projects') },
        { tab: 'Project Progress', use: 'Progress entries per project / report line — added from the dashboard', ok: !!data.governance?.progress || has(data.governance?.tabs, 'Project Progress') },
      ],
    },
    {
      name: data.performance?.spreadsheetTitle || 'Catalogue Overall Performance',
      purpose: 'Daily / Monthly Performance report',
      connected: !!data.performance,
      tabs: [
        { tab: 'Daily Performance', use: 'Daily targets, staff list', ok: !!data.performance?.daily },
        { tab: 'Monthly Performance', use: 'Monthly targets, staff list', ok: !!data.performance?.monthly },
        { tab: 'KPI', use: 'Who has no target', ok: !!data.performance?.kpi },
        { tab: 'Team', use: 'Full names; “Resigned” = left the job', ok: !!data.performance?.team },
        { tab: 'Import - ContentCommercial Work', use: 'Uploaded / pending summary, seller-upload QC', ok: !!data.performance?.commercial },
        { tab: 'Import - Retail Picks Upload…', use: 'Retail uploads (daily)', ok: !!data.performance?.retail },
      ],
    },
    ...([
      { key: 'retail', name: 'Retail [Picks] Upload Request', purpose: 'Retail uploads in the Individual Summary', fields: RETAIL_FIELDS },
      { key: 'pendingQc', name: 'Admin Portal Pending QC', purpose: 'Pending QC in the Individual Summary', fields: PENDING_QC_FIELDS },
    ] as const).map((x) => {
      const t = data.extra?.[x.key] ?? null;
      const m = detect(t, x.fields as Record<string, { label: string; names: string[] }>);
      return {
        name: t?.spreadsheetTitle || x.name,
        purpose: `${x.purpose}${t ? ` · tab “${t.sheet}”, ${fmtNum(t.rows.length)} rows` : ''}`,
        connected: !!t,
        tabs: Object.entries(x.fields).map(([k, f]) => ({
          tab: m[k] ?? f.names[0],
          use: `${f.label} column${m[k] ? '' : ` (looked for: ${f.names.slice(0, 3).join(' / ')})`}`,
          ok: !!m[k],
          optional: k === 'status' || k === 'seller' || k === 'date',
        })),
        hint: t ? `All columns: ${t.columns.join(' · ')}` : null,
      };
    }),
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codeGs);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt('Copy the script:', codeGs);
    }
  };

  return (
    <>
      <Card title="Connections" subtitle={`${sheets.length} Google Sheets feed this dashboard · tabs and columns used for reports`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sheets.map((s, i) => (
            <div key={s.purpose}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                <b>
                  {i + 1}. {s.name}
                </b>
                <span className="muted">· {s.purpose}</span>
                <Ok ok={s.connected}>{s.connected ? 'Connected' : 'Not connected'}</Ok>
              </div>
              <table className="data">
                <tbody>
                  {s.tabs.map((t) => (
                    <tr key={t.tab}>
                      <td style={{ width: 280 }}>
                        <code>{t.tab}</code>
                      </td>
                      <td className="muted">{t.use}</td>
                      <td style={{ width: 120 }}>{t.ok ? <Ok ok>Found</Ok> : 'optional' in t && t.optional ? <span className="muted">optional</span> : <Ok ok={false}>Missing</Ok>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {i >= 3 && !s.connected && (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  {data.warnings.find((w) => w.startsWith(s.name)) ?? 'Not read yet.'} To connect: open this Google Sheet → <b>Share</b> → add the service-account email
                  (<code>…@….iam.gserviceaccount.com</code>) as <b>Viewer</b>, then click <b>Update data</b>.
                </p>
              )}
              {'hint' in s && s.hint && (
                <p className="muted" style={{ fontSize: 12, wordBreak: 'break-word' }}>
                  {s.hint}
                </p>
              )}
              {i === 2 && !s.connected && (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  {perfWarning ? (
                    <>
                      <span style={{ color: 'var(--bad)' }}>{perfWarning}</span>
                      <br />
                    </>
                  ) : null}
                  To connect: open the Catalogue Overall Performance sheet → <b>Share</b> → add the service-account email (the <code>client_email</code> in your
                  Google key, ending in <code>.iam.gserviceaccount.com</code>) as <b>Viewer</b>, untick “Notify people”, then click <b>Update data</b>. The
                  dashboard only reads this sheet; it never changes it.
                </p>
              )}
              {i === 2 && s.connected && otherPerfTabs.length > 0 && (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  Other tabs in this sheet (not used yet — tell us which report they should match): {otherPerfTabs.join(', ')}
                </p>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card
        title="Apps Script (project assigning + Update data button)"
        subtitle={url ? 'Web app URL is configured' : 'Not set up yet — 5 minutes, one time'}
        actions={
          <button type="button" className="btn btn-primary btn-sm" onClick={copy}>
            <Icon name={copied ? 'check' : 'clipboard'} size={14} /> {copied ? 'Copied' : 'Copy script'}
          </button>
        }
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <Ok ok={url ? (ping ? ping.ok : null) : false}>Web app {url ? (ping ? (ping.ok ? 'reachable' : 'not reachable') : 'checking…') : 'missing'}</Ok>
          <Ok ok={url && ping ? !!ping.sync : false}>Update data button {ping?.sync ? 'ready' : 'needs GitHub token'}</Ok>
          {ping?.ok && ping.sheet !== undefined && (
            <Ok ok={!!ping.sheet}>Governance sheet {ping.sheet ? 'writable' : 'NOT accessible'}{ping.account ? ` · runs as ${ping.account}` : ''}</Ok>
          )}
        </div>
        {ping && !ping.ok && ping.error && <p style={{ color: 'var(--bad)', fontSize: 13, marginTop: 0 }}>{ping.error}</p>}
        {ping?.ok && ping.version !== LATEST_SCRIPT && (
          <p style={{ color: 'var(--bad)', fontSize: 13, marginTop: 0 }}>
            ⚠ The deployed Apps Script is {ping.version ? `version ${ping.version}` : 'an older version'}; the latest is {LATEST_SCRIPT}. Click <b>Copy script</b>, paste it into Code.gs, then
            Deploy → Manage deployments → ✏️ → Version: <b>New version</b> → Deploy. Until then the task update form cannot check JOB IDs.
          </p>
        )}
        {ping?.ok && ping.work !== undefined && (
          <p style={{ fontSize: 13, marginTop: 0 }}>
            <Ok ok={!!ping.work}>Task update form {ping.work ? 'can write to the Work Sheet' : 'cannot write to the Work Sheet'}</Ok>{' '}
            <a href="form.html" target="_blank" rel="noopener">
              Open the form ↗
            </a>
            {!ping.work && ping.workError && <span style={{ color: 'var(--bad)', display: 'block', marginTop: 4 }}>{ping.workError}</span>}
          </p>
        )}
        {ping?.ok && ping.sheet === false && (
          <p style={{ color: 'var(--bad)', fontSize: 13, marginTop: 0 }}>{ping.sheetError}</p>
        )}
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
          <li>
            Open Apps Script: in the <b>Governance</b> Google Sheet → <b>Extensions → Apps Script</b>.
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
              Seeing “Sorry, unable to open the file at this time” / “দুঃখিত, এই মুহূর্তে ফাইলটি খোলা গেল না”? That happens when more than one Google account is signed in. Open an{' '}
              <b>Incognito / private window</b>, sign in with <b>only</b> the sheet owner's account and try again — or go to{' '}
              <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener noreferrer">
                script.google.com → New project
              </a>{' '}
              with that account. Both work: the script opens the Governance sheet by its ID.
            </div>
          </li>
          <li>
            Delete everything in <code>Code.gs</code>, click <b>Copy script</b> above and paste, then <b>Save</b>.
          </li>
          <li>
            Choose <code>setup</code> in the toolbar → <b>Run</b> → allow the permissions. (The Projects / Project Progress tabs and their columns are created automatically
            when the first project is saved.)
          </li>
          <li>
            <b>Deploy → New deployment</b> → gear → <b>Web app</b> · Execute as <b>Me</b> · Who has access <b>Anyone</b> → <b>Deploy</b> → copy the Web app URL.
          </li>
          <li>
            In GitHub{repoUrl && (
              <>
                {' '}
                (<a href={`${repoUrl}/settings/variables/actions`} target="_blank" rel="noopener noreferrer">
                  open variables
                </a>
                )
              </>
            )}
            : add the variable <code>GOVERNANCE_APPS_SCRIPT_URL</code> = that URL, then click <b>Update data</b> (or run the workflow) so everyone gets it.
            <div className="field" style={{ marginTop: 6, maxWidth: 640 }}>
              <span>Want to try it right now? Paste the Web app URL — it is used in this browser only until the GitHub variable is set.</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input" value={draftUrl} onChange={(e) => setDraftUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" />
                <button type="button" className="btn btn-sm" disabled={!isAppsScriptUrl(draftUrl)} onClick={() => saveLocal(draftUrl)}>
                  Use here
                </button>
                {localUrl && (
                  <button type="button" className="btn btn-sm" onClick={() => saveLocal(null)}>
                    Remove
                  </button>
                )}
              </div>
              {draftUrl && !isAppsScriptUrl(draftUrl) && <span style={{ color: 'var(--bad)', fontSize: 12 }}>It should look like https://script.google.com/macros/s/…/exec</span>}
              {url && (
                <span className="muted" style={{ fontSize: 12 }}>
                  In use: <code>{url.replace(/(\/s\/.{6}).+(.{6}\/exec)$/, '$1…$2')}</code> — {localUrl ? 'saved in this browser' : 'from the GitHub variable GOVERNANCE_APPS_SCRIPT_URL'}
                  {localUrl && sharedUrl && localUrl !== sharedUrl ? ' (differs from the GitHub variable — update the variable when this one works)' : ''}
                </span>
              )}
            </div>
          </li>
          <li>
            For the <b>Update data</b> button: create a fine-grained GitHub token (
            <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">
              new token
            </a>
            ) with access to <b>only this repository</b> and permission <b>Actions: Read and write</b>. In Apps Script → Project Settings → <b>Script Properties</b> add{' '}
            <code>GITHUB_TOKEN</code> = the token and <code>GITHUB_REPO</code> = <code>{BUILD.repo || 'owner/repo'}</code>. The token stays inside Google.
          </li>
          <li>
            Run the workflow once on GitHub (Actions → Run workflow). After that, use <b>Update data</b> at the top of the dashboard.
          </li>
        </ol>
        <details style={{ marginTop: 14 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Never update the script by hand again (automatic deploy from GitHub)</summary>
          <div style={{ fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            <p style={{ margin: 0 }}>
              Since version 2.0 the script is a small, general read/write service, so new dashboard features normally need <b>no</b> script change. For the rare
              times it does, GitHub can publish it to the same Web app URL by itself. One-time setup (about 10 minutes, with the Google account that owns the script):
            </p>
            <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <li>
                Turn on <b>Google Apps Script API</b> at{' '}
                <a href="https://script.google.com/home/usersettings" target="_blank" rel="noopener noreferrer">
                  script.google.com/home/usersettings
                </a>
                .
              </li>
              <li>
                Open{' '}
                <a href="https://shell.cloud.google.com" target="_blank" rel="noopener noreferrer">
                  Google Cloud Shell
                </a>{' '}
                (free, in the browser) and run <code>npx @google/clasp@2.4.2 login --no-localhost</code>. Open the link, allow, paste the code back. Then run{' '}
                <code>cat ~/.clasprc.json</code> and copy everything it prints.
              </li>
              <li>
                In GitHub{repoUrl && (
                  <>
                    {' '}
                    (<a href={`${repoUrl}/settings/secrets/actions`} target="_blank" rel="noopener noreferrer">open secrets</a>)
                  </>
                )}
                : add the <b>secret</b> <code>CLASPRC_JSON</code> = what you copied. It is a login key for your Google account — keep it only in GitHub secrets.
              </li>
              <li>
                In Apps Script → Project Settings → <b>Script ID</b>: copy it and add the GitHub <b>variable</b> <code>APPS_SCRIPT_ID</code>. (The Web app is taken from{' '}
                <code>GOVERNANCE_APPS_SCRIPT_URL</code>.)
              </li>
              <li>
                Done. Every change to <code>apps-script/</code> on GitHub runs <b>Actions → Deploy Apps Script</b>, which updates the same URL (you can also run it by
                hand there).
              </li>
            </ol>
          </div>
        </details>
      </Card>
    </>
  );
}
