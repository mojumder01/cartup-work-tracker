/**
 * Waiting indicator for Google Sheets (Apps Script) calls on the Job desk and Task board:
 * an animated bar with a live seconds counter, a hint when it is slow, and "took 4.2 s" when done.
 */
import { useEffect, useRef, useState } from 'react';
import './waiting.css';

export function Waiting({ active, label, done = 'Loaded', inline = false }: { active: boolean; label: string; done?: string; inline?: boolean }) {
  const started = useRef<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [took, setTook] = useState<number | null>(null);

  useEffect(() => {
    if (active) {
      started.current = Date.now();
      setTook(null);
      setNow(Date.now());
      const id = window.setInterval(() => setNow(Date.now()), 250);
      return () => window.clearInterval(id);
    }
    if (started.current !== null) {
      setTook(Date.now() - started.current);
      started.current = null;
    }
  }, [active]);

  if (active) {
    const s = Math.max(0, (now - (started.current ?? now)) / 1000);
    if (inline) {
      return (
        <span className="wait-inline" role="status" aria-live="polite">
          <span className="wait-spin" aria-hidden="true" />
          {label}… <b>{Math.floor(s)} s</b>
          {s >= 8 && <span className="wait-hint"> · Google Sheets is slow, please wait</span>}
        </span>
      );
    }
    return (
      <div className="wait" role="status" aria-live="polite">
        <div className="wait-row">
          <span className="wait-spin" aria-hidden="true" />
          <span>
            {label}… <b>{Math.floor(s)} s</b>
          </span>
        </div>
        <div className="wait-bar" aria-hidden="true">
          <span />
        </div>
        {s >= 45 ? (
          <div className="wait-hint bad">Taking much longer than usual — check your internet connection, or reload the page and try again.</div>
        ) : s >= 8 ? (
          <div className="wait-hint">Google Sheets is a bit slow right now — please wait, this usually takes 5–20 seconds.</div>
        ) : null}
      </div>
    );
  }
  if (took === null) return null;
  return inline ? (
    <span className="wait-done">
      {done} in {(took / 1000).toFixed(1)} s
    </span>
  ) : (
    <div className="wait-done">
      {done} in {(took / 1000).toFixed(1)} s
    </div>
  );
}
