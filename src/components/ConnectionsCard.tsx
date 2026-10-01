import { useEffect, useState } from 'react';
import codeGs from '../../apps-script/Code.gs?raw';
import { useApp } from '../hooks/AppContext';
import { BUILD } from '../utils/buildInfo';
import { fmtNum } from '../utils/format';
import { Card } from './ui';
import { Icon } from './Icon';

const Ok = ({ ok, children }: { ok: boolean | null; children: React.ReactNode }) => (
  <span className={`badge ${ok === null ? '' : ok ? 'good' : 'bad'}`}>
    <Icon name={ok ? 'check' : 'alert'} size={12} />
    {children}
  </span>
);

/** Which Google Sheets / tabs feed the dashboard, and the one-time Apps Script setup. */
export function ConnectionsCard() {
  const { data } = useApp();
  const url = data.appsScriptUrl ?? data.governance?.writeUrl ?? null;
  const [ping, setPing] = useState<{ ok: boolean; sync?: boolean; error?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const repoUrl = BUILD.repo ? `https://github.com/${BUILD.repo}` : null;

  useEffect(() => {
    if (!url) return;
    fetch(`${url}${url.includes('?') ? '&' : '?'}action=ping`)
      .then((r) => r.json())
      .then((j) => setPing({ ok: !!j.ok, sync: !!j.sync }))
      .catch(() => setPing({ ok: false, error: 'Not reachable — check the deployment access is “Anyone”.' }));
  }, [url]);

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
        { tab: 'Projects', use: 'REVAMP projects (created by the Apps Script)', ok: !!data.governance?.projects || has(data.governance?.tabs, 'Projects') },
        { tab: 'Project Progress', use: 'Project progress logs (created by the Apps Script)', ok: !!data.governance?.progress || has(data.governance?.tabs, 'Project Progress') },
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
      <Card title="Connections" subtitle="3 Google Sheets feed this dashboard · tabs used for reports">
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
              {i === 2 && !s.connected && (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  To connect: share the Catalogue Overall Performance sheet with the service-account email (Viewer), then in GitHub add the variable{' '}
                  <code>PERFORMANCE_SHEET_ID</code> (Settings → Secrets and variables → Actions → Variables) with the sheet's ID or URL, and click <b>Update data</b>.
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
        </div>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
          <li>
            Open the <b>Governance</b> Google Sheet → <b>Extensions → Apps Script</b>. Delete everything in <code>Code.gs</code>, click <b>Copy script</b> above and paste, then{' '}
            <b>Save</b>.
          </li>
          <li>
            Choose <code>setup</code> in the toolbar → <b>Run</b> → allow the permissions (creates the Projects / Project Progress tabs).
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
            : add the variable <code>GOVERNANCE_APPS_SCRIPT_URL</code> = that URL.
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
      </Card>
    </>
  );
}
