// [S2] NewRequest: Student describes the question, the AI checks it against the FAQ, then picks a time and sends the request (#6, #13)
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Check, Clock, MapPin, PartyPopper, Pencil, Send, Sparkles, UserRound, Users,
} from 'lucide-react';
import { getSlot } from '@/api/scheduling';
import { checkFaq, createRequest } from '@/api/requests';
import PageHeader from '@/components/PageHeader';
import Alert from '@/components/Alert';
import CountedField from './CountedField';
import ThinkingStudent from './ThinkingStudent';
import './requests.css';

const STEPS = ['Question', 'AI check', 'Time', 'Review'];
const LIMITS = { title: [3, 120], description: [10, 2000] };
const DURATIONS = [10, 15, 20, 30];
const PRIORITIES = [
  { value: 'low', label: 'Low', hint: 'Whenever there is time' },
  { value: 'normal', label: 'Normal', hint: 'A regular question' },
  { value: 'high', label: 'High', hint: 'Blocking my work or a deadline' },
];

// "10:00" or "10:00:00" <-> minutes since midnight
const toMin = t => { const [h, m] = t.slice(0, 5).split(':').map(Number); return h * 60 + m; };
const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const prettyDate = d => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }; // local date, not UTC
const wait = ms => new Promise(r => setTimeout(r, ms));
const blockedReason = s => (!s ? null
  : s.status !== 'active' ? 'This slot was cancelled.'
    : s.slotDate < todayIso() ? 'This slot is in the past.'
      : s.isFull ? 'This slot is full.' : null);

