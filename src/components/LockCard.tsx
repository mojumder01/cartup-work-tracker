import { useState } from 'react';
import { Card } from './ui';
import { dashToken, isUnlocked, lockDashboard } from '../services/dashLock';

/** Settings → Dashboard password: lock this device, and the Apps Script access code. */
export function LockCard() {
  const unlocked = isUnlocked();
  const code = dashToken();
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!code) return;
    void navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <Card
      title="Dashboard password"
      subtitle={unlocked ? 'This dashboard is password-locked · unlocked on this device' : 'Not locked — anyone with the link can open the dashboard'}
      actions={
        unlocked ? (
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              lockDashboard();
              window.location.reload();
            }}
          >
            🔒 Lock this device
          </button>
        ) : undefined
      }
    >
      <div style={{ fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {unlocked && code && (
          <div>
            <b>Apps Script access code</b> (Script Property <code>DASHBOARD_TOKEN</code>): once it is set, the Apps Script only lets the unlocked dashboard read or change
            the Governance projects and press <b>Update data</b>. The Job desk and Task board keep working without it.
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
              <code style={{ wordBreak: 'break-all', fontSize: 12 }}>{code}</code>
              <button type="button" className="btn btn-sm" onClick={copy}>
                {copied ? 'Copied' : 'Copy code'}
              </button>
            </div>
          </div>
        )}
        <ol style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>
            GitHub → repository <b>Settings → Secrets and variables → Actions → New repository secret</b>: name <code>DASHBOARD_PASSWORD</code>, value = the password (8+
            characters). Then click <b>Update data</b> (or run the workflow). From the next build the dashboard asks for the password; the data file is published
            encrypted.
          </li>
          <li>
            After unlocking, copy the <b>Apps Script access code</b> shown here into Apps Script → Project Settings → Script Properties → <code>DASHBOARD_TOKEN</code>.
          </li>
          <li>
            To change the password: change the secret, run <b>Update data</b>, unlock with the new password and replace <code>DASHBOARD_TOKEN</code> with the new code.
            Everyone else is asked for the new password automatically.
          </li>
        </ol>
        <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
          The Job desk and Task board pages stay open without a password.
        </p>
      </div>
    </Card>
  );
}
