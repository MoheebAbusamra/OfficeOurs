// Pick a time window inside a slot: start chips (5 min steps) + length + a mini timeline of the slot (New request + Edit).
// Times other students already have confirmed are shown as booked and cannot be picked.
import { Lock } from 'lucide-react';
import { DURATIONS, clashes, takenOf, toMin, toTime } from './time';

export default function TimeWindowPicker({ slot, start, duration, onStart, onDuration, error }) {
  const s0 = toMin(slot.startTime);
  const s1 = toMin(slot.endTime);
  const st = toMin(start);
  const taken = takenOf(slot);
  const starts = [];
  for (let m = s0; m + DURATIONS[0] <= s1; m += 5) starts.push(m);
  const pct = m => `${((m - s0) / (s1 - s0)) * 100}%`;

  return (
    <div className="stack">
      <fieldset className="plain-fieldset">
        <legend className="label">Start time</legend>
        <div className="time-chips">
          {starts.map(m => {
            const booked = clashes(taken, m, DURATIONS[0]);
            return (
              <button key={m} type="button" className={`time-chip${booked ? ' is-booked' : ''}`} aria-pressed={m === st}
                disabled={booked} title={booked ? 'Already booked by another student' : undefined}
                aria-label={booked ? `${toTime(m)}, booked` : undefined} onClick={() => onStart(toTime(m))}>{toTime(m)}</button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="plain-fieldset">
        <legend className="label">How long do you need?</legend>
        <div className="segmented">
          {DURATIONS.map(d => (
            <button key={d} type="button" aria-pressed={d === duration} disabled={st + d > s1 || clashes(taken, st, d)} onClick={() => onDuration(d)}>{d} min</button>
          ))}
        </div>
      </fieldset>

      <div>
        <div className="slot-bar" aria-hidden="true">
          {taken.map(w => <span key={w.s} className="slot-bar-booked" style={{ left: pct(w.s), width: pct(s0 + w.e - w.s) }} />)}
          <span className="slot-bar-window" style={{ left: pct(st), width: `${(duration / (s1 - s0)) * 100}%` }} />
        </div>
        <div className="slot-bar-labels">
          <span>{toTime(s0)}</span>
          <strong aria-live="polite">{start} to {toTime(st + duration)}</strong>
          <span>{toTime(s1)}</span>
        </div>
        {taken.length > 0 && (
          <p className="slot-booked-note">
            <span className="slot-booked-swatch" aria-hidden="true" />
            <Lock size={14} aria-hidden="true" /> Already booked: {taken.map(w => w.label).join(', ')}
          </p>
        )}
      </div>
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  );
}
