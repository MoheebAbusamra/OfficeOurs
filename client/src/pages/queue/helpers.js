// [S3] Small helpers shared by the S3 pages: 5-second polling and date/time formatting
import { useCallback, useEffect, useRef, useState } from 'react';

export const POLL_MS = 5000;

// Calls load() now and every 5 s while the tab is visible. Returns { data, error, loading, reload, updatedAt }.
// load must return a promise; errors are kept in `error` and the last good data stays on screen.
export function usePolling(load, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true, updatedAt: null });
  const loadRef = useRef(load);
  loadRef.current = load;

  const reload = useCallback(async () => {
    try {
      const data = await loadRef.current();
      setState({ data, error: null, loading: false, updatedAt: new Date() });
    } catch (error) {
      setState(s => ({ ...s, error, loading: false }));
    }
  }, []);

  useEffect(() => {
    setState({ data: null, error: null, loading: true, updatedAt: null });
    reload();
    const timer = setInterval(() => { if (!document.hidden) reload(); }, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload };
}

// "2026-11-25" -> { day: 'Wednesday', short: 'Wed', num: 25, month: 'Nov', long: 'Wednesday 25 November 2026' }
export function dateParts(date) {
  const d = new Date(`${date}T00:00`);
  return {
    day: d.toLocaleDateString('en-GB', { weekday: 'long' }),
    short: d.toLocaleDateString('en-GB', { weekday: 'short' }),
    num: d.getDate(),
    month: d.toLocaleDateString('en-GB', { month: 'short' }),
    long: d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  };
}

// "2026-11-29" -> 4 when today is 2026-11-25 (negative for past dates), in the browser's local time
export const daysFromToday = date => Math.round((new Date(`${date}T00:00`) - new Date(new Date().toDateString())) / 86400000);

// ISO timestamp -> "10:42"
export const clock = iso => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');

// Minutes -> "about 25 min" / "about 1 h 10 min"
export function waitText(minutes) {
  if (!minutes) return 'any minute now';
  if (minutes < 60) return `about ${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `about ${h} h${m ? ` ${m} min` : ''}`;
}

export const STATUS_LABEL = { waiting: 'Waiting', in_meeting: 'In meeting', done: 'Done', skipped: 'Skipped' };
