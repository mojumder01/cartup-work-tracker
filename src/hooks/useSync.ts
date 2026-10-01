import { useCallback, useEffect, useRef, useState } from 'react';
import { BUILD } from '../utils/buildInfo';
import { readAppsScriptJson } from '../services/appsScriptResponse';

export type SyncPhase = 'idle' | 'starting' | 'waiting' | 'done' | 'error';

export interface SyncState {
  phase: SyncPhase;
  message: string;
  startedAt: number | null;
  /** GitHub Actions page (manual fallback / details). */
  actionsUrl: string | null;
  start: () => void;
  dismiss: () => void;
}

const POLL_MS = 15000;
const TIMEOUT_MS = 8 * 60000;

/**
 * Manual "Update data": asks the Apps Script to start the GitHub Action (or
 * opens the Actions page when the script is not set up), then re-reads the
 * published data until a newer snapshot appears.
 */
export function useSync(appsScriptUrl: string | null | undefined, updatedAt: string | null, reload: () => void): SyncState {
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [message, setMessage] = useState('');
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const baseline = useRef<string | null>(null);
  const actionsUrl = BUILD.repo ? `https://github.com/${BUILD.repo}/actions/workflows/deploy.yml` : null;

  const start = useCallback(async () => {
    baseline.current = updatedAt;
    setStartedAt(Date.now());
    if (!appsScriptUrl) {
      if (actionsUrl) window.open(actionsUrl, '_blank', 'noopener');
      setPhase('waiting');
      setMessage('On GitHub, click “Run workflow” → “Run workflow”. This page refreshes by itself when the new data is published (about 1–2 minutes).');
      return;
    }
    setPhase('starting');
    setMessage('Asking Google Sheets sync to start…');
    try {
      const res = await fetch(appsScriptUrl, { method: 'POST', body: JSON.stringify({ action: 'triggerSync' }), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
      const json = await readAppsScriptJson<{ ok: boolean; error?: string; alreadyRunning?: boolean }>(res);
      if (!json.ok) throw new Error(json.error || 'The update could not be started.');
      setPhase('waiting');
      setMessage(json.alreadyRunning ? 'An update is already running — waiting for it to finish…' : 'Reading Google Sheets and publishing… usually 1–2 minutes.');
    } catch (e) {
      setPhase('error');
      setMessage(`${(e as Error).message} Meanwhile you can start it on GitHub: Actions → Run workflow (if a new run already appears there, the page will still update — click ↻ in a minute).`);
    }
  }, [appsScriptUrl, updatedAt, actionsUrl]);

  // Poll the published snapshot while waiting.
  useEffect(() => {
    if (phase !== 'waiting') return;
    const id = window.setInterval(() => {
      if (startedAt && Date.now() - startedAt > TIMEOUT_MS) {
        setPhase('error');
        setMessage('No new data after 8 minutes. Open GitHub Actions to see whether the run failed.');
        return;
      }
      reload();
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [phase, startedAt, reload]);

  useEffect(() => {
    if (phase === 'waiting' && updatedAt && updatedAt !== baseline.current) {
      setPhase('done');
      setMessage('Updated with the latest Google Sheets data.');
      const id = window.setTimeout(() => setPhase('idle'), 6000);
      return () => window.clearTimeout(id);
    }
  }, [phase, updatedAt]);

  const dismiss = useCallback(() => setPhase('idle'), []);
  return { phase, message, startedAt, actionsUrl, start, dismiss };
}
