// [S1] BrowseSlots: Student searches/filters slots; non-clashing first, holidays excluded (#1)
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarX2, Clock, MapPin, Search, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Alert from '@/components/Alert';
import Folder from '@/components/react-bits/Folder';
import Lanyard from '@/components/react-bits/Lanyard';
import './scheduling.css';
import { getInstructors, getModules, getSlots } from '@/api/scheduling';

const EMPTY = { moduleId: '', instructorId: '', from: '', to: '', q: '' };

// "2026-11-25" -> { day: 'Wed', num: '25', month: 'Nov' }. Adding T00:00 keeps it in local time, so the day never shifts
const dateParts = d => {
  const date = new Date(`${d}T00:00`);
  return {
    day: date.toLocaleDateString('en-GB', { weekday: 'short' }),
    num: date.getDate(),
    month: date.toLocaleDateString('en-GB', { month: 'short' }),
  };
};

// Draws an instructor badge on a canvas and returns it as an image URL for the Lanyard card
// (Lanyard only takes images, so we "print" the name onto one)
const badgeImage = name => {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 720;
  const g = canvas.getContext('2d');
  const initials = name.replace('Dr. ', '').split(' ').map(w => w[0]).join('');
  g.textAlign = 'center';
  g.fillStyle = '#FCEA9C';
  g.fillRect(0, 0, 512, 720);
  g.fillStyle = '#590A1C';
  g.fillRect(0, 0, 512, 150);
  g.fillStyle = '#FCEA9C';
  g.font = 'bold 46px sans-serif';
  g.fillText('OfficeOurs', 256, 95);
  g.fillStyle = '#A8D4F9';
  g.beginPath();
  g.arc(256, 330, 110, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2B0710';
  g.font = 'bold 90px sans-serif';
  g.fillText(initials, 256, 362);
  g.font = 'bold 46px sans-serif';
  g.fillText(name, 256, 530);
  g.font = '32px sans-serif';
  g.fillText('Instructor', 256, 590);
  return canvas.toDataURL('image/png');
};

// One slot as a "ticket": date block on the left, details on the right, link to S2's NewRequest page
function SlotCard({ slot }) {
  const { day, num, month } = dateParts(slot.slotDate);
  const placesLeft = Math.max(0, slot.capacity - slot.confirmedCount);
  const fill = Math.min(100, Math.round((slot.confirmedCount / slot.capacity) * 100));
  return (
    <article className={`slot-ticket${slot.clashesWithSchedule ? ' is-clash' : ''}${slot.isFull ? ' is-full' : ''}`}>
      <div className="slot-date" aria-label={`${day} ${num} ${month}`}>
        <span>{day}</span>
        <strong>{num}</strong>
        <span>{month}</span>
      </div>

      <div className="slot-body">
        <div className="slot-top">
          {slot.module && <span className="slot-code">{slot.module.code}</span>}
          {slot.clashesWithSchedule && <span className="badge badge-pending"><CalendarX2 size={14} aria-hidden="true" /> Clashes with a class</span>}
          {slot.isFull && <span className="badge badge-rejected">Full</span>}
        </div>
        <h3 className="slot-module">{slot.module ? slot.module.name : 'General office hours'}</h3>
        <span className="hand slot-instructor">{slot.instructor.fullName}</span>
        <div className="slot-facts">
          <span><Clock size={16} aria-hidden="true" /> {slot.startTime} to {slot.endTime}</span>
          <span><MapPin size={16} aria-hidden="true" /> {slot.location}</span>
        </div>

        <div className="slot-capacity">
          <div className="slot-bar" role="progressbar" aria-label="Places taken" aria-valuemin={0} aria-valuemax={slot.capacity} aria-valuenow={slot.confirmedCount}>
            <span style={{ width: `${fill}%` }} />
          </div>
          <small>{placesLeft} of {slot.capacity} places left</small>
        </div>

        {slot.isFull
          ? <button type="button" className="btn btn-block" disabled>Slot is full</button>
          : <Link to={`/student/requests/new?slotId=${slot.id}`} className="btn btn-primary btn-block">Request this slot</Link>}
      </div>
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

  // One badge image per instructor, redrawn only when the instructor list changes
  const badges = useMemo(
    () => Object.fromEntries(instructors.map(i => [i.universityId, badgeImage(i.fullName)])),
    [instructors],
  );

  // Folder and Lanyard clicks apply the filter straight away (no need to press Search)
  const pickModule = id => {
    const changes = { moduleId: String(id), instructorId: '' };
    setForm(f => ({ ...f, ...changes }));
    setFilters(f => ({ ...f, ...changes }));
  };

  const pickInstructor = id => {
    const instructorId = filters.instructorId === id ? '' : id; // clicking the chosen one again un-picks it
    setForm(f => ({ ...f, instructorId }));
    setFilters(f => ({ ...f, instructorId }));
  };

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
  const chosenModule = modules.find(m => String(m.id) === filters.moduleId);

  return (
    <>
      <PageHeader eyebrow="Book a slot" title="Find office hours that fit your timetable" description="Pick a module, then an instructor, then a slot. Slots that clash with your classes show last." />

      <div className="stack browse">
        {modules.length > 0 && (
          <section className="chooser" aria-label="Choose a module and an instructor">
            <div className="chooser-step">
              <h2 className="chooser-title"><span className="chooser-num">1</span> Module</h2>
              <p className="muted">Open the folder and pick a page.</p>
              <div className="chooser-folder">
                <Folder mode="book" layout="row" label="My modules" theme="light" size={1.1} zoomOnClick={false} color="#590A1C" paperColor="#FFF6D1"
                  items={modules.slice(0, 6).map(m => ({ title: m.code, description: m.name }))}
                  onItemClick={(item, index) => pickModule(modules[index].id)} />
              </div>
              {chosenModule && <span className="chooser-chip">{chosenModule.code} {chosenModule.name}</span>}
            </div>

            <div className="chooser-step">
              <h2 className="chooser-title"><span className="chooser-num">2</span> Instructor</h2>
              {!filters.moduleId && (
                <div className="chooser-empty">
                  <span className="hand">Pick a module first</span>
                  <p className="muted">Their instructors will swing in here.</p>
                </div>
              )}
              {filters.moduleId && instructors.length > 0 && (
                <div className="lanyard-row">
                  {instructors.slice(0, 3).map(i => {
                    const picked = filters.instructorId === i.universityId;
                    return (
                      <div key={i.universityId} className={`lanyard-pick${picked ? ' is-picked' : ''}`}>
                        <div className="lanyard-stage">
                          <Lanyard frontImage={badges[i.universityId]} backImage={badges[i.universityId]} cardColor="#FCEA9C" strapColor="#590A1C" />
                        </div>
                        <button type="button" className={`btn btn-block ${picked ? 'btn-primary' : 'btn-butter'}`} onClick={() => pickInstructor(i.universityId)} aria-pressed={picked}>
                          {picked ? 'Chosen' : 'Choose'} {i.fullName}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}

        <form className="toolbar" onSubmit={apply} noValidate aria-label="Filter slots">
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
          <div className="field toolbar-search">
            <label className="label" htmlFor="q">Search</label>
            <input id="q" name="q" className="input" placeholder="Instructor, module code or room" value={form.q} onChange={set} />
          </div>
          <div className="toolbar-actions">
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
          <>
            <div className="results-head">
              <h2><span className="marker">{slots.length} slot{slots.length === 1 ? '' : 's'}</span> found</h2>
              <span className="muted">Dashed tickets clash with one of your classes.</span>
            </div>
            <div className="slot-grid">
              {slots.map(slot => <SlotCard key={slot.id} slot={slot} />)}
            </div>
          </>
        )}
      </div>
    </>
  );
}
