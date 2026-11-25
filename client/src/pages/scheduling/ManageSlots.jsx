// [S1] ManageSlots: Instructor creates/edits/deletes slots (#8)
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CalendarPlus, Clock, ListOrdered, MapPin, Pencil, Trash2, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Alert from '@/components/Alert';
import { createSlot, deleteSlot, getHolidays, getModules, getSlots, updateSlot } from '@/api/scheduling';
import './scheduling.css';

// Today as YYYY-MM-DD in local time (same format as slotDate, so strings compare correctly)
const today = () => new Date().toLocaleDateString('en-CA');

// "2026-11-25" -> { day: 'Wed', num: 25, month: 'Nov' }. Adding T00:00 keeps it in local time
const dateParts = d => {
  const date = new Date(`${d}T00:00`);
  return {
    day: date.toLocaleDateString('en-GB', { weekday: 'short' }),
    num: date.getDate(),
    month: date.toLocaleDateString('en-GB', { month: 'short' }),
  };
};

const EMPTY_SLOT = { moduleId: '', slotDate: '', startTime: '', endTime: '', location: '', capacity: '5' };

// Business-rule codes from the API (409) -> which field the message belongs under
const FIELD_FOR_CODE = { WEEKEND: 'slotDate', HOLIDAY: 'slotDate', SLOT_OVERLAP: 'startTime' };

// Checks the form in the browser first (the backend checks the same rules again)
// minCapacity: when editing, capacity cannot go below the students already confirmed
function validateSlot(v, holidays, minCapacity = 1) {
  const e = {};
  if (!v.slotDate) e.slotDate = 'Pick a date';
  else if (v.slotDate < today()) e.slotDate = 'The date cannot be in the past';
  else if ([5, 6].includes(new Date(`${v.slotDate}T00:00`).getDay())) e.slotDate = 'Friday and Saturday are weekend days';
  else {
    const holiday = holidays.find(h => h.date === v.slotDate);
    if (holiday) e.slotDate = `That day is a public holiday (${holiday.name})`;
  }
  if (!v.startTime) e.startTime = 'Pick a start time';
  if (!v.endTime) e.endTime = 'Pick an end time';
  else if (v.startTime && v.endTime <= v.startTime) e.endTime = 'The end time must be after the start time';
  const location = v.location.trim();
  if (location.length < 2 || location.length > 100) e.location = 'Enter a room between 2 and 100 characters';
  const cap = Number(v.capacity);
  if (!Number.isInteger(cap) || cap < 1 || cap > 50) e.capacity = 'Capacity must be a whole number from 1 to 50';
  else if (cap < minCapacity) e.capacity = `${minCapacity} students are already confirmed, so capacity must be at least ${minCapacity}`;
  return e;
}

