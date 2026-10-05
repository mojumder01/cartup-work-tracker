/**
 * Password screen for the dashboard. When the build published data/data.enc (GitHub secret
 * DASHBOARD_PASSWORD), nothing is shown until the data decrypts with the password.
 * Without a locked file the dashboard opens as before.
 */
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { fetchLockedData, primeDashboardData } from '../services/dataService';
import { openWithPassword, openWithSaved } from '../services/dashLock';
import type { DashboardData } from '../types';
import { BuiltBy } from './BuiltBy';

type Phase = 'checking' | 'locked' | 'open';

export function DashGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('checking');
  const [buf, setBuf] = useState<ArrayBuffer | null>(null);
  const [pw, setPw] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    fetchLockedData()
      .then(async (b) => {
        if (stop) return;
        if (!b) return setPhase('open'); // site not locked
        const d = await openWithSaved(b);
        if (stop) return;
        if (d) {
          primeDashboardData(d as DashboardData);
          setPhase('open');
        } else {
          setBuf(b);
          setPhase('locked');
        }
      })
      .catch((e) => {
        if (stop) return;
        // Network trouble: let the dashboard show its own error / last data.
        if (/too old/.test((e as Error).message)) {
          setErr((e as Error).message);
          setPhase('locked');
        } else setPhase('open');
      });
    return () => {
      stop = true;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!buf || !pw) return;
    setBusy(true);
    setErr(null);
    try {
      primeDashboardData((await openWithPassword(buf, pw, remember)) as DashboardData);
      setPw('');
      setPhase('open');
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'open') return <>{children}</>;
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16, background: 'var(--bg)' }}>
      {phase === 'checking' ? (
        <div style={{ color: 'var(--ink-3)' }}>Loading…</div>
      ) : (
        <form
          onSubmit={submit}
          style={{ width: '100%', maxWidth: 360, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span aria-hidden="true" style={{ fontSize: 22 }}>
              🔒
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17 }}>Cartup Content Work Tracker</div>
              <div style={{ color: 'var(--ink-3)', fontSize: 13 }}>Enter the dashboard password</div>
            </div>
          </div>
          <input
            className="input"
            type="password"
            autoFocus
            autoComplete="current-password"
            aria-label="Password"
            placeholder="Password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: 'var(--ink-2)' }}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember on this device
          </label>
          {err && <div style={{ color: 'var(--bad)', fontSize: 13 }}>{err}</div>}
          <button type="submit" className="btn btn-primary" disabled={busy || !pw || !buf}>
            {busy ? 'Opening…' : 'Open dashboard'}
          </button>
          <BuiltBy />
        </form>
      )}
    </div>
  );
}
