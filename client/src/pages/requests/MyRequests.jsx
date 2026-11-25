// [S2] MyRequests: Student tracks request status, edits it before it is opened, or cancels it (#2, #5)
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban, CalendarClock, CheckCheck, ChevronDown, Eye, EyeOff, Flame, ListOrdered, Pencil, Plus, RefreshCw, Search, Sparkles, X,
} from 'lucide-react';
import { getRequests, setRequestStatus, updateRequest } from '@/api/requests';
import PageHeader from '@/components/PageHeader';
import Alert from '@/components/Alert';
import Dialog from './Dialog';
import CountedField from './CountedField';
import ThinkingStudent from './ThinkingStudent';
import TimeWindowPicker from './TimeWindowPicker';
import { fitDuration, parseDate, toMin, toTime } from './time';
import './requests.css';

const REFRESH_MS = 20000;
const TABS = ['all', 'pending', 'confirmed', 'completed', 'rejected', 'cancelled'];
const UPCOMING = ['pending', 'confirmed'];
const LIMITS = { title: [3, 120], description: [10, 2000], reason: [5, 500] };
const PRIORITIES = ['low', 'normal', 'high'];
const REASONS = ['Feeling unwell', 'Clashes with an exam', 'My question got solved', 'Family emergency'];
const TRACK = ['Sent', 'Opened', 'Confirmed', 'Done'];
const label = s => s.charAt(0).toUpperCase() + s.slice(1);
const minutes = r => toMin(r.preferredEnd) - toMin(r.preferredStart);

// How far along the 4-step track a request is; "failedAt" = where a rejected/cancelled one stopped
function trackOf(r) {
  if (r.status === 'completed') return { reached: 3 };
  if (r.status === 'confirmed') return { reached: 2 };
  if (r.status === 'pending') return { reached: r.openedAt ? 1 : 0 };
  if (r.status === 'rejected') return { reached: 1, failedAt: 2 };
  const failedAt = r.queueEntryId ? 3 : r.openedAt ? 2 : 1; // cancelled
  return { reached: failedAt - 1, failedAt };
}

// ---------- Hand-drawn progress track (SVG line draws itself in) ----------
function ProgressTrack({ request }) {
  const { reached, failedAt } = trackOf(request);
  const xs = [38, 114, 190, 266]; // one dot centred in each quarter, so the labels below line up
  const end = failedAt ?? reached;
  return (
    <div className={`track${failedAt ? ' track-failed' : ''}`}>
      <svg viewBox="0 0 304 28" aria-hidden="true">
        <path d="M38 14 Q76 11 114 14 T190 14 T266 14" className="track-base" />
        {end > 0 && <path d={`M38 14 ${xs.slice(1, end + 1).map(x => `L${x} 14`).join(' ')}`} className="track-fill" pathLength="1" />}
        {xs.map((x, i) => {
          if (i === failedAt) return <g key={x} className="track-x"><circle cx={x} cy="14" r="9" /><path d={`M${x - 4} 10l8 8M${x + 4} 10l-8 8`} /></g>;
          if (i <= reached) return <g key={x} className="track-done"><circle cx={x} cy="14" r="9" /><path d={`M${x - 4} 14l3 3 5-6`} /></g>;
          return <circle key={x} cx={x} cy="14" r="7" className="track-todo" />;
        })}
      </svg>
      <ol className="track-labels">
        {TRACK.map((t, i) => <li key={t} className={i <= reached ? 'on' : i === failedAt ? 'off' : ''}>{i === failedAt ? label(request.status) : t}</li>)}
      </ol>
      <span className="sr-only">Progress: {failedAt ? `${request.status} after ${TRACK[reached]}` : TRACK[reached]}</span>
    </div>
  );
}

