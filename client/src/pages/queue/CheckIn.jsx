// [S3] CheckIn: Page the QR code opens; simulates door check-in (#12)
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock, Lock, MapPin, NotebookPen, UserRound } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Alert from '@/components/Alert';
import TearTicket from '@/components/react-bits/TearTicket';
import { checkIn, getCheckIn } from '@/api/queue';
import { clock, dateParts, daysFromToday } from './helpers';
import './queue.css';

// Ticket size follows the screen (the QR is usually scanned with a phone). On phones the ticket fills the
// width and gets taller with a slimmer stub, so the text has room; wider screens keep 460x250.
function ticketSize() {
  const vw = window.innerWidth;
  if (vw < 560) {
    const width = Math.max(260, vw - 40); // .main side padding (.ci-stage has none on phones)
    return { phone: true, width, height: Math.round(width * 0.75), stub: Math.round(width * 0.24) };
  }
  return { phone: false, width: Math.min(460, vw - 56), height: 250, stub: Math.round(Math.min(460, vw - 56) * 0.3) };
}

// Why the stub cannot be torn right now, or null if it can. Mirrors the server checks in logic.js checkIn.
function lockReason(ticket) {
  const { long } = dateParts(ticket.slotDate);
  if (ticket.status === 'done') return { stub: 'USED', title: 'This meeting is finished', text: `It took place on ${long}, so the ticket can no longer be used. Your notes are in Meeting history.` };
  if (ticket.status === 'skipped') return { stub: 'CLOSED', title: 'This ticket was closed', text: 'The instructor skipped or closed this place in the queue. Send a new request if you still need help.' };
  if (ticket.isMeetingDay) return null;
  const days = daysFromToday(ticket.slotDate);
  if (days < 0) return { stub: 'EXPIRED', title: 'This ticket has expired', text: `It was for ${long}. Send a new request if you still need help.` };
  const when = days === 1 ? 'tomorrow' : days > 1 ? `in ${days} days` : 'on the meeting day';
  return {
    stub: days === 1 ? 'TOMORROW' : days > 1 ? `IN ${days} DAYS` : 'NOT YET',
    title: `Opens ${when}`,
    text: `Your meeting is on ${long}, around ${ticket.startTime}, in ${ticket.location}. The ticket only works on that day: tear it when you reach the door.`,
  };
}

export default function CheckIn() {
  const { token } = useParams();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [result, setResult] = useState(null); // { checkedInAt, ahead }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState(ticketSize);
  const [attempt, setAttempt] = useState(0); // bumped on a failed check-in so the torn stub snaps back

  useEffect(() => {
    const onResize = () => setSize(s => {
      const next = ticketSize();
      return next.width === s.width ? s : next; // no remount if nothing changed
    });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setLoading(true);
    getCheckIn(token)
      .then(res => setTicket(res.data))
      .catch(err => setLoadError(err))
      .finally(() => setLoading(false));
  }, [token]);

  const checkedInAt = result?.checkedInAt || ticket?.checkedInAt;
  const finished = ticket && ['done', 'skipped'].includes(ticket.status);
  // A finished ticket always explains itself; otherwise a check-in already made wins over the date rule
  const lock = ticket && (finished || !checkedInAt) ? lockReason(ticket) : null;

  // Tearing the stub = walking through the door
  async function onTear() {
    if (busy || checkedInAt) return;
    setBusy(true);
    setError('');
    try {
      const res = await checkIn(token);
      setResult(res.data);
    } catch (err) {
      setError(err.message);
      if (err.code === 'ALREADY_CHECKED_IN') setTicket(t => ({ ...t, checkedInAt: t.checkedInAt || new Date().toISOString() }));
      else setAttempt(a => a + 1);
    } finally {
      setBusy(false);
    }
  }

  const parts = ticket ? dateParts(ticket.slotDate) : null;

  return (
    <main className="main">
      <div className="ci-page">
        <Link to="/" className="ci-brand"><NotebookPen size={20} aria-hidden="true" /> OfficeOurs</Link>
        <PageHeader eyebrow="Show this at the door" title="Check in" description="Tear the ticket stub to check in to your meeting." />

        {loading && <p className="muted">Reading your ticket...</p>}

        {loadError && (
          <div className="todo stack ci-info">
            <span className="hand">{loadError.status === 404 ? 'This QR code is not valid' : 'Could not load the ticket'}</span>
            <p className="muted">{loadError.status === 404 ? 'Use the QR code from your latest confirmation email.' : loadError.message}</p>
          </div>
        )}

        {ticket && (
          <>
            <div className="ci-stage">
              <TearTicket
                key={`${attempt}-${size.width}`}
                torn={Boolean(checkedInAt)}
                onTear={onTear}
                disabled={Boolean(lock) || busy}
                width={size.width}
                height={size.height}
                tilt={false}
                rotate={0}
                stubSize={size.stub}
                background="#FCEA9C"
                color="#2B0710"
                borderColor="#2B0710"
                borderWidth={2}
                stubBackground="#590A1C"
                ariaLabel={lock ? `Locked: ${lock.title}` : 'Tear off the stub to check in'}
                stub={lock ? (
                  <div className="ci-stub" style={{ color: '#FCEA9C' }}>
                    <Lock size={26} aria-hidden="true" />
                    <b>LOCKED</b>
                    <small>{lock.stub}</small>
                  </div>
                ) : (
                  <div className="ci-stub" style={{ color: '#FCEA9C' }}>
                    <b>ADMIT ONE</b>
                    <span>#{ticket.position}</span>
                    <small>tear here</small>
                  </div>
                )}
              >
                <div className={`ci-ticket${size.phone ? ' is-phone' : ''}`}>
                  <span className="hand">{ticket.module ? ticket.module.code : 'Office hours'}</span>
                  <strong>{ticket.title}</strong>
                  <small><UserRound size={14} aria-hidden="true" /> {ticket.studentName} with {ticket.instructorName}</small>
                  <small><CalendarDays size={14} aria-hidden="true" /> {parts.short} {parts.num} {parts.month}</small>
                  <small><Clock size={14} aria-hidden="true" /> around {ticket.startTime}</small>
                  <small><MapPin size={14} aria-hidden="true" /> {ticket.location}</small>
                </div>
              </TearTicket>
            </div>

            <div className="stack ci-info" aria-live="polite">
              <Alert type="error" onClose={() => setError('')}>{error}</Alert>

              {checkedInAt && !finished ? (
                <div className="card card-blue ci-done">
                  <CheckCircle2 size={36} aria-hidden="true" />
                  <span className="hand">You are checked in</span>
                  <p>At {clock(checkedInAt)}.{result ? ` ${result.ahead === 0 ? 'You are next in line.' : `${result.ahead} student${result.ahead === 1 ? '' : 's'} ahead of you.`}` : ''}</p>
                  <p className="muted">Log in and open your request to follow the queue live.</p>
                </div>
              ) : lock ? (
                <div className="card ci-lock" role="status">
                  <Lock size={28} aria-hidden="true" />
                  <div>
                    <span className="hand">{lock.title}</span>
                    <p>{lock.text}</p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="center muted">Drag the dark stub away from the ticket (or focus it and press Enter).</p>
                  <button type="button" className="btn btn-ghost" onClick={onTear} disabled={busy}>
                    {busy ? 'Checking in...' : 'Trouble tearing? Check in with a button'}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
