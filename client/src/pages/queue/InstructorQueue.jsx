// InstructorQueue: Instructor calls next, skips or ends the queue (#11)
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, CheckCircle2, CircleSlash, DoorOpen, ListOrdered, MapPin, RefreshCw, SkipForward, Square, UserRound,
} from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Alert from '@/components/Alert';
import { callNext, closeQueue, getSlotQueue, skipEntry } from '@/api/queue';
import { clock, dateParts, STATUS_LABEL, usePolling } from './helpers';
import './queue.css';

// Live "12:34" since the student was called
function Timer({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return <span className="iq-timer" aria-label={`${Math.floor(secs / 60)} minutes in meeting`}>{mm}:{ss}</span>;
}

// One waiting student, with an inline "skip with reason" form
function WaitingRow({ entry, busy, onSkip }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const tooLong = reason.length > 300;

  return (
    <li className="iq-row">
      <span className="iq-pos" aria-label={`Position ${entry.position}`}>{entry.position}</span>
      <div className="iq-who">
        <strong>{entry.student?.fullName}</strong>
        <span className="muted">{entry.title}</span>
        <div className="iq-tags">
          {entry.preferredStart && <span className="badge">{entry.preferredStart} to {entry.preferredEnd}</span>}
          {entry.checkedInAt
            ? <span className="badge badge-in"><CheckCircle2 size={14} aria-hidden="true" /> At the door {clock(entry.checkedInAt)}</span>
            : <span className="badge">Not checked in</span>}
        </div>
      </div>
      <div className="iq-row-actions">
        {!open && (
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)} disabled={busy}>
            <SkipForward size={18} aria-hidden="true" /> Skip
          </button>
        )}
      </div>
      {open && (
        <form className="iq-skip" onSubmit={e => { e.preventDefault(); if (!tooLong) onSkip(entry, reason.trim()); }}>
          <div className="field">
            <label className="label" htmlFor={`reason-${entry.id}`}>Skip {entry.student?.fullName}? Reason (optional, sent to the student)</label>
            <input id={`reason-${entry.id}`} className="input" value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Not at the door after being called" aria-invalid={tooLong || undefined}
              aria-describedby={tooLong ? `reason-err-${entry.id}` : undefined} />
            {tooLong && <span id={`reason-err-${entry.id}`} className="field-error">Keep the reason under 300 characters ({reason.length}/300).</span>}
          </div>
          <div className="iq-skip-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || tooLong}>Yes, skip</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setOpen(false); setReason(''); }}>Keep in queue</button>
          </div>
        </form>
      )}
    </li>
  );
}

