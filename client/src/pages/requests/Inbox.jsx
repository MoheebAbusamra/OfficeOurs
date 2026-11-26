// [S2] Inbox: Instructor reads requests grouped by slot and confirms or rejects them, with keyboard shortcuts (#9)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, Ban, CalendarDays, Check, Clock, Flame, Keyboard, ListOrdered, Lock, MailOpen, MapPin, RefreshCw, Search, Sparkles, X,
} from 'lucide-react';
import { getRequest, getRequests, setRequestStatus } from '@/api/requests';
import { getSlotQueue } from '@/api/queue';
import PageHeader from '@/components/PageHeader';
import Alert from '@/components/Alert';
import Dialog from './Dialog';
import CountedField from './CountedField';
import StatusTabs from './StatusTabs';
import InboxZero from './InboxZero';
import { prettyDate, todayIso, toMin } from './time';
import './requests.css';

const REFRESH_MS = 20000;
const TABS = ['pending', 'confirmed', 'rejected', 'cancelled', 'completed', 'all'];
const SORTS = [{ value: 'priority', label: 'Priority' }, { value: 'time', label: 'Requested time' }, { value: 'newest', label: 'Newest' }];
const RANK = { high: 0, normal: 1, low: 2 };
const REASON_LIMITS = [5, 500];
const QUICK = {
  reject: ['Answered in the FAQ', 'Please email me instead', 'Wrong module for this slot', 'Outside office-hours scope'],
  cancel: ['I am unwell', 'Clashes with a faculty meeting', 'Room is unavailable', 'Family emergency'],
};
const STAMP = { confirmed: 'Confirmed', rejected: 'Rejected', cancelled: 'Cancelled', completed: 'Done' };
const initials = name => name.split(' ').filter(w => !w.endsWith('.')).map(w => w[0]).slice(0, 2).join('');
const label = s => s.charAt(0).toUpperCase() + s.slice(1);
const timeAgo = iso => {
  const m = Math.round((Date.now() - new Date(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
};
const isTyping = el => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el?.tagName) || el?.isContentEditable;

// ---------- Capacity as little seats (falls back to a bar for big slots) ----------
function Seats({ slot }) {
  const { capacity, confirmedCount } = slot;
  return (
    <span className="seats" title={`${confirmedCount} of ${capacity} confirmed`}>
      {capacity <= 12
        ? Array.from({ length: capacity }, (_, i) => <span key={i} className={`seat${i < confirmedCount ? ' taken' : ''}`} />)
        : <span className="seat-bar"><span style={{ width: `${(confirmedCount / capacity) * 100}%` }} /></span>}
      <span className="seats-text">{confirmedCount >= capacity ? 'Full' : `${confirmedCount} of ${capacity}`}</span>
    </span>
  );
}

// ---------- One row in the list ----------
function Row({ r, selected, glow, showStatus, onSelect }) {
  return (
    <li>
      <button type="button" id={`req-row-${r.id}`} className={`inbox-row${selected ? ' selected' : ''}${glow ? ' glow' : ''}${r.openedAt ? '' : ' unread'}`}
        aria-current={selected ? 'true' : undefined} onClick={() => onSelect(r)}>
        <span className="unread-dot" aria-label={r.openedAt ? undefined : 'Not opened yet'} />
        <span className="avatar" aria-hidden="true">{initials(r.student.fullName)}</span>
        <span className="row-main">
          <span className="row-top">
            <strong>{r.student.fullName}</strong>
            <span className="row-time">{r.preferredStart.slice(0, 5)} to {r.preferredEnd.slice(0, 5)}</span>
          </span>
          <span className="row-title">{r.title}</span>
        </span>
        <span className="row-side">
          {r.priority === 'high' && <Flame size={16} className="row-hot" aria-label="High priority" />}
          {showStatus && <span className={`badge badge-${r.status}`}>{label(r.status)}</span>}
          <span className="row-ago">{timeAgo(r.createdAt)}</span>
        </span>
      </button>
    </li>
  );
}

export default function Inbox() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState('pending');
  const [search, setSearch] = useState('');
  const [unopenedOnly, setUnopenedOnly] = useState(false);
  const [priority, setPriority] = useState('any');
  const [sort, setSort] = useState('priority');
  const [selectedId, setSelectedId] = useState(null);
  const [flash, setFlash] = useState({ type: '', text: '' });
  const [glow, setGlow] = useState([]);
  const [deciding, setDeciding] = useState(null); // { mode: 'reject' | 'cancel', request }
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false);
  const [stamp, setStamp] = useState(null); // { id, kind, at } for the stamp animation
  const [showKeys, setShowKeys] = useState(false);
  const known = useRef(null);
  const detailRef = useRef(null);

  const notify = (type, text) => setFlash({ type, text, at: Date.now() });

  const load = useCallback(async ({ quiet } = {}) => {
    if (quiet) setRefreshing(true);
    try {
      const res = await getRequests({ limit: 100 });
      if (known.current) { // new requests since the last load glow for a moment
        const fresh = res.data.filter(r => !known.current.has(r.id));
        if (fresh.length) {
          setGlow(fresh.map(r => r.id));
          notify('info', fresh.length === 1 ? `New request from ${fresh[0].student.fullName}.` : `${fresh.length} new requests.`);
          setTimeout(() => setGlow([]), 2600);
        }
      }
      known.current = new Set(res.data.map(r => r.id));
      setRequests(res.data);
    } catch (err) {
      if (!quiet) notify('error', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load({ quiet: true }); }, REFRESH_MS);
    const onFocus = () => load({ quiet: true });
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); };
  }, [load]);

  useEffect(() => {
    if (!flash.type || flash.type === 'error') return undefined;
    const t = setTimeout(() => setFlash({ type: '', text: '' }), 5000);
    return () => clearTimeout(t);
  }, [flash]);

  // ----- Filtering, grouping by slot, sorting -----
  const counts = useMemo(() => Object.fromEntries(TABS.map(t => [t, t === 'all' ? requests.length : requests.filter(r => r.status === t).length])), [requests]);
  const q = search.trim().toLowerCase();
  const groups = useMemo(() => {
    const visible = requests.filter(r => (tab === 'all' || r.status === tab)
      && (!unopenedOnly || !r.openedAt)
      && (priority === 'any' || r.priority === priority)
      && (!q || `${r.student.fullName} ${r.title}`.toLowerCase().includes(q)));
    const bySlot = new Map();
    visible.forEach(r => {
      if (!bySlot.has(r.slot.id)) bySlot.set(r.slot.id, { slot: r.slot, items: [] });
      bySlot.get(r.slot.id).items.push(r);
    });
    const order = {
      priority: (a, b) => RANK[a.priority] - RANK[b.priority] || toMin(a.preferredStart) - toMin(b.preferredStart),
      time: (a, b) => toMin(a.preferredStart) - toMin(b.preferredStart),
      newest: (a, b) => b.createdAt.localeCompare(a.createdAt),
    }[sort];
    const today = todayIso();
    const key = g => `${g.slot.slotDate}${g.slot.startTime}`;
    return [...bySlot.values()]
      .map(g => ({ ...g, items: g.items.sort(order) }))
      // upcoming slots first (soonest on top), then past slots (most recent first)
      .sort((a, b) => {
        const pa = a.slot.slotDate < today, pb = b.slot.slotDate < today;
        if (pa !== pb) return pa ? 1 : -1;
        return pa ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b));
      });
  }, [requests, tab, unopenedOnly, priority, q, sort]);
  const flat = useMemo(() => groups.flatMap(g => g.items), [groups]);
  const selected = requests.find(r => r.id === selectedId) || null;
  const selectedFull = selected ? selected.slot.confirmedCount >= selected.slot.capacity : false;

  // ----- Open a request (the first open marks it read and locks the student's edits) -----
  const select = useCallback(r => {
    setSelectedId(r.id);
    document.getElementById(`req-row-${r.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (!r.openedAt) {
      getRequest(r.id)
        .then(res => setRequests(list => list.map(x => (x.id === r.id ? res.data : x))))
        .catch(() => {});
    }
  }, []);

  useEffect(() => { if (selected) detailRef.current?.scrollTo({ top: 0 }); }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----- Confirm (one click) -----
  const confirm = useCallback(async r => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await setRequestStatus(r.id, 'confirmed');
      setRequests(list => list.map(x => (x.id === r.id ? res.data : x))); // instant badge, stamp and seat count
      // S3 has just queued the student: read their position from the slot's queue
      const position = await getSlotQueue(r.slot.id)
        .then(res => res.data.find(e => e.requestId === r.id)?.position)
        .catch(() => null);
      setStamp({ id: r.id, kind: 'confirmed', at: Date.now() });
      notify('success', `Confirmed. ${r.student.fullName.split(' ')[0]} is ${position ? `#${position} ` : ''}in the queue and gets a QR ticket by email.`);
      load({ quiet: true });
    } catch (err) {
      notify('error', err.code === 'SLOT_FULL' ? 'This slot is already full.' : err.message);
      load({ quiet: true });
    } finally {
      setBusy(false);
    }
  }, [busy, load]);

  // ----- Reject / emergency cancel (reason required) -----
  const openDecision = useCallback((mode, r) => { setDeciding({ mode, request: r }); setReason(''); setReasonError(''); }, []);
  const submitDecision = async e => {
    e.preventDefault();
    const len = reason.trim().length;
    if (len < REASON_LIMITS[0] || len > REASON_LIMITS[1]) { setReasonError(`Give a short reason (${REASON_LIMITS[0]} to ${REASON_LIMITS[1]} characters)`); return; }
    const { mode, request: r } = deciding;
    const status = mode === 'reject' ? 'rejected' : 'cancelled';
    setBusy(true);
    try {
      const res = await setRequestStatus(r.id, status, reason.trim());
      setRequests(list => list.map(x => (x.id === r.id ? res.data : x)));
      setStamp({ id: r.id, kind: status, at: Date.now() });
      notify('success', mode === 'reject' ? `Rejected. ${r.student.fullName.split(' ')[0]} has been notified.` : 'Meeting cancelled. The student has been notified and their place released.');
      setDeciding(null);
      load({ quiet: true });
    } catch (err) {
      notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  // ----- Keyboard: up/down (or j/k) move, C confirms, R rejects, ? shows the list -----
  useEffect(() => {
    const onKey = e => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('dialog[open]')) return;
      const i = flat.findIndex(r => r.id === selectedId);
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); if (flat.length) select(flat[Math.min(i + 1, flat.length - 1)]); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); if (flat.length) select(flat[Math.max(i - 1, 0)]); }
      else if (e.key.toLowerCase() === 'c' && selected?.status === 'pending' && !selectedFull) confirm(selected);
      else if (e.key.toLowerCase() === 'r' && selected?.status === 'pending') openDecision('reject', selected);
      else if (e.key === '?') setShowKeys(s => !s);
      else if (e.key === 'Escape') { setShowKeys(false); setSelectedId(null); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flat, selectedId, selected, selectedFull, select, confirm, openDecision]);

  const emptyPending = !loading && tab === 'pending' && counts.pending === 0 && !selected; // keep the detail (and its stamp) open until closed
  let row = 0;

  return (
    <>
      <PageHeader eyebrow="Requests waiting for you" title="Inbox"
        description="Grouped by slot, so you always see how full each one is before you confirm." />

      <div className="stack">
        <div key={flash.at} className={flash.type && flash.type !== 'error' ? 'flash-auto' : undefined}>
          <Alert type={flash.type || 'info'} onClose={() => setFlash({ type: '', text: '' })}>{flash.text}</Alert>
        </div>

        <div className="faq-toolbar">
          <div className="req-toolbar-top">
            <label className="search">
              <Search size={18} aria-hidden="true" />
              <span className="sr-only">Search requests</span>
              <input className="input" type="search" placeholder="Search by student or title" value={search} onChange={e => setSearch(e.target.value)} />
            </label>
            <div className="inbox-tools">
              <label className="switch">
                <input type="checkbox" checked={unopenedOnly} onChange={e => setUnopenedOnly(e.target.checked)} />
                <span className="switch-track" aria-hidden="true"><span /></span>
                Unopened only
              </label>
              <div className="segmented segmented-sm" role="group" aria-label="Priority">
                {['any', 'high', 'normal', 'low'].map(p => (
                  <button key={p} type="button" aria-pressed={priority === p} onClick={() => setPriority(p)}>{p === 'any' ? 'Any' : label(p)}</button>
                ))}
              </div>
              <label className="sort">
                <span className="sr-only">Sort within each slot</span>
                <select className="select" value={sort} onChange={e => setSort(e.target.value)}>
                  {SORTS.map(s => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
                </select>
              </label>
              <button type="button" className={`refresh${refreshing ? ' spinning' : ''}`} onClick={() => load({ quiet: true })} aria-label="Refresh now">
                <RefreshCw size={15} aria-hidden="true" /> Refresh
              </button>
              <button type="button" className="refresh kbd-toggle" onClick={() => setShowKeys(s => !s)} aria-expanded={showKeys}>
                <Keyboard size={15} aria-hidden="true" /> Shortcuts
              </button>
            </div>
          </div>
          {showKeys && (
            <div className="shortcuts" role="note">
              <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
              <span><kbd>C</kbd> confirm</span>
              <span><kbd>R</kbd> reject</span>
              <span><kbd>Esc</kbd> close</span>
              <span><kbd>?</kbd> show or hide this</span>
            </div>
          )}
          <StatusTabs tabs={TABS} value={tab} counts={counts} onChange={t => { setTab(t); setSelectedId(null); }} />
        </div>

        {emptyPending ? (
          <div className="todo stack inbox-zero-wrap">
            <InboxZero />
            <span className="hand">Inbox zero</span>
            <p className="muted">Nothing waiting for you. Enjoy the coffee.</p>
          </div>
        ) : (
          <div className={`inbox${selected ? ' has-selection' : ''}`}>
            {/* ---------- List ---------- */}
            <div className="inbox-list" aria-busy={loading}>
              {loading && [0, 1, 2, 3].map(n => <div key={n} className="inbox-skeleton"><span /><span /></div>)}
              {!loading && groups.length === 0 && (tab === 'pending' && !q
                ? <div className="list-zero"><InboxZero size={90} /><span className="hand">Inbox zero</span></div>
                : <p className="muted center">{q ? `Nothing matches "${search}".` : 'No requests here.'}</p>)}
              {groups.map(g => (
                <section key={g.slot.id} className="slot-group" style={{ '--i': row++ }}>
                  <header className="slot-head">
                    <div className="slot-when">
                      <strong><CalendarDays size={15} aria-hidden="true" /> {prettyDate(g.slot.slotDate)}</strong>
                      <span><Clock size={14} aria-hidden="true" /> {g.slot.startTime.slice(0, 5)} to {g.slot.endTime.slice(0, 5)}</span>
                      <span><MapPin size={14} aria-hidden="true" /> {g.slot.location}</span>
                    </div>
                    <div className="slot-cap">
                      <Seats slot={g.slot} />
                      {g.slot.confirmedCount > 0 && (
                        <Link to={`/instructor/queue/${g.slot.id}`} className="slot-queue"><ListOrdered size={14} aria-hidden="true" /> Queue</Link>
                      )}
                    </div>
                    {g.slot.module && <span className="slot-module">{g.slot.module.name}</span>}
                  </header>
                  <ul className="inbox-rows">
                    {g.items.map(r => (
                      <Row key={r.id} r={r} selected={r.id === selectedId} glow={glow.includes(r.id)} showStatus={tab !== 'pending'} onSelect={select} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {/* ---------- Detail ---------- */}
            <aside className="card inbox-detail" ref={detailRef} aria-live="polite">
              {!selected && (
                <div className="detail-empty">
                  <MailOpen size={44} aria-hidden="true" />
                  <p className="hand">Pick a request to read it</p>
                  <p className="muted">Or press <kbd>↓</kbd> to start from the top.</p>
                </div>
              )}

              {selected && (
                <div key={selected.id} className="detail-body">
                  <button type="button" className="btn btn-ghost detail-back" onClick={() => setSelectedId(null)}>
                    <ArrowLeft size={18} aria-hidden="true" /> All requests
                  </button>

                  {STAMP[selected.status] && (
                    <div key={stamp?.id === selected.id ? stamp.at : 'static'}
                      className={`stamp stamp-${selected.status}${stamp?.id === selected.id ? ' stamp-in' : ''}`} aria-hidden="true">
                      {STAMP[selected.status]}
                    </div>
                  )}

                  <div className="detail-who">
                    <span className="avatar avatar-lg" aria-hidden="true">{initials(selected.student.fullName)}</span>
                    <div>
                      <strong>{selected.student.fullName}</strong>
                      <span className="muted"> · {selected.student.universityId}</span>
                      <div className="detail-badges">
                        <span className={`badge badge-${selected.status}`}>{label(selected.status)}</span>
                        {selected.priority === 'high' && <span className="req-hot"><Flame size={14} aria-hidden="true" /> High priority</span>}
                      </div>
                    </div>
                  </div>

                  <h2 className="detail-title">{selected.title}</h2>

                  <dl className="facts">
                    <div><dt>Slot</dt><dd>{prettyDate(selected.slot.slotDate)}, {selected.slot.startTime.slice(0, 5)} to {selected.slot.endTime.slice(0, 5)}</dd></div>
                    <div><dt>Wants</dt><dd>{selected.preferredStart.slice(0, 5)} to {selected.preferredEnd.slice(0, 5)} ({toMin(selected.preferredEnd) - toMin(selected.preferredStart)} min)</dd></div>
                    <div><dt>Room</dt><dd>{selected.slot.location}</dd></div>
                    <div><dt>Sent</dt><dd>{timeAgo(selected.createdAt)}</dd></div>
                  </dl>

                  <p className="detail-desc">{selected.description}</p>

                  {selected.faqSuggestion && (
                    <div className="detail-faq">
                      <span><Sparkles size={15} aria-hidden="true" /> Read this FAQ answer before booking</span>
                      <p>{selected.faqSuggestion}</p>
                    </div>
                  )}

                  {selected.statusReason && (
                    <blockquote className="req-reason">
                      <span className="hand">{selected.cancelledBy === 'student' ? 'student said' : 'you said'}</span>
                      {selected.statusReason}
                    </blockquote>
                  )}

                  <div className="detail-actions">
                    {selected.status === 'pending' && (
                      <>
                        <button type="button" className="btn btn-primary" onClick={() => confirm(selected)} disabled={busy || selectedFull}>
                          <Check size={18} aria-hidden="true" /> {selectedFull ? 'Slot full' : busy ? 'Confirming...' : 'Confirm'}
                        </button>
                        <button type="button" className="btn" onClick={() => openDecision('reject', selected)} disabled={busy}>
                          <X size={18} aria-hidden="true" /> Reject
                        </button>
                      </>
                    )}
                    {selected.status === 'confirmed' && (
                      <>
                        <Link to={`/instructor/queue/${selected.slot.id}`} className="btn btn-blue"><ListOrdered size={18} aria-hidden="true" /> Open queue</Link>
                        <button type="button" className="btn btn-ghost req-cancel" onClick={() => openDecision('cancel', selected)} disabled={busy}>
                          <Ban size={16} aria-hidden="true" /> Cancel meeting
                        </button>
                      </>
                    )}
                  </div>
                  <p className="detail-hint">
                    <Lock size={13} aria-hidden="true" /> Opening a request locks the student's edits.
                    {selected.status === 'pending' && <> Press <kbd>C</kbd> to confirm or <kbd>R</kbd> to reject.</>}
                  </p>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>

      {/* ---------- Reject / cancel sheet ---------- */}
      <Dialog open={!!deciding} onClose={() => !busy && setDeciding(null)} size="sm"
        eyebrow={deciding?.mode === 'cancel' ? 'emergency cancel' : 'not this time'}
        title={deciding?.mode === 'cancel' ? 'Cancel this meeting?' : 'Reject this request?'}>
        {deciding && (
          <form className="form" onSubmit={submitDecision} noValidate>
            <blockquote className="quote">{deciding.request.student.fullName}: {deciding.request.title}</blockquote>
            <div className="reason-chips" role="group" aria-label="Quick reasons">
              {QUICK[deciding.mode].map(t => (
                <button key={t} type="button" className="reason-chip" aria-pressed={reason === t} onClick={() => { setReason(t); setReasonError(''); }}>{t}</button>
              ))}
            </div>
            <CountedField id="ib-reason" label="Reason (the student sees this)" value={reason} onChange={e => { setReason(e.target.value); setReasonError(''); }}
              error={reasonError} max={REASON_LIMITS[1]} multiline autoFocus placeholder="One or two sentences" />
            <div className="sheet-actions">
              <button type="button" className="btn" onClick={() => setDeciding(null)} disabled={busy}>Keep it</button>
              <button className="btn btn-primary" disabled={busy}>
                {deciding.mode === 'cancel' ? <><Ban size={16} aria-hidden="true" /> Cancel meeting</> : <><X size={16} aria-hidden="true" /> Reject</>}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