// Create (and later edit) form. Shows field errors under each field and the next holidays as a hint.
function SlotForm({ initial = EMPTY_SLOT, minCapacity = 1, modules, holidays, title, submitLabel, onSubmit, onClose }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const nextHolidays = holidays.filter(h => h.date >= today()).slice(0, 3);

  const set = e => {
    setValues({ ...values, [e.target.name]: e.target.value });
    setErrors({ ...errors, [e.target.name]: '' });
  };

  const submit = async e => {
    e.preventDefault();
    const found = validateSlot(values, holidays, minCapacity);
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    setMessage('');
    try {
      await onSubmit({
        moduleId: values.moduleId ? Number(values.moduleId) : null,
        slotDate: values.slotDate,
        startTime: values.startTime,
        endTime: values.endTime,
        location: values.location.trim(),
        capacity: Number(values.capacity),
      });
    } catch (err) {
      // 400: field details from the API; 409: a business rule (weekend, holiday, overlap)
      const fieldErrors = Object.fromEntries((err.details || []).map(d => [d.field, d.issue]));
      if (FIELD_FOR_CODE[err.code]) fieldErrors[FIELD_FOR_CODE[err.code]] = err.message;
      setErrors(fieldErrors);
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = (name, label, input, hint) => (
    <div className="field">
      <label className="label" htmlFor={name}>{label}</label>
      {input}
      {hint && !errors[name] && <span className="hint">{hint}</span>}
      {errors[name] && <span className="field-error" id={`${name}-error`}>{errors[name]}</span>}
    </div>
  );
  const attrs = name => ({
    id: name, name, value: values[name], onChange: set,
    'aria-invalid': !!errors[name], 'aria-describedby': `${name}-error`,
  });

  return (
    <section className="slot-form-panel" aria-labelledby="slot-form-title">
      <div className="slot-form-head">
        <h2 id="slot-form-title">{title}</h2>
        <button type="button" className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close the form"><X size={20} aria-hidden="true" /></button>
      </div>

      <form className="form" onSubmit={submit} noValidate>
        <Alert type="error" onClose={() => setMessage('')}>{message}</Alert>

        <div className="slot-form-grid">
          {field('moduleId', 'Module', (
            <select className="select" {...attrs('moduleId')}>
              <option value="">General (any of my modules)</option>
              {modules.map(m => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}
            </select>
          ))}
          {field('slotDate', 'Date', <input type="date" className="input" min={today()} {...attrs('slotDate')} />,
            nextHolidays.length ? `Holidays: ${nextHolidays.map(h => `${h.name} (${h.date})`).join(', ')}` : 'No Fridays, Saturdays or public holidays')}
          {field('startTime', 'Start', <input type="time" className="input" {...attrs('startTime')} />)}
          {field('endTime', 'End', <input type="time" className="input" {...attrs('endTime')} />)}
          {field('location', 'Room', <input className="input" placeholder="e.g. Room C-204" maxLength={100} {...attrs('location')} />)}
          {field('capacity', 'Capacity', <input type="number" className="input" min={1} max={50} {...attrs('capacity')} />, 'How many students can book (1 to 50)')}
        </div>

        <div className="slot-form-actions">
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : submitLabel}</button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </section>
  );
}

// One of the instructor's slots, in the same ticket style as BrowseSlots
// Slot API shape -> form values (the form works with strings)
const toFormValues = slot => ({
  moduleId: slot.module ? String(slot.module.id) : '',
  slotDate: slot.slotDate,
  startTime: slot.startTime,
  endTime: slot.endTime,
  location: slot.location,
  capacity: String(slot.capacity),
});

function MySlotCard({ slot, onEdit, onCancel, onDelete }) {
  const [confirming, setConfirming] = useState(null); // null, 'cancel' or 'delete'
  const [busy, setBusy] = useState(false);
  const { day, num, month } = dateParts(slot.slotDate);
  const fill = Math.min(100, Math.round((slot.confirmedCount / slot.capacity) * 100));
  const cancelled = slot.status === 'cancelled';
  const past = slot.slotDate < today();

  // Runs the confirmed action; the parent shows the success or error message
  const run = async () => {
    setBusy(true);
    const done = await (confirming === 'cancel' ? onCancel(slot) : onDelete(slot));
    setBusy(false);
    if (!done) setConfirming(null);
  };

  return (
    <article className={`slot-ticket${cancelled || past ? ' is-muted' : ''}`}>
      <div className="slot-date" aria-label={`${day} ${num} ${month}`}>
        <span>{day}</span>
        <strong>{num}</strong>
        <span>{month}</span>
      </div>

      <div className="slot-body">
        <div className="slot-top">
          <span className="slot-code">{slot.module ? slot.module.code : 'General'}</span>
          {cancelled && <span className="badge badge-cancelled">Cancelled</span>}
          {!cancelled && past && <span className="badge badge-completed">Past</span>}
          {!cancelled && !past && <span className="badge badge-confirmed">Active</span>}
        </div>
        <h3 className="slot-module">{slot.module ? slot.module.name : 'General office hours'}</h3>
        <div className="slot-facts">
          <span><Clock size={16} aria-hidden="true" /> {slot.startTime} to {slot.endTime}</span>
          <span><MapPin size={16} aria-hidden="true" /> {slot.location}</span>
        </div>

        <div className="slot-capacity">
          <div className="slot-bar" role="progressbar" aria-label="Places taken" aria-valuemin={0} aria-valuemax={slot.capacity} aria-valuenow={slot.confirmedCount}>
            <span style={{ width: `${fill}%` }} />
          </div>
          <small>{slot.confirmedCount} of {slot.capacity} places booked</small>
        </div>

        {!cancelled && (
          <Link to={`/instructor/queue/${slot.id}`} className="btn btn-blue btn-block">
            <ListOrdered size={18} aria-hidden="true" /> Open queue
          </Link>
        )}

        {/* Destructive actions ask first (section 8.6) */}
        {confirming ? (
          <div className="slot-confirm" role="alertdialog" aria-label={confirming === 'cancel' ? 'Confirm cancelling the slot' : 'Confirm deleting the slot'}>
            <p>
              {confirming === 'cancel'
                ? 'Cancel this slot? All its pending and confirmed requests are cancelled and the students are notified.'
                : 'Delete this slot for good? This cannot be undone.'}
            </p>
            <div className="slot-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={run}>
                {busy ? 'Working...' : confirming === 'cancel' ? 'Yes, cancel it' : 'Yes, delete it'}
              </button>
              <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirming(null)}>Keep it</button>
            </div>
          </div>
        ) : (
          <div className="slot-actions">
            {!cancelled && !past && (
              <>
                <button type="button" className="btn btn-ghost" onClick={() => onEdit(slot)}><Pencil size={16} aria-hidden="true" /> Edit</button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirming('cancel')}><Ban size={16} aria-hidden="true" /> Cancel</button>
              </>
            )}
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming('delete')}><Trash2 size={16} aria-hidden="true" /> Delete</button>
          </div>
        )}
      </div>
    </article>
  );
}