// ---------- Tear-off calendar date ----------
function DateBlock({ iso }) {
  const d = parseDate(iso);
  return (
    <div className="date-block" aria-hidden="true">
      <span className="date-month">{d.toLocaleDateString('en-GB', { month: 'short' })}</span>
      <span className="date-day">{d.getDate()}</span>
      <span className="date-week">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
    </div>
  );
}

// ---------- Status tabs with a sliding underline ----------
function StatusTabs({ value, counts, onChange }) {
  const wrap = useRef(null);
  const [bar, setBar] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const btn = wrap.current?.querySelector('[aria-pressed="true"]');
      if (btn) setBar({ left: btn.offsetLeft, width: btn.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [value, counts]);
  return (
    <div className="module-tabs status-tabs" role="group" aria-label="Filter by status" ref={wrap}>
      {TABS.map(t => (
        <button key={t} type="button" className={`module-tab${counts[t] ? '' : ' tab-empty'}`} aria-pressed={value === t} onClick={() => onChange(t)}>
          {t === 'all' ? 'All' : label(t)} <span className="tab-count">{counts[t]}</span>
        </button>
      ))}
      <span className="tab-ink" style={{ transform: `translateX(${bar.left}px)`, width: bar.width }} aria-hidden="true" />
    </div>
  );
}

// ---------- One request ----------
function RequestCard({ request: r, index, flashed, onEdit, onCancel }) {
  const [open, setOpen] = useState(false);
  const past = !UPCOMING.includes(r.status);
  let note = null;
  if (r.status === 'pending') note = r.openedAt
    ? <><Eye size={15} aria-hidden="true" /> The instructor has seen it</>
    : <><EyeOff size={15} aria-hidden="true" /> Not opened yet, you can still edit</>;
  if (r.status === 'confirmed') note = <><CheckCheck size={15} aria-hidden="true" /> Confirmed. Your QR ticket is in your email</>;
  if (r.status === 'completed') note = <><CheckCheck size={15} aria-hidden="true" /> Meeting done. Notes are in your history</>;

  return (
    <li className={`card req-card req-${r.status}${past ? ' req-past' : ''}${flashed ? ' req-flash' : ''}`} style={{ '--i': index }}>
      <DateBlock iso={r.slot.slotDate} />

      <div className="req-body">
        <div className="req-top">
          <span className={`badge badge-${r.status}`}>{label(r.status)}</span>
          {r.priority === 'high' && <span className="req-hot"><Flame size={14} aria-hidden="true" /> High priority</span>}
        </div>
        <h3 className="req-title">{r.title}</h3>
        <p className="req-meta">
          {r.slot.module?.name || 'General'} · {r.slot.instructor.fullName} ·{' '}
          <span className="nowrap"><CalendarClock size={14} aria-hidden="true" /> {r.preferredStart.slice(0, 5)} to {r.preferredEnd.slice(0, 5)}</span>
        </p>

        <ProgressTrack request={r} />

        {note && <p className="req-note">{note}</p>}
        {r.statusReason && (
          <blockquote className="req-reason">
            <span className="hand">{r.cancelledBy === 'student' ? 'you said' : r.status === 'rejected' ? 'instructor said' : 'reason'}</span>
            {r.statusReason}
          </blockquote>
        )}

        <button type="button" className="req-more" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <ChevronDown size={16} aria-hidden="true" /> {open ? 'Hide details' : 'Show details'}
        </button>
        <div className={`req-details${open ? ' open' : ''}`}>
          <div>
            <p className="req-desc">{r.description}</p>
            {r.faqSuggestion && <p className="req-faq"><Sparkles size={14} aria-hidden="true" /> You read an FAQ answer before booking: <em>{r.faqSuggestion}</em></p>}
          </div>
        </div>
      </div>

      <div className="req-actions">
        {r.status === 'confirmed' && (
          <Link to={`/student/queue/${r.id}`} className="btn btn-blue"><ListOrdered size={18} aria-hidden="true" /> My place in line</Link>
        )}
        {r.canEdit && (
          <button type="button" className="btn req-edit" onClick={() => onEdit(r)}><Pencil size={16} aria-hidden="true" /> Edit</button>
        )}
        {UPCOMING.includes(r.status) && (
          <button type="button" className="btn btn-ghost req-cancel" onClick={() => onCancel(r)}><Ban size={16} aria-hidden="true" /> Cancel</button>
        )}
      </div>
    </li>
  );
}

export default function MyRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [flash, setFlash] = useState({ type: '', text: '' });
  const [flashed, setFlashed] = useState([]); // ids whose status just changed
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const known = useRef(null); // id -> status from the previous load
  const [, tick] = useState(0);

  const notify = (type, text) => setFlash({ type, text, at: Date.now() });

  const load = useCallback(async ({ quiet } = {}) => {
    if (quiet) setRefreshing(true);
    try {
      const res = await getRequests({ limit: 100 });
      const list = res.data;
      // Spot requests whose status changed since the last load (e.g. the instructor confirmed one)
      if (known.current) {
        const changed = list.filter(r => known.current[r.id] && known.current[r.id] !== r.status);
        if (changed.length) {
          setFlashed(changed.map(r => r.id));
          notify('info', changed.length === 1 ? `"${changed[0].title}" is now ${changed[0].status}.` : `${changed.length} requests changed status.`);
          setTimeout(() => setFlashed([]), 2400);
        }
      }
      known.current = Object.fromEntries(list.map(r => [r.id, r.status]));
      setRequests(list);
      setUpdatedAt(Date.now());
    } catch (err) {
      if (!quiet) notify('error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // First load + every 20 s while the tab is visible + when the student comes back to the tab
  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load({ quiet: true }); }, REFRESH_MS);
    const onFocus = () => load({ quiet: true });
    window.addEventListener('focus', onFocus);
    const clock = setInterval(() => tick(t => t + 1), 10000); // keeps "updated 20 s ago" fresh
    return () => { clearInterval(id); clearInterval(clock); window.removeEventListener('focus', onFocus); };
  }, [load]);

  // Success / info messages fade after 5 s; errors stay
  useEffect(() => {
    if (!flash.type || flash.type === 'error') return undefined;
    const t = setTimeout(() => setFlash({ type: '', text: '' }), 5000);
    return () => clearTimeout(t);
  }, [flash]);

  const counts = useMemo(() => Object.fromEntries(TABS.map(t => [t, t === 'all' ? requests.length : requests.filter(r => r.status === t).length])), [requests]);
  const q = search.trim().toLowerCase();
  const visible = requests.filter(r => (tab === 'all' || r.status === tab)
    && (!q || `${r.title} ${r.slot.instructor.fullName} ${r.slot.module?.name || ''}`.toLowerCase().includes(q)));
  const byDate = (a, b) => `${a.slot.slotDate}${a.preferredStart}`.localeCompare(`${b.slot.slotDate}${b.preferredStart}`);
  const upcoming = visible.filter(r => UPCOMING.includes(r.status)).sort(byDate);
  const past = visible.filter(r => !UPCOMING.includes(r.status)).sort((a, b) => byDate(b, a));

  // ----- Edit -----
  const openEdit = r => {
    setEditing(r);
    setForm({ title: r.title, description: r.description, priority: r.priority, start: r.preferredStart.slice(0, 5), duration: minutes(r) });
    setErrors({});
  };
  const setField = field => e => { setForm({ ...form, [field]: e.target.value }); setErrors({ ...errors, [field]: '' }); };
  const saveEdit = async e => {
    e.preventDefault();
    const found = {};
    ['title', 'description'].forEach(f => {
      const len = form[f].trim().length;
      if (len < LIMITS[f][0]) found[f] = `Write at least ${LIMITS[f][0]} characters`;
      else if (len > LIMITS[f][1]) found[f] = `Keep it under ${LIMITS[f][1]} characters`;
    });
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    try {
      await updateRequest(editing.id, {
        title: form.title.trim(), description: form.description.trim(), priority: form.priority,
        preferredStart: form.start, preferredEnd: toTime(toMin(form.start) + form.duration),
      });
      notify('success', 'Request updated.');
      setEditing(null);
      load();
    } catch (err) {
      if (err.code === 'REQUEST_LOCKED') { setEditing(null); notify('error', err.message); load(); }
      else { setErrors(Object.fromEntries((err.details || []).map(d => [d.field, d.issue]))); notify('error', err.message); }
    } finally {
      setSaving(false);
    }
  };

  // ----- Cancel -----
  const openCancel = r => { setCancelling(r); setReason(''); setErrors({}); };
  const confirmCancel = async e => {
    e.preventDefault();
    const len = reason.trim().length;
    if (len < LIMITS.reason[0] || len > LIMITS.reason[1]) { setErrors({ reason: `Give a short reason (${LIMITS.reason[0]} to ${LIMITS.reason[1]} characters)` }); return; }
    setSaving(true);
    try {
      await setRequestStatus(cancelling.id, 'cancelled', reason.trim());
      notify('success', cancelling.status === 'confirmed' ? 'Meeting cancelled. The instructor has been notified.' : 'Request cancelled.');
      setCancelling(null);
      load();
    } catch (err) {
      notify('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const ago = updatedAt ? Math.round((Date.now() - updatedAt) / 1000) : null;
  let i = 0; // running index for the stagger animation

  return (
    <>
      <PageHeader eyebrow="Where things stand" title="My requests" description="Every request you sent, live. This page refreshes itself every 20 seconds.">
        <Link to="/student/slots" className="btn btn-primary"><Plus size={18} aria-hidden="true" /> New request</Link>
      </PageHeader>

      <div className="stack">
        <div key={flash.at} className={flash.type && flash.type !== 'error' ? 'flash-auto' : undefined}>
          <Alert type={flash.type || 'info'} onClose={() => setFlash({ type: '', text: '' })}>{flash.text}</Alert>
        </div>

        <div className="faq-toolbar">
          <div className="req-toolbar-top">
            <label className="search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Search requests</span>
              <input className="input" type="search" placeholder="Search by title, module or instructor" value={search} onChange={e => setSearch(e.target.value)} />
            </label>
            <button type="button" className={`refresh${refreshing ? ' spinning' : ''}`} onClick={() => load({ quiet: true })} aria-label="Refresh now">
              <RefreshCw size={15} aria-hidden="true" />
              {ago === null ? 'Loading' : ago < 5 ? 'Updated just now' : `Updated ${ago < 60 ? `${ago} s` : `${Math.round(ago / 60)} min`} ago`}
            </button>
          </div>
          <StatusTabs value={tab} counts={counts} onChange={setTab} />
        </div>

        {loading && (
          <ul className="req-list" aria-busy="true">{[0, 1, 2].map(n => <li key={n} className="card req-skeleton"><span /><span /><span /></li>)}</ul>
        )}

        {!loading && requests.length === 0 && (
          <div className="todo stack">
            <ThinkingStudent size={110} />
            <span className="hand">No requests yet</span>
            <p className="muted">Find an office-hour slot that fits your timetable and ask away.</p>
            <div><Link to="/student/slots" className="btn btn-primary">Browse slots</Link></div>
          </div>
        )}

        {!loading && requests.length > 0 && visible.length === 0 && (
          <p className="muted center">{q ? `Nothing matches "${search}".` : `No ${tab} requests.`}</p>
        )}

        {/* Upcoming always comes first; on the "All" tab it keeps its place even when empty, so Past never sits on top */}
        {(upcoming.length > 0 || (tab === 'all' && !q && past.length > 0)) && (
          <section aria-labelledby="g-upcoming">
            <h2 className="group-title" id="g-upcoming"><span className="scribble">Upcoming</span> <span className="group-count">{upcoming.length}</span></h2>
            {upcoming.length > 0 ? (
              <ul className="req-list">
                {upcoming.map(r => <RequestCard key={r.id} request={r} index={i++} flashed={flashed.includes(r.id)} onEdit={openEdit} onCancel={openCancel} />)}
              </ul>
            ) : (
              <p className="group-empty">Nothing coming up. <Link to="/student/slots">Find a slot</Link> when you need help.</p>
            )}
          </section>
        )}

        {/* Past always comes last */}
        {past.length > 0 && (
          <section aria-labelledby="g-past">
            <h2 className="group-title" id="g-past"><span className="scribble">Past</span> <span className="group-count">{past.length}</span></h2>
            <ul className="req-list">
              {past.map(r => <RequestCard key={r.id} request={r} index={i++} flashed={flashed.includes(r.id)} onEdit={openEdit} onCancel={openCancel} />)}
            </ul>
          </section>
        )}
      </div>

      {/* ---------- Edit sheet ---------- */}
      <Dialog open={!!editing} onClose={() => !saving && setEditing(null)} eyebrow="before they open it" title="Edit request">
        {editing && form && (
          <form className="form" onSubmit={saveEdit} noValidate>
            <CountedField id="er-title" label="Title" value={form.title} onChange={setField('title')} error={errors.title} max={LIMITS.title[1]} autoFocus />
            <CountedField id="er-description" label="Details" value={form.description} onChange={setField('description')} error={errors.description} max={LIMITS.description[1]} multiline />
            <TimeWindowPicker slot={editing.slot} start={form.start} duration={form.duration}
              onStart={start => setForm({ ...form, start, duration: fitDuration(editing.slot.endTime, start, form.duration) })}
              onDuration={d => setForm({ ...form, duration: d })} error={errors.preferredStart || errors.preferredEnd} />
            <fieldset className="plain-fieldset">
              <legend className="label">Priority</legend>
              <div className="segmented">
                {PRIORITIES.map(p => <button key={p} type="button" aria-pressed={form.priority === p} onClick={() => setForm({ ...form, priority: p })}>{label(p)}</button>)}
              </div>
            </fieldset>
            <div className="sheet-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)} disabled={saving}>Cancel</button>
              <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
            </div>
          </form>
        )}
      </Dialog>

      {/* ---------- Cancel sheet (reason required) ---------- */}
      <Dialog open={!!cancelling} onClose={() => !saving && setCancelling(null)} size="sm"
        eyebrow={cancelling?.status === 'confirmed' ? 'emergency cancel' : 'changed your mind?'} title="Cancel this request?">
        {cancelling && (
          <form className="form" onSubmit={confirmCancel} noValidate>
            <blockquote className="quote">{cancelling.title}</blockquote>
            {cancelling.status === 'confirmed' && <p className="muted">This meeting is already confirmed. {cancelling.slot.instructor.fullName} will be notified and your place in line is released.</p>}
            <div className="reason-chips" role="group" aria-label="Quick reasons">
              {REASONS.map(r => (
                <button key={r} type="button" className="reason-chip" aria-pressed={reason === r} onClick={() => { setReason(r); setErrors({}); }}>{r}</button>
              ))}
            </div>
            <CountedField id="cr-reason" label="Reason" value={reason} onChange={e => { setReason(e.target.value); setErrors({}); }}
              error={errors.reason} max={LIMITS.reason[1]} multiline autoFocus placeholder="Tell the instructor why, in a sentence" />
            <div className="sheet-actions">
              <button type="button" className="btn" onClick={() => setCancelling(null)} disabled={saving}><X size={16} aria-hidden="true" /> Keep it</button>
              <button className="btn btn-primary" disabled={saving}><Ban size={16} aria-hidden="true" /> {saving ? 'Cancelling...' : 'Cancel request'}</button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
