// [S1] BrowseSlots: Student searches/filters slots; non-clashing first, holidays excluded (#1)
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Clock, MapPin, Search, Users, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Alert from '@/components/Alert';
import './scheduling.css';
import { getInstructors, getModules, getSlots } from '@/api/scheduling';

const EMPTY = { moduleId: '', instructorId: '', from: '', to: '', q: '' };

// "2026-11-25" -> "Wed 25 Nov". Adding T00:00 keeps it in local time, so the day never shifts
const niceDate = d => new Date(`${d}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

// One slot: details, places left, warnings, and the link to S2's NewRequest page
function SlotCard({ slot }) {
  const placesLeft = Math.max(0, slot.capacity - slot.confirmedCount);
  return (
    <article className={`card stack slot-card${slot.clashesWithSchedule ? ' is-clash' : ''}`}>
      <div>
        <strong>{slot.module ? slot.module.name : 'General office hours'}</strong>
        {slot.module && <div className="muted">{slot.module.code}</div>}
      </div>
      <span className="hand">{slot.instructor.fullName}</span>
      <span className="slot-meta"><CalendarDays size={16} aria-hidden="true" /> {niceDate(slot.slotDate)}</span>
      <span className="slot-meta"><Clock size={16} aria-hidden="true" /> {slot.startTime} to {slot.endTime}</span>
      <span className="slot-meta"><MapPin size={16} aria-hidden="true" /> {slot.location}</span>
      <span className="slot-meta"><Users size={16} aria-hidden="true" /> {placesLeft} of {slot.capacity} places left</span>

      {(slot.clashesWithSchedule || slot.isFull) && (
        <div>
          {slot.clashesWithSchedule && <span className="badge badge-pending">Clashes with your timetable</span>}{' '}
          {slot.isFull && <span className="badge badge-rejected">Full</span>}
        </div>
      )}

      {slot.isFull
        ? <button type="button" className="btn btn-block" disabled>Slot is full</button>
        : <Link to={`/student/requests/new?slotId=${slot.id}`} className="btn btn-primary btn-block">Request this slot</Link>}
    </article>
  );
}

export default function BrowseSlots() {
  const [modules, setModules] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [form, setForm] = useState(EMPTY); // what the student is typing
  const [filters, setFilters] = useState(EMPTY); // what was last applied (drives the search)
  const [errors, setErrors] = useState({});
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modules for the first dropdown (once)
  useEffect(() => {
    getModules().then(res => setModules(res.data)).catch(err => setError(err.message));
  }, []);

  // Instructors depend on the chosen module
  useEffect(() => {
    let ignore = false;
    getInstructors({ moduleId: form.moduleId })
      .then(res => { if (!ignore) setInstructors(res.data); })
      .catch(err => { if (!ignore) setError(err.message); });
    return () => { ignore = true; };
  }, [form.moduleId]);

  // Slots reload every time the applied filters change
  useEffect(() => {
    let ignore = false; // stops a late answer from updating the page after the student left it
    setLoading(true);
    setError('');
    getSlots(filters)
      .then(res => { if (!ignore) setSlots(res.data); })
      .catch(err => { if (!ignore) setError(err.message); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [filters]);

  const set = e => {
    const { name, value } = e.target;
    // A new module may not have the old instructor, so reset the instructor too
    setForm(f => ({ ...f, [name]: value, ...(name === 'moduleId' ? { instructorId: '' } : {}) }));
    setErrors(er => ({ ...er, [name]: '' }));
  };

  const apply = e => {
    e.preventDefault();
    if (form.from && form.to && form.to < form.from) {
      setErrors({ to: 'The end date must be on or after the start date' });
      return;
    }
    setFilters({ ...form, q: form.q.trim() });
  };

  const clear = () => {
    setForm(EMPTY);
    setFilters(EMPTY);
    setErrors({});
  };

  const filtered = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader eyebrow="Book a slot" title="Find office hours that fit your timetable" description="Pick a module, then an instructor, then a slot. Slots that clash with your classes show last." />

      <div className="stack">
        <form className="card form slot-filters" onSubmit={apply} noValidate aria-label="Filter slots">
          <div className="field">
            <label className="label" htmlFor="moduleId">Module</label>
            <select id="moduleId" name="moduleId" className="select" value={form.moduleId} onChange={set}>
              <option value="">All my modules</option>
              {modules.map(m => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="label" htmlFor="instructorId">Instructor</label>
            <select id="instructorId" name="instructorId" className="select" value={form.instructorId} onChange={set}>
              <option value="">Any instructor</option>
              {instructors.map(i => <option key={i.universityId} value={i.universityId}>{i.fullName}</option>)}
            </select>
          </div>

          <div className="field">
            <label className="label" htmlFor="from">From</label>
            <input id="from" name="from" type="date" className="input" value={form.from} onChange={set} />
          </div>

          <div className="field">
            <label className="label" htmlFor="to">To</label>
            <input id="to" name="to" type="date" className="input" value={form.to} onChange={set}
              aria-invalid={!!errors.to} aria-describedby="to-error" />
            {errors.to && <span className="field-error" id="to-error">{errors.to}</span>}
          </div>

          <div className="field">
            <label className="label" htmlFor="q">Search</label>
            <input id="q" name="q" className="input" placeholder="Instructor, module code or room" value={form.q} onChange={set} />
          </div>

          <div className="slot-filter-actions">
            <button type="submit" className="btn btn-primary"><Search size={18} aria-hidden="true" /> Search</button>
            <button type="button" className="btn btn-ghost" onClick={clear}><X size={18} aria-hidden="true" /> Clear</button>
          </div>
        </form>

        <Alert type="error" onClose={() => setError('')}>{error}</Alert>

        {loading && <p className="muted">Loading slots...</p>}

        {!loading && !error && slots.length === 0 && (
          <div className="card center">
            <span className="hand">No slots found</span>
            <p className="muted">{filtered ? 'No slots match your filters. Try clearing them.' : 'There are no upcoming office hours for your modules yet.'}</p>
          </div>
        )}

        {!loading && slots.length > 0 && (
          <div className="grid">
            {slots.map(slot => <SlotCard key={slot.id} slot={slot} />)}
          </div>
        )}
      </div>
    </>
  );
}