export default function ManageSlots() {
  const [slots, setSlots] = useState([]);
  const [tab, setTab] = useState('upcoming'); // 'upcoming' or 'past'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [modules, setModules] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [formSlot, setFormSlot] = useState(null); // null = form closed, 'new' = create, a slot = edit it

  // Taught modules (for the form) and Egypt holidays for this year and next (Calendarific via the API)
  useEffect(() => {
    const year = new Date().getFullYear();
    getModules().then(res => setModules(res.data)).catch(err => setError(err.message));
    Promise.all([getHolidays(year), getHolidays(year + 1)])
      .then(([a, b]) => setHolidays([...a.data, ...b.data]))
      .catch(err => setError(`Could not load holidays: ${err.message}`));
  }, []);

  // For an instructor, GET /slots returns only their own slots (past and cancelled too)
  useEffect(() => {
    let ignore = false;
    getSlots({ limit: 100 })
      .then(res => { if (!ignore) setSlots(res.data); })
      .catch(err => { if (!ignore) setError(err.message); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, []);

  const create = async body => {
    const res = await createSlot(body); // errors are shown by the form
    setSlots(list => [...list, res.data]);
    setFormSlot(null);
    setTab('upcoming');
    setSuccess(`Slot created for ${res.data.slotDate}, ${res.data.startTime} to ${res.data.endTime}.`);
  };

  const save = async body => {
    const res = await updateSlot(formSlot.id, body); // errors are shown by the form
    setSlots(list => list.map(s => (s.id === res.data.id ? res.data : s)));
    setFormSlot(null);
    setSuccess(`Slot on ${res.data.slotDate} updated.`);
  };

  const openForm = slot => {
    setFormSlot(slot);
    setSuccess('');
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' }); // the form opens at the top of the page
  };

  // PATCH status=cancelled: the API also cancels the slot's requests and notifies the students
  const cancel = async slot => {
    setError('');
    try {
      const res = await updateSlot(slot.id, { status: 'cancelled' });
      setSlots(list => list.map(s => (s.id === slot.id ? res.data : s)));
      setSuccess(`Slot on ${slot.slotDate} cancelled. Its students were notified.`);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  };

  // DELETE only works when the slot has no active requests (409 SLOT_HAS_REQUESTS otherwise)
  const remove = async slot => {
    setError('');
    try {
      await deleteSlot(slot.id);
      setSlots(list => list.filter(s => s.id !== slot.id));
      setSuccess(`Slot on ${slot.slotDate} deleted.`);
      return true;
    } catch (err) {
      if (err.code === 'SLOT_HAS_REQUESTS' && slot.slotDate < today()) {
  setError('This slot is over and still has student requests, so it stays in your history.');
} else if (err.code === 'SLOT_HAS_REQUESTS') {
  setError('This slot has students with active requests, so it cannot be deleted. Cancel it instead.');
} else {
  setError(err.message);
}
      return false;
    }
  };

  const isUpcoming = s => s.status === 'active' && s.slotDate >= today();
  const upcoming = slots.filter(isUpcoming).sort((a, b) => (a.slotDate + a.startTime).localeCompare(b.slotDate + b.startTime));
  const past = slots.filter(s => !isUpcoming(s)).sort((a, b) => (b.slotDate + b.startTime).localeCompare(a.slotDate + a.startTime));
  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <>
      <PageHeader eyebrow="Your week" title="My slots" description="Create, edit, cancel or delete your office-hour slots.">
        <button type="button" className="btn btn-primary" onClick={() => openForm('new')}>
          <CalendarPlus size={18} aria-hidden="true" /> New slot
        </button>
      </PageHeader>

      <div className="stack">
        <Alert type="success" onClose={() => setSuccess('')}>{success}</Alert>

        {formSlot === 'new' && (
          <SlotForm key="new" title="New slot" submitLabel="Create slot" modules={modules} holidays={holidays}
            onSubmit={create} onClose={() => setFormSlot(null)} />
        )}
        {formSlot && formSlot !== 'new' && (
          <SlotForm key={formSlot.id} title="Edit slot" submitLabel="Save changes" modules={modules} holidays={holidays}
            initial={toFormValues(formSlot)} minCapacity={Math.max(1, formSlot.confirmedCount)}
            onSubmit={save} onClose={() => setFormSlot(null)} />
        )}

        <div className="tabs" role="tablist" aria-label="Which slots to show">
          <button type="button" role="tab" aria-selected={tab === 'upcoming'} className={`tab${tab === 'upcoming' ? ' active' : ''}`} onClick={() => setTab('upcoming')}>
            Upcoming <span className="tab-count">{upcoming.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === 'past'} className={`tab${tab === 'past' ? ' active' : ''}`} onClick={() => setTab('past')}>
            Past and cancelled <span className="tab-count">{past.length}</span>
          </button>
        </div>

        <Alert type="error" onClose={() => setError('')}>{error}</Alert>

        {loading && <p className="muted">Loading your slots...</p>}

        {!loading && !error && shown.length === 0 && (
          <div className="card center">
            <span className="hand">{tab === 'upcoming' ? 'No upcoming slots' : 'Nothing here yet'}</span>
            <p className="muted">{tab === 'upcoming' ? 'Create a slot so students can book office hours with you.' : 'Past and cancelled slots will show here.'}</p>
          </div>
        )}

        {!loading && shown.length > 0 && (
          <div className="slot-grid">
            {shown.map(slot => <MySlotCard key={slot.id} slot={slot} onEdit={openForm} onCancel={cancel} onDelete={remove} />)}
          </div>
        )}
      </div>
    </>
  );
}
