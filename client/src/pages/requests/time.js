// [S2] Small date/time helpers shared by the S2 pages (local time, never UTC, so late-night dates stay right)
export const DURATIONS = [10, 15, 20, 30];

// "10:00" or "10:00:00" <-> minutes since midnight
export const toMin = t => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };
export const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const parseDate = iso => new Date(`${iso}T00:00:00`);
export const prettyDate = iso => parseDate(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

// Longest allowed length that still fits before the slot ends
export const fitDuration = (slotEnd, start, duration) => {
  const room = toMin(slotEnd) - toMin(start);
  return duration <= room ? duration : [...DURATIONS].reverse().find(d => d <= room);
};
