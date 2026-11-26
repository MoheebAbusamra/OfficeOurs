// [S2] Pick a time window inside a slot: start chips (5 min steps) + length + a mini timeline of the slot (New request + Edit)
import { DURATIONS, toMin, toTime } from './time';

export default function TimeWindowPicker({ slot, start, duration, onStart, onDuration, error }) {
  const s0 = toMin(slot.startTime);
  const s1 = toMin(slot.endTime);
  const st = toMin(start);
  const starts = [];
  for (let m = s0; m + DURATIONS[0] <= s1; m += 5) starts.push(m);

  return (
    <div className="stack">
      <fieldset className="plain-fieldset">
        <legend className="label">Start time</legend>
        <div className="time-chips">
          {starts.map(m => (
            <button key={m} type="button" className="time-chip" aria-pressed={m === st} onClick={() => onStart(toTime(m))}>{toTime(m)}</button>
          ))}
        </div>
      </fieldset>

      <fieldset className="plain-fieldset">
        <legend className="label">How long do you need?</legend>
        <div className="segmented">
          {DURATIONS.map(d => (
            <button key={d} type="button" aria-pressed={d === duration} disabled={st + d > s1} onClick={() => onDuration(d)}>{d} min</button>
          ))}
        </div>
      </fieldset>

      <div>
        <div className="slot-bar" aria-hidden="true">
          <span className="slot-bar-window" style={{ left: `${((st - s0) / (s1 - s0)) * 100}%`, width: `${(duration / (s1 - s0)) * 100}%` }} />
        </div>
        <div className="slot-bar-labels">
          <span>{toTime(s0)}</span>
          <strong aria-live="polite">{start} to {toTime(st + duration)}</strong>
          <span>{toTime(s1)}</span>
        </div>
      </div>
      {error && <span className="field-error" role="alert">{error}</span>}
    </div>
  );
}