export default function InstructorQueue() {
  const { slotId } = useParams();
  const { data, error, loading, reload, updatedAt } = usePolling(() => getSlotQueue(slotId), [slotId]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [confirmClose, setConfirmClose] = useState(false);

  const entries = data?.data || [];
  const slot = data?.meta?.slot;
  const current = entries.find(e => e.status === 'in_meeting');
  const waiting = entries.filter(e => e.status === 'waiting');
  const finished = entries.filter(e => ['done', 'skipped'].includes(e.status));
  const notToday = slot && slot.isToday === false;

  // Runs an action, shows the result, then refreshes the list straight away
  async function run(action, success) {
    setBusy(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await action();
      setMessage({ type: 'success', text: success(res.data) });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setBusy(false);
      reload();
    }
  }

  const onNext = () => run(() => callNext(slotId), d => {
    const done = d.finished ? `${d.finished.student?.fullName}'s meeting is saved to history. ` : '';
    return d.current ? `${done}Now calling ${d.current.student?.fullName}. ${d.remaining} still waiting.` : `${done}The queue is now empty.`;
  });
  const onSkip = (entry, reason) => run(() => skipEntry(entry.id, reason || undefined), () => `${entry.student?.fullName} was skipped and notified.`);
  const onClose = () => {
    setConfirmClose(false);
    run(() => closeQueue(slotId), d => `Queue closed: ${d.finished} meeting finished, ${d.skipped} student${d.skipped === 1 ? '' : 's'} skipped and notified.`);
  };

  const forbidden = error?.status === 403 || error?.status === 404;

  return (
    <>
      <PageHeader eyebrow="Run the room" title="Queue"
        description={slot ? `${dateParts(slot.slotDate).long}, ${slot.startTime} to ${slot.endTime}` : 'Call the next student, skip, or close the queue.'}>
        <Link to="/instructor/slots" className="btn btn-ghost"><ArrowLeft size={18} aria-hidden="true" /> My slots</Link>
      </PageHeader>

      <div className="stack">
        <Alert type={message.type} onClose={() => setMessage({ type: '', text: '' })}>{message.text}</Alert>
        {loading && <p className="muted">Loading the queue...</p>}

        {forbidden && (
          <div className="todo stack">
            <span className="hand">{error.status === 403 ? 'This is not your slot' : 'Slot not found'}</span>
            <Link to="/instructor/slots" className="btn btn-butter">Back to my slots</Link>
          </div>
        )}
        {error && !forbidden && <Alert type="error">{error.message}</Alert>}

        {data && (
          <>
            <div className="iq-bar">
              <div className="q-meta">
                {slot && <span><CalendarDays size={16} aria-hidden="true" /> {dateParts(slot.slotDate).short} {dateParts(slot.slotDate).num} {dateParts(slot.slotDate).month}</span>}
                {slot && <span><MapPin size={16} aria-hidden="true" /> {slot.location}</span>}
                <span><ListOrdered size={16} aria-hidden="true" /> {waiting.length} waiting</span>
                {updatedAt && <span className="live-dot">Live, {clock(updatedAt.toISOString())}</span>}
              </div>
              <div className="iq-actions">
                <button type="button" className="btn btn-ghost" onClick={reload} disabled={busy}>
                  <RefreshCw size={18} aria-hidden="true" /> Refresh
                </button>
                {!confirmClose ? (
                  <button type="button" className="btn btn-butter" onClick={() => setConfirmClose(true)}
                    disabled={busy || (!current && !waiting.length)}>
                    <Square size={18} aria-hidden="true" /> Close queue
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn btn-primary" onClick={onClose} disabled={busy}>
                      Yes, close and skip {waiting.length}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirmClose(false)}>Cancel</button>
                  </>
                )}
              </div>
            </div>

            {notToday && (
              <Alert type="info">
                This slot is on {dateParts(slot.slotDate).long}. You can call students only on that day; skipping and closing work any time.
              </Alert>
            )}
            {slot?.status === 'cancelled' && <Alert type="error">This slot was cancelled.</Alert>}

            <div className="iq-layout">
              {/* Current meeting + the main button */}
              <section className="iq-now" aria-labelledby="now-title" aria-live="polite">
                <h2 id="now-title"><DoorOpen size={20} aria-hidden="true" /> In the room now</h2>
                {current ? (
                  <>
                    <strong className="iq-now-name">{current.student?.fullName}</strong>
                    <p>{current.title}</p>
                    <div className="q-meta">
                      <span><UserRound size={16} aria-hidden="true" /> #{current.position}</span>
                      <span>Called at {clock(current.calledAt)}</span>
                    </div>
                    {current.calledAt && <Timer since={current.calledAt} />}
                  </>
                ) : (
                  <div className="iq-empty">
                    <span className="hand">{waiting.length ? 'Ready when you are' : 'Nobody in the room'}</span>
                    <span className="muted">{waiting.length ? `${waiting[0].student?.fullName} is first in line.` : 'Confirmed requests join this queue automatically.'}</span>
                  </div>
                )}
                <button type="button" className="btn btn-primary btn-block" onClick={onNext}
                  disabled={busy || notToday || slot?.status === 'cancelled' || (!current && !waiting.length)}>
                  <SkipForward size={18} aria-hidden="true" />
                  {current ? (waiting.length ? 'Finish and call next' : 'Finish meeting') : 'Call first student'}
                </button>
                {current && (
                  <button type="button" className="btn btn-ghost btn-block" onClick={() => onSkip(current, 'Did not come in after being called')} disabled={busy}>
                    <CircleSlash size={18} aria-hidden="true" /> No-show, skip
                  </button>
                )}
              </section>

              {/* Waiting line */}
              <section className="stack" aria-labelledby="waiting-title">
                <h2 id="waiting-title" className="iq-section-title"><ListOrdered size={20} aria-hidden="true" /> Waiting ({waiting.length})</h2>
                {waiting.length ? (
                  <ol className="iq-list">
                    {waiting.map(e => <WaitingRow key={e.id} entry={e} busy={busy} onSkip={onSkip} />)}
                  </ol>
                ) : (
                  <div className="iq-empty"><span className="muted">No one is waiting.</span></div>
                )}

                {finished.length > 0 && (
                  <details className="iq-finished">
                    <summary>Finished and skipped ({finished.length})</summary>
                    <ul className="iq-list">
                      {finished.map(e => (
                        <li key={e.id} className="iq-row is-finished">
                          <span className="iq-pos">{e.position}</span>
                          <div className="iq-who">
                            <strong>{e.student?.fullName}</strong>
                            <span className="muted">{e.title}</span>
                          </div>
                          <span className={`badge badge-${e.status}`}>{STATUS_LABEL[e.status]}{e.finishedAt ? ` ${clock(e.finishedAt)}` : ''}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}
