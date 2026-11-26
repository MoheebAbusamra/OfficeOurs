// [S3] History: Past meetings + notes for both roles (#4)
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Clock, Search, UserRound, X } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import Alert from '@/components/Alert';
import { useAuth } from '@/context/AuthContext';
import { getMeetings, saveMeetingNotes } from '@/api/queue';
import { clock, dateParts } from './helpers';
import './queue.css';

const LIMIT = 10;
const MAX_NOTES = 5000;
const EMPTY_FILTERS = { q: '', moduleId: '', from: '', to: '' };

// One meeting: header button opens both sides' notes; only my side is editable
function MeetingItem({ meeting, role, onSaved }) {
  const [open, setOpen] = useState(false);
  const mine = role === 'instructor' ? 'instructorNotes' : 'studentNotes';
  const theirs = role === 'instructor' ? 'studentNotes' : 'instructorNotes';
  const [draft, setDraft] = useState(meeting[mine] || '');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', text: '' });
  const [fieldError, setFieldError] = useState('');

  useEffect(() => { setDraft(meeting[mine] || ''); }, [meeting, mine]);

  const date = meeting.slotDate || meeting.startedAt?.slice(0, 10);
  const parts = date ? dateParts(date) : null;
  const other = role === 'instructor' ? meeting.student : meeting.instructor;
  const changed = draft.trim() !== (meeting[mine] || '');
  const id = `meeting-${meeting.id}`;

  async function save(e) {
    e.preventDefault();
    if (draft.length > MAX_NOTES) {
      setFieldError(`Notes must be ${MAX_NOTES} characters or less.`);
      return;
    }
    setSaving(true);
    setFieldError('');
    setStatus({ type: '', text: '' });
    try {
      const res = await saveMeetingNotes(meeting.id, draft);
      onSaved(res.data);
      setStatus({ type: 'success', text: 'Notes saved.' });
    } catch (err) {
      const detail = err.details?.find(d => d.field === 'notes');
      if (detail) setFieldError(err.message);
      else setStatus({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className={`card h-item${open ? ' is-open' : ''}`}>
      <button type="button" className="h-item-head" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-controls={id}>
        {parts && (
          <span className="h-date" aria-hidden="true">
            <span>{parts.short}</span>
            <strong>{parts.num}</strong>
            <span>{parts.month}</span>
          </span>
        )}
        <span className="h-item-main">
          <strong className="h-item-title">{meeting.title}</strong>
          <span className="q-meta">
            <span><UserRound size={16} aria-hidden="true" /> {other?.fullName}</span>
            {meeting.module && <span className="badge">{meeting.module.code}</span>}
            <span><Clock size={16} aria-hidden="true" /> {clock(meeting.startedAt)}{meeting.durationMinutes != null ? `, ${meeting.durationMinutes} min` : ''}</span>
            {meeting[mine] ? <span className="badge badge-completed">My notes</span> : <span className="badge badge-pending">No notes yet</span>}
          </span>
        </span>
        <span className="h-item-chevron" aria-hidden="true"><ChevronDown size={22} /></span>
      </button>

      {open && (
        <form id={id} className="h-notes" onSubmit={save}>
          <div className="h-note">
            <label className="label" htmlFor={`${id}-mine`}>My notes</label>
            <textarea id={`${id}-mine`} className="textarea" rows={5} value={draft}
              onChange={e => { setDraft(e.target.value); setFieldError(''); }}
              placeholder={role === 'instructor' ? 'What did you advise? Any follow-up?' : 'What did you learn? What do you need to do next?'}
              aria-invalid={fieldError ? 'true' : undefined} aria-describedby={`${id}-count${fieldError ? ` ${id}-err` : ''}`} />
            {fieldError && <span id={`${id}-err`} className="field-error">{fieldError}</span>}
            <div className="h-note-foot">
              <span id={`${id}-count`} className="hint">{draft.length}/{MAX_NOTES}</span>
              <button type="submit" className="btn btn-primary" disabled={saving || !changed}>{saving ? 'Saving...' : 'Save notes'}</button>
            </div>
            <Alert type={status.type} onClose={() => setStatus({ type: '', text: '' })}>{status.text}</Alert>
          </div>
          <div className="h-note">
            <span className="label">{role === 'instructor' ? `${meeting.student?.fullName}'s notes` : `${meeting.instructor?.fullName}'s notes`}</span>
            <div className={`h-note-read${meeting[theirs] ? '' : ' is-empty'}`}>{meeting[theirs] || 'No notes yet.'}</div>
          </div>
        </form>
      )}
    </article>
  );
}

export default function History() {
  const { user } = useAuth();
  const [form, setForm] = useState(EMPTY_FILTERS);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState({ data: [], meta: { total: 0, page: 1, limit: LIMIT } });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    getMeetings({ ...filters, page, limit: LIMIT })
      .then(res => { setResult(res); setFieldErrors({}); })
      .catch(err => {
        setError(err.message);
        setFieldErrors(Object.fromEntries((err.details || []).map(d => [d.field, d.issue])));
      })
      .finally(() => setLoading(false));
  }, [filters, page]);

  useEffect(() => { load(); }, [load]);

  function apply(e) {
    e.preventDefault();
    if (form.from && form.to && form.from > form.to) {
      setFieldErrors({ to: 'must be on or after the "from" date' });
      return;
    }
    setFieldErrors({});
    setPage(1);
    setFilters({ ...form, q: form.q.trim() });
  }

  function clear() {
    setForm(EMPTY_FILTERS);
    setFieldErrors({});
    setPage(1);
    setFilters(EMPTY_FILTERS);
  }

  const replace = updated => setResult(r => ({ ...r, data: r.data.map(m => (m.id === updated.id ? updated : m)) }));
  const total = result.meta?.total || 0;
  const pages = Math.max(1, Math.ceil(total / LIMIT));
  const filtered = Object.values(filters).some(Boolean);
  const set = key => e => setForm(f => ({ ...f, [key]: e.target.value }));

  return (
    <>
      <PageHeader eyebrow="Paper trail" title="Meeting history" description="Every past meeting with notes from both sides. Search by title, notes, module or date." />

      <div className="stack">
        <form className="h-filters" onSubmit={apply} role="search">
          <div className="field h-search">
            <label className="label" htmlFor="h-q">Search</label>
            <input id="h-q" className="input" value={form.q} onChange={set('q')} placeholder="Title, notes or name" maxLength={100} />
          </div>
          <div className="field">
            <label className="label" htmlFor="h-module">Module</label>
            <select id="h-module" className="select" value={form.moduleId} onChange={set('moduleId')}>
              <option value="">All modules</option>
              {(user.modules || []).map(m => <option key={m.id} value={m.id}>{m.code} {m.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="h-from">From</label>
            <input id="h-from" type="date" className="input" value={form.from} onChange={set('from')}
              aria-invalid={fieldErrors.from ? 'true' : undefined} aria-describedby={fieldErrors.from ? 'h-from-err' : undefined} />
            {fieldErrors.from && <span id="h-from-err" className="field-error">From {fieldErrors.from}</span>}
          </div>
          <div className="field">
            <label className="label" htmlFor="h-to">To</label>
            <input id="h-to" type="date" className="input" value={form.to} onChange={set('to')}
              aria-invalid={fieldErrors.to ? 'true' : undefined} aria-describedby={fieldErrors.to ? 'h-to-err' : undefined} />
            {fieldErrors.to && <span id="h-to-err" className="field-error">To {fieldErrors.to}</span>}
          </div>
          <div className="h-filter-actions">
            <button type="submit" className="btn btn-primary"><Search size={18} aria-hidden="true" /> Search</button>
            {filtered && (
              <button type="button" className="btn btn-ghost icon-btn" onClick={clear} aria-label="Clear filters" title="Clear filters">
                <X size={18} aria-hidden="true" />
              </button>
            )}
          </div>
        </form>

        <Alert type="error" onClose={() => setError('')}>{error}</Alert>

        <p className="muted" aria-live="polite">
          {loading ? 'Loading meetings...' : `${total} meeting${total === 1 ? '' : 's'}${filtered ? ' match your search' : ''}`}
        </p>

        {!loading && !error && result.data.length === 0 && (
          <div className="todo stack">
            <span className="hand">{filtered ? 'Nothing matches that search' : 'No meetings yet'}</span>
            <p className="muted">{filtered ? 'Try other words or clear the filters.' : 'Finished meetings show up here with notes from both sides.'}</p>
          </div>
        )}

        <div className="h-list">
          {result.data.map(m => <MeetingItem key={m.id} meeting={m} role={user.role} onSaved={replace} />)}
        </div>

        {pages > 1 && (
          <nav className="h-pager" aria-label="Pages">
            <button type="button" className="btn btn-ghost" onClick={() => setPage(p => p - 1)} disabled={page <= 1 || loading}>Previous</button>
            <span>Page {page} of {pages}</span>
            <button type="button" className="btn btn-ghost" onClick={() => setPage(p => p + 1)} disabled={page >= pages || loading}>Next</button>
          </nav>
        )}
      </div>
    </>
  );
}
