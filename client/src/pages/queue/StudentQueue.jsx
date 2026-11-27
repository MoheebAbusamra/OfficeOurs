// StudentQueue: Shows how many students are ahead (no names) (#7)
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock, DoorOpen, History, MapPin, QrCode, RefreshCw, UserRound } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Alert from '@/components/Alert';
import { getQueuePosition } from '@/api/queue';
import { clock, dateParts, STATUS_LABEL, usePolling, waitText } from './helpers';
import './queue.css';

const MAX_DOTS = 10;

// One dot per student ahead (no names), then "you"
function AnonymousLine({ ahead }) {
  const dots = Math.min(ahead, MAX_DOTS);
  return (
    <div className="q-line" aria-label={`${ahead} student${ahead === 1 ? '' : 's'} ahead of you`}>
      {Array.from({ length: dots }, (_, i) => (
        <span key={i} className={`q-line-dot${i === 0 ? ' is-current' : ''}`} aria-hidden="true" />
      ))}
      {ahead > MAX_DOTS && <span className="q-line-more" aria-hidden="true">+{ahead - MAX_DOTS}</span>}
      <span className="q-line-you" aria-hidden="true">you</span>
    </div>
  );
}

// Headline + text for each queue status
function headline(p) {
  if (p.status === 'in_meeting') return { title: 'It is your turn!', text: `Please go in now${p.slot?.location ? ` (${p.slot.location})` : ''}.`, tone: 'is-turn' };
  if (p.status === 'done') return { title: 'Meeting finished', text: 'You can add your own notes in your meeting history.', tone: 'is-over' };
  if (p.status === 'skipped') return { title: 'You were skipped', text: 'The instructor skipped your place or closed the queue. You can book another slot.', tone: 'is-over' };
  if (p.ahead === 0) return { title: 'You are next', text: 'Stay close to the door, you will be called any moment.', tone: '' };
  return { title: `${p.ahead} student${p.ahead === 1 ? '' : 's'} ahead of you`, text: `Estimated wait: ${waitText(p.estimatedWaitMinutes)}.`, tone: '' };
}

export default function StudentQueue() {
  const { requestId } = useParams();
  const { data, error, loading, reload, updatedAt } = usePolling(
    () => getQueuePosition(requestId).then(res => res.data), [requestId],
  );

  const notQueued = error?.status === 404 && !data;
  const h = data ? headline(data) : null;
  const slot = data?.slot;
  const parts = slot ? dateParts(slot.slotDate) : null;
  const active = data && ['waiting', 'in_meeting'].includes(data.status);

  return (
    <>
      <PageHeader eyebrow="Hang tight" title="Your place in line" description="How many students are ahead of you, updated every few seconds. Nobody's name is shown.">
        <button type="button" className="btn btn-ghost" onClick={reload}>
          <RefreshCw size={18} aria-hidden="true" /> Refresh
        </button>
      </PageHeader>

      <div className="stack">
        {loading && <p className="muted">Finding your place in the queue...</p>}

        {notQueued && (
          <div className="todo stack">
            <span className="hand">This request is not in a queue yet</span>
            <p className="muted">You join the queue as soon as the instructor confirms your request.</p>
            <Link to="/student/requests" className="btn btn-butter">Back to my requests</Link>
          </div>
        )}

        {error && !notQueued && (
          <Alert type="error">{error.message}{data ? ' Showing the last known position.' : ''}</Alert>
        )}

        {data && (
          <>
            <section className={`q-hero ${h.tone}`} aria-live="polite">
              <div className="q-count">
                <div>
                  {active ? (
                    <>
                      <strong>{data.status === 'in_meeting' ? <DoorOpen size={88} aria-hidden="true" /> : data.ahead}</strong>
                      <span className="hand">{data.status === 'in_meeting' ? 'go in' : 'ahead of you'}</span>
                    </>
                  ) : (
                    <>
                      <strong>{data.status === 'done' ? <CheckCircle2 size={88} aria-hidden="true" /> : '-'}</strong>
                      <span className="hand">{STATUS_LABEL[data.status]}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="q-hero-body">
                <span className={`badge badge-${data.status}`}>{STATUS_LABEL[data.status]}</span>
                <h2>{h.title}</h2>
                <p>{h.text}</p>
                {data.status === 'waiting' && <AnonymousLine ahead={data.ahead} />}
                {data.status === 'done' && (
                  <Link to="/student/history" className="btn btn-primary"><History size={18} aria-hidden="true" /> Open history</Link>
                )}
                {data.status === 'skipped' && <Link to="/student/slots" className="btn btn-primary">Book another slot</Link>}
                {updatedAt && <span className="live-dot">Live, updated at {clock(updatedAt.toISOString())}</span>}
              </div>
            </section>

            <div className="q-grid">
              <section className="card q-card" aria-labelledby="q-meeting">
                <h3 id="q-meeting"><CalendarDays size={20} aria-hidden="true" /> Your meeting</h3>
                <p className="hand">{data.title}</p>
                {slot && (
                  <dl>
                    <dt>Date</dt><dd>{parts.long}</dd>
                    <dt>Time</dt><dd>{slot.startTime} to {slot.endTime}</dd>
                    <dt>Place</dt><dd>{slot.location}</dd>
                    <dt>With</dt><dd>{slot.instructor?.fullName}</dd>
                    {slot.module && <><dt>Module</dt><dd>{slot.module.code} {slot.module.name}</dd></>}
                    <dt>Ticket</dt><dd>#{data.position}</dd>
                  </dl>
                )}
              </section>

              <section className={`card q-card ${data.checkedIn ? 'card-blue' : 'card-butter'}`} aria-labelledby="q-door">
                <h3 id="q-door"><QrCode size={20} aria-hidden="true" /> Door check-in</h3>
                {data.checkedIn ? (
                  <p><span className="badge badge-in"><CheckCircle2 size={14} aria-hidden="true" /> Checked in</span> The instructor can see you are at the door.</p>
                ) : (
                  <p>Scan the QR code from your confirmation email when you arrive. It works once, on the meeting day only.</p>
                )}
                <div className="q-meta">
                  {data.status === 'waiting' && <span><Clock size={16} aria-hidden="true" /> {waitText(data.estimatedWaitMinutes)}</span>}
                  {slot && <span><MapPin size={16} aria-hidden="true" /> {slot.location}</span>}
                  {slot && <span><UserRound size={16} aria-hidden="true" /> {slot.instructor?.fullName}</span>}
                </div>
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}
