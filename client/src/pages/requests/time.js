// Small date/time helpers shared by the requests pages (local time, never UTC, so late-night dates stay right)
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

// Times other students already have confirmed in the slot, in minutes: [{ s: 960, e: 980, label: '16:00 to 16:20' }]
export const takenOf = slot => (slot?.takenWindows || []).map(w => ({ s: toMin(w.start), e: toMin(w.end), label: `${w.start} to ${w.end}` }));

// true when start..start+length overlaps a booked time (ending exactly when one starts is fine)
export const clashes = (taken, start, length) => taken.some(w => start < w.e && w.s < start + length);

// Longest allowed length that still fits before the slot ends and before the next booked time
export const fitDuration = (slotEnd, start, duration, taken = []) => {
  const st = toMin(start);
  const stop = taken.filter(w => w.s >= st).reduce((m, w) => Math.min(m, w.s), toMin(slotEnd));
  const room = stop - st;
  return duration <= room ? duration : [...DURATIONS].reverse().find(d => d <= room) ?? DURATIONS[0];
};

// The first start (5 min steps) where the shortest meeting fits without touching a booked time, or null if none is left
export const firstFreeStart = slot => {
  const taken = takenOf(slot);
  const end = toMin(slot.endTime);
  for (let m = toMin(slot.startTime); m + DURATIONS[0] <= end; m += 5) {
    if (!clashes(taken, m, DURATIONS[0])) return toTime(m);
  }
  return null;
};