// ---------- Progress bar: 1 Question, 2 AI check, 3 Time, 4 Review ----------
function Stepper({ step, reached, onGo }) {
  return (
    <ol className="stepper" aria-label="Progress">
      {STEPS.map((label, i) => {
        const state = i < step ? 'done' : i === step ? 'current' : 'todo';
        return (
          <li key={label} className={`step step-${state}`}>
            <button type="button" onClick={() => onGo(i)} disabled={i > reached || i === step} aria-current={i === step ? 'step' : undefined}>
              <span className="step-dot">{i < step ? <Check size={14} aria-hidden="true" /> : i + 1}</span>
              <span className="step-label">{label}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ---------- The slot, shown as a ticket stub beside the form ----------
function SlotTicket({ slot, loading, blocked }) {
  if (loading) {
    return (
      <aside className="ticket ticket-skeleton" aria-busy="true" aria-label="Loading slot">
        <span /><span /><span /><span />
      </aside>
    );
  }
  if (!slot) return null;
  const left = slot.capacity - slot.confirmedCount;
  return (
    <aside className="ticket" aria-label="Selected slot">
      <div className="ticket-head">
        <span className="hand">your slot</span>
        <h3>{slot.module?.name || 'Any of the instructor\'s modules'}</h3>
      </div>
      <ul className="ticket-rows">
        <li><UserRound size={18} aria-hidden="true" /> {slot.instructor.fullName}</li>
        <li><CalendarDays size={18} aria-hidden="true" /> {prettyDate(slot.slotDate)}</li>
        <li><Clock size={18} aria-hidden="true" /> {slot.startTime.slice(0, 5)} to {slot.endTime.slice(0, 5)}</li>
        <li><MapPin size={18} aria-hidden="true" /> {slot.location}</li>
        <li><Users size={18} aria-hidden="true" /> {left} of {slot.capacity} spots left</li>
      </ul>
      {slot.clashesWithSchedule && (
        <p className="ticket-warn"><AlertTriangle size={16} aria-hidden="true" /> Clashes with your timetable</p>
      )}
      {blocked && <p className="ticket-blocked" role="alert">{blocked}</p>}
    </aside>
  );
}

// ---------- Start chips + length + a mini timeline of the slot ----------
function TimePicker({ slot, start, duration, onStart, onDuration, error }) {
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

export default function NewRequest() {
  const [params] = useSearchParams();
  const slotId = params.get('slotId');

  const [slot, setSlot] = useState(null);
  const [loadingSlot, setLoadingSlot] = useState(Boolean(slotId));
  const [slotMissing, setSlotMissing] = useState(!slotId);
  const [step, setStep] = useState(0);
  const [reached, setReached] = useState(0);
  const [form, setForm] = useState({ title: '', description: '', priority: 'normal', start: '', duration: 15 });
  const [errors, setErrors] = useState({});
  const [check, setCheck] = useState({ state: 'idle', key: '', result: null }); // idle | checking | match | none | error
  const [view, setView] = useState('form'); // form | resolved | sent
  const [sent, setSent] = useState(null);
  const [submitError, setSubmitError] = useState(null); // { text, to, label }
  const [busy, setBusy] = useState(false);
  const headingRef = useRef(null);
  const firstRender = useRef(true);

  // Load the slot from the ?slotId= in the URL (set by Browse slots)
  useEffect(() => {
    if (!slotId) return;
    getSlot(slotId)
      .then(res => { setSlot(res.data); setForm(f => ({ ...f, start: res.data.startTime.slice(0, 5) })); })
      .catch(() => setSlotMissing(true))
      .finally(() => setLoadingSlot(false));
  }, [slotId]);

  // Move keyboard/screen-reader focus to the new step's heading
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus();
  }, [step, view]);

  const blocked = blockedReason(slot);
  const goTo = i => { setStep(i); setReached(r => Math.max(r, i)); setSubmitError(null); };
  const set = field => e => { setForm({ ...form, [field]: e.target.value }); setErrors({ ...errors, [field]: '' }); };

  // ----- Step 1 -> 2: validate the question, then run the AI check -----
  const runCheck = async () => {
    const key = `${form.title.trim()}\n${form.description.trim()}`;
    if (check.key === key && check.state !== 'error') return; // same question, keep the earlier answer
    setCheck({ state: 'checking', key, result: null });
    try {
      const [res] = await Promise.all([checkFaq({ slotId, title: form.title.trim(), description: form.description.trim() }), wait(900)]);
      setCheck({ state: res.data.matched ? 'match' : 'none', key, result: res.data });
    } catch {
      setCheck({ state: 'error', key, result: null });
    }
  };

  const submitQuestion = e => {
    e.preventDefault();
    const found = {};
    Object.entries(LIMITS).forEach(([field, [min, max]]) => {
      const len = form[field].trim().length;
      if (len < min) found[field] = `Write at least ${min} characters`;
      else if (len > max) found[field] = `Keep it under ${max} characters`;
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    goTo(1);
    runCheck();
  };

  // ----- Step 3: keep the window inside the slot -----
  const setStart = start => {
    const room = toMin(slot.endTime) - toMin(start);
    const duration = form.duration <= room ? form.duration : [...DURATIONS].reverse().find(d => d <= room);
    setForm({ ...form, start, duration });
    setErrors({ ...errors, window: '' });
  };

  // ----- Step 4: send -----
  const send = async () => {
    setBusy(true);
    setSubmitError(null);
    const st = toMin(form.start);
    try {
      const res = await createRequest({
        slotId,
        title: form.title.trim(),
        description: form.description.trim(),
        preferredStart: form.start,
        preferredEnd: toTime(st + form.duration),
        priority: form.priority,
        faqSuggestion: check.state === 'match' ? check.result.answer : null,
      });
      setSent(res.data);
      setView('sent');
    } catch (err) {
      if (err.code === 'WINDOW_OUTSIDE_SLOT') { setErrors({ window: err.message }); goTo(2); }
      else if (err.code === 'VALIDATION_ERROR') {
        const fieldErrors = Object.fromEntries((err.details || []).map(d => [d.field, d.issue]));
        setErrors(fieldErrors);
        goTo(fieldErrors.title || fieldErrors.description ? 0 : 2);
      } else if (err.code === 'SLOT_FULL') setSubmitError({ text: 'This slot just filled up.', to: '/student/slots', label: 'Pick another slot' });
      else if (err.code === 'DUPLICATE_REQUEST') setSubmitError({ text: err.message, to: '/student/requests', label: 'View my requests' });
      else if (err.code === 'SLOT_NOT_ACTIVE') setSubmitError({ text: 'This slot was cancelled.', to: '/student/slots', label: 'Browse slots' });
      else setSubmitError({ text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const startOver = () => {
    setForm(f => ({ ...f, title: '', description: '' }));
    setCheck({ state: 'idle', key: '', result: null });
    setReached(0);
    setStep(0);
    setView('form');
  };

  // ---------- No slot picked / slot not found ----------
  if (slotMissing) {
    return (
      <>
        <PageHeader eyebrow="Ask first, book second" title="New request" />
        <div className="todo stack">
          <ThinkingStudent size={110} />
          <span className="hand">Pick a slot first</span>
          <p className="muted">Choose an office-hour slot, then come back here to describe your question.</p>
          <div><Link to="/student/slots" className="btn btn-primary">Browse slots <ArrowRight size={18} aria-hidden="true" /></Link></div>
        </div>
      </>
    );
  }

  const end = form.start ? toTime(toMin(form.start) + form.duration) : '';

  return (
    <>
      <PageHeader eyebrow="Ask first, book second" title="New request"
        description="Describe your question. We check the FAQ before you book, so you might get your answer right away.">
        <Link to="/student/slots" className="btn btn-ghost"><ArrowLeft size={18} aria-hidden="true" /> Back to slots</Link>
      </PageHeader>

      <div className="nr-layout">
        <section className="card nr-main">
          {/* ---------- Resolved by the FAQ: no meeting needed ---------- */}
          {view === 'resolved' && (
            <div className="nr-panel nr-center">
              <PartyPopper size={40} className="nr-big-icon" aria-hidden="true" />
              <h2 ref={headingRef} tabIndex={-1}>Glad that helped!</h2>
              <p className="muted">No request was sent, so the slot stays free for someone else.</p>
              <div className="nr-actions nr-actions-center">
                <button type="button" className="btn" onClick={startOver}>Ask something else</button>
                <Link to="/student/slots" className="btn btn-primary">Back to slots</Link>
              </div>
            </div>
          )}

          {/* ---------- Sent ---------- */}
          {view === 'sent' && sent && (
            <div className="nr-panel nr-center">
              <Send size={40} className="nr-big-icon" aria-hidden="true" />
              <h2 ref={headingRef} tabIndex={-1}>Request sent</h2>
              <span className="badge badge-pending">Pending</span>
              <ol className="next-steps">
                <li>{sent.slot.instructor.fullName} reviews your request.</li>
                <li>You get a notification when it is confirmed or rejected.</li>
                <li>If confirmed, a QR ticket arrives by email for check-in.</li>
              </ol>
              <div className="nr-actions nr-actions-center">
                <Link to="/student/slots" className="btn">Book another slot</Link>
                <Link to="/student/requests" className="btn btn-primary">View my requests</Link>
              </div>
            </div>
          )}

          {view === 'form' && (
            <>
              <Stepper step={step} reached={reached} onGo={goTo} />

              {/* ---------- 1. Question ---------- */}
              {step === 0 && (
                <form className="form nr-panel" onSubmit={submitQuestion} noValidate>
                  <h2 ref={headingRef} tabIndex={-1}>What do you need help with?</h2>
                  <CountedField id="nr-title" label="Title" value={form.title} onChange={set('title')} error={errors.title}
                    max={LIMITS.title[1]} placeholder="e.g. Lambda returns 502 on Floci" />
                  <CountedField id="nr-description" label="Details" value={form.description} onChange={set('description')} error={errors.description}
                    max={LIMITS.description[1]} multiline placeholder="What did you try, what happened, what did you expect?" />
                  <div className="nr-actions">
                    <button className="btn btn-primary" disabled={!!blocked || loadingSlot}>
                      Check the FAQ <Sparkles size={18} aria-hidden="true" />
                    </button>
                  </div>
                </form>
              )}

              {/* ---------- 2. AI check ---------- */}
              {step === 1 && (
                <div className="nr-panel" aria-live="polite">
                  <h2 ref={headingRef} tabIndex={-1}>Checking the FAQ first</h2>

                  {check.state === 'checking' && (
                    <div className="nr-checking">
                      <ThinkingStudent size={120} />
                      <p className="hand">Reading {slot?.instructor.fullName}'s FAQ...</p>
                    </div>
                  )}

                  {check.state === 'match' && (
                    <>
                      <p className="muted">This might already be answered:</p>
                      <div className="faq-match">
                        <p className="faq-q"><span className="hand">Q.</span> {check.result.faqQuestion}</p>
                        <p className="faq-a"><span className="hand">A.</span> {check.result.answer}</p>
                      </div>
                      <div className="nr-actions">
                        <button type="button" className="btn" onClick={() => setView('resolved')}>
                          <Check size={18} aria-hidden="true" /> That answers it
                        </button>
                        <button type="button" className="btn btn-primary" onClick={() => goTo(2)}>
                          I still need a meeting <ArrowRight size={18} aria-hidden="true" />
                        </button>
                      </div>
                    </>
                  )}

                  {check.state === 'none' && (
                    <>
                      <p className="nr-note">No FAQ covers this. Let's book it.</p>
                      <div className="nr-actions">
                        <button type="button" className="btn btn-primary" onClick={() => goTo(2)}>Pick a time <ArrowRight size={18} aria-hidden="true" /></button>
                      </div>
                    </>
                  )}

                  {check.state === 'error' && (
                    <>
                      <Alert type="info">We could not reach the AI check right now. You can still book your meeting.</Alert>
                      <div className="nr-actions">
                        <button type="button" className="btn" onClick={runCheck}>Try again</button>
                        <button type="button" className="btn btn-primary" onClick={() => goTo(2)}>Continue <ArrowRight size={18} aria-hidden="true" /></button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ---------- 3. Time + priority ---------- */}
              {step === 2 && slot && (
                <form className="form nr-panel" onSubmit={e => { e.preventDefault(); goTo(3); }} noValidate>
                  <h2 ref={headingRef} tabIndex={-1}>When, and how urgent?</h2>
                  <TimePicker slot={slot} start={form.start} duration={form.duration} onStart={setStart}
                    onDuration={d => setForm({ ...form, duration: d })} error={errors.window} />

                  <fieldset className="plain-fieldset">
                    <legend className="label">Priority</legend>
                    <div className="segmented">
                      {PRIORITIES.map(p => (
                        <button key={p.value} type="button" aria-pressed={form.priority === p.value}
                          onClick={() => setForm({ ...form, priority: p.value })}>{p.label}</button>
                      ))}
                    </div>
                    <span className="hint">{PRIORITIES.find(p => p.value === form.priority).hint}</span>
                  </fieldset>

                  <div className="nr-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => goTo(1)}><ArrowLeft size={18} aria-hidden="true" /> Back</button>
                    <button className="btn btn-primary">Review <ArrowRight size={18} aria-hidden="true" /></button>
                  </div>
                </form>
              )}

              {/* ---------- 4. Review + send ---------- */}
              {step === 3 && slot && (
                <div className="nr-panel">
                  <h2 ref={headingRef} tabIndex={-1}>Ready to send?</h2>
                  {submitError && (
                    <Alert type="error" onClose={() => setSubmitError(null)}>
                      {submitError.text} {submitError.to && <Link to={submitError.to}>{submitError.label}</Link>}
                    </Alert>
                  )}
                  <dl className="review">
                    <div>
                      <dt>Question <button type="button" className="link-btn" onClick={() => goTo(0)}><Pencil size={14} aria-hidden="true" /> Edit</button></dt>
                      <dd><strong>{form.title.trim()}</strong><span className="muted review-desc">{form.description.trim()}</span></dd>
                    </div>
                    <div>
                      <dt>Time <button type="button" className="link-btn" onClick={() => goTo(2)}><Pencil size={14} aria-hidden="true" /> Edit</button></dt>
                      <dd>{prettyDate(slot.slotDate)}, {form.start} to {end} ({form.duration} min)</dd>
                    </div>
                    <div>
                      <dt>Priority <button type="button" className="link-btn" onClick={() => goTo(2)}><Pencil size={14} aria-hidden="true" /> Edit</button></dt>
                      <dd className="review-priority">{form.priority}</dd>
                    </div>
                    {check.state === 'match' && (
                      <div>
                        <dt>FAQ you already read</dt>
                        <dd className="muted">{check.result.faqQuestion}</dd>
                      </div>
                    )}
                  </dl>
                  <div className="nr-actions">
                    <button type="button" className="btn btn-ghost" onClick={() => goTo(2)} disabled={busy}><ArrowLeft size={18} aria-hidden="true" /> Back</button>
                    <button type="button" className="btn btn-primary" onClick={send} disabled={busy || !!blocked}>
                      {busy ? 'Sending...' : <>Send request <Send size={18} aria-hidden="true" /></>}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <SlotTicket slot={slot} loading={loadingSlot} blocked={blocked} />
      </div>
    </>
  );
}
