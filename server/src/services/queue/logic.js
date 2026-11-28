// Business rules: add to queue on confirm, position count, call next/skip/done, done -> history record, QR check-in
import { AppError, conflict, forbidden, notFound } from '../../shared/errors.js';
import * as db from './db.js';
import { notify } from './notify.js';
import { makeQrPng } from './qr.js';
import { storeQrImage } from './storage.js';
import { sendWithBrevo } from './brevo.js';
import { copyToSes } from './ses.js';
import { buildTicketEmail } from './email.js';
import { isUuid } from './validation.js';

const ACTIVE = ['waiting', 'in_meeting'];
const DEFAULT_MEETING_MINUTES = 15;

// ---------------- Small helpers ----------------
const nowIso = () => new Date().toISOString();
// "Today" in the university's time zone (Cairo), as YYYY-MM-DD, so the meeting-day rule matches the campus clock
export const todayLocal = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: process.env.APP_TIMEZONE || 'Africa/Cairo' }).format(date);
const hhmm = t => (t ? String(t).slice(0, 5) : null);
const person = p => (p ? { universityId: p.university_id, fullName: p.full_name } : null);

// ---------------- Queue order ----------------
// The line follows the booked start times (16:00 before 16:20), not the order the instructor clicked "confirm".
// Same start time (older data) -> whoever was confirmed first. The number shown on screens is the place in this order.
const startOf = e => String(e.request?.preferred_start || '');
const byStartTime = (a, b) => startOf(a).localeCompare(startOf(b)) || a.position - b.position;

// All entries of a slot, in queue order
async function orderedEntries(slotId) {
  return [...(await db.listSlotEntries(slotId))].sort(byStartTime);
}

// Place in line (1 = first) and how many are still in front of a waiting student:
// whoever is in a meeting right now, plus everyone waiting with an earlier time
function placeIn(entries, entry) {
  const index = entries.findIndex(e => e.id === entry.id);
  const ahead = entry.status !== 'waiting' ? 0 : entries.filter((e, i) => e.id !== entry.id
    && (e.status === 'in_meeting' || (e.status === 'waiting' && i < index))).length;
  return { place: index + 1, ahead };
}

// DB row -> API QueueEntry (instructor view, has the student's name). place = the place in the time-ordered line
export function entryOut(e, place = e?.position) {
  if (!e) return null;
  return {
    id: e.id,
    requestId: e.request_id,
    position: place,
    status: e.status,
    student: person(e.request?.student),
    title: e.request?.title ?? null,
    preferredStart: hhmm(e.request?.preferred_start),
    preferredEnd: hhmm(e.request?.preferred_end),
    checkedInAt: e.checked_in_at,
    calledAt: e.called_at,
    finishedAt: e.finished_at,
  };
}

const slotOut = s => ({
  id: s.id,
  slotDate: s.slot_date,
  startTime: hhmm(s.start_time),
  endTime: hhmm(s.end_time),
  location: s.location,
  status: s.status,
  instructor: person(s.instructor),
  module: s.module || null,
});

// DB row -> API Meeting
export function meetingOut(m) {
  const minutes = m.ended_at ? Math.max(0, Math.round((new Date(m.ended_at) - new Date(m.started_at)) / 60000)) : null;
  return {
    id: m.id,
    requestId: m.request_id,
    title: m.request?.title ?? null,
    student: person(m.student),
    instructor: person(m.instructor),
    module: m.slot?.module || null,
    slotDate: m.slot?.slot_date ?? null,
    startedAt: m.started_at,
    endedAt: m.ended_at,
    durationMinutes: minutes,
    instructorNotes: m.instructor_notes,
    studentNotes: m.student_notes,
  };
}

// Slot must exist and belong to this instructor
async function ownedSlot(user, slotId) {
  const slot = await db.getSlot(slotId);
  if (!slot) throw notFound('Slot not found');
  if (slot.instructor_id !== user.universityId) throw forbidden('This is not your slot');
  return slot;
}

// Average length of the instructor's recent meetings, used for the wait estimate (5 to 60 minutes)
async function averageMeetingMinutes(instructorId) {
  const rows = await db.recentMeetingTimes(instructorId);
  const lengths = rows.map(r => (new Date(r.ended_at) - new Date(r.started_at)) / 60000).filter(n => n > 0);
  if (!lengths.length) return DEFAULT_MEETING_MINUTES;
  const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  return Math.min(60, Math.max(5, Math.round(avg)));
}

// in_meeting -> done: records the meeting in history, completes the request and tells the student
async function finishEntry(entry, slot) {
  const endedAt = nowIso();
  const done = await db.updateEntryIfStatus(entry.id, ['in_meeting'], { status: 'done', finished_at: endedAt });
  if (!done) throw conflict('QUEUE_CHANGED', 'The queue changed in the meantime. Refresh and try again.');

  await db.insertMeeting({
    request_id: entry.request_id,
    slot_id: entry.slot_id,
    student_id: entry.request.student_id,
    instructor_id: slot.instructor_id,
    started_at: entry.called_at || endedAt,
    ended_at: endedAt,
  });
  await db.setRequestCompleted(entry.request_id);
  await notify(entry.request.student_id, 'meeting_completed',
    `Your meeting "${entry.request.title}" is finished. You can add your notes in History.`, '/student/history');
  return done;
}

// ---------------- #7 Position in queue (student) ----------------
export async function getPosition(user, requestId) {
  const entry = await db.getEntryByRequest(requestId);
  if (!entry) throw notFound('This request is not in a queue yet');
  if (entry.request?.student_id !== user.universityId) throw forbidden('This is not your request');

  const slot = await db.getSlot(entry.slot_id);
  const { place, ahead } = placeIn(await orderedEntries(entry.slot_id), entry);
  const perMeeting = ahead ? await averageMeetingMinutes(slot.instructor_id) : DEFAULT_MEETING_MINUTES;

  // Only counts, never other students' names
  return {
    status: entry.status,
    ahead,
    estimatedWaitMinutes: ahead * perMeeting,
    checkedIn: Boolean(entry.checked_in_at),
    position: place,
    title: entry.request.title,
    calledAt: entry.called_at,
    slot: slot ? slotOut(slot) : null,
  };
}

// ---------------- #11 Instructor queue ----------------
export async function getSlotQueue(user, slotId) {
  const slot = await ownedSlot(user, slotId);
  const entries = await orderedEntries(slotId);
  return { entries: entries.map((e, i) => entryOut(e, i + 1)), slot: { ...slotOut(slot), isToday: slot.slot_date === todayLocal() } };
}

// Finish the current meeting (if any) and call the next waiting student
export async function callNext(user, slotId) {
  const slot = await ownedSlot(user, slotId);
  if (slot.status === 'cancelled') throw conflict('SLOT_CANCELLED', 'This slot was cancelled');
  if (slot.slot_date !== todayLocal()) {
    throw conflict('SLOT_NOT_TODAY', `You can only run this queue on the slot day (${slot.slot_date})`);
  }

  const entries = await orderedEntries(slotId);
  const placeOf = e => (e ? entries.findIndex(x => x.id === e.id) + 1 : undefined);
  const current = entries.find(e => e.status === 'in_meeting');
  const next = entries.find(e => e.status === 'waiting'); // the earliest booked time still waiting
  if (!current && !next) throw conflict('QUEUE_EMPTY', 'Nobody is waiting in this queue');

  const finished = current ? await finishEntry(current, slot) : null;

  let called = null;
  if (next) {
    called = await db.updateEntryIfStatus(next.id, ['waiting'], { status: 'in_meeting', called_at: nowIso() });
    if (!called) throw conflict('QUEUE_CHANGED', 'The queue changed in the meantime. Refresh and try again.');
    await notify(next.request.student_id, 'queue_called',
      `It is your turn with ${slot.instructor?.full_name || 'your instructor'}. Please go in (${slot.location}).`,
      `/student/queue/${next.request_id}`);
  }

  const remaining = entries.filter(e => e.status === 'waiting' && e.id !== next?.id).length;
  return { finished: entryOut(finished, placeOf(finished)), current: entryOut(called, placeOf(called)), remaining };
}

// Skip a student who is not present (waiting or already called)
export async function skipEntry(user, entryId, reason) {
  const entry = await db.getEntryById(entryId);
  if (!entry) throw notFound('Queue entry not found');
  const slot = await ownedSlot(user, entry.slot_id);
  if (!ACTIVE.includes(entry.status)) throw conflict('ALREADY_FINISHED', 'This student is already done or skipped');

  const skipped = await db.updateEntryIfStatus(entry.id, ACTIVE, { status: 'skipped', finished_at: nowIso() });
  if (!skipped) throw conflict('ALREADY_FINISHED', 'This student is already done or skipped');

  await notify(entry.request.student_id, 'request_updated',
    `You were skipped in the queue for "${entry.request.title}" on ${slot.slot_date}.${reason ? ` Reason: ${reason}` : ''}`,
    `/student/queue/${entry.request_id}`);
  return entryOut(skipped, placeIn(await orderedEntries(entry.slot_id), skipped).place);
}

// Close the queue: the current meeting is finished, everyone still waiting is skipped and notified
export async function closeQueue(user, slotId) {
  const slot = await ownedSlot(user, slotId);
  const entries = await db.listSlotEntries(slotId);
  let finished = 0;
  let skipped = 0;

  for (const e of entries) {
    if (e.status === 'in_meeting') {
      await finishEntry(e, slot);
      finished += 1;
    } else if (e.status === 'waiting') {
      const row = await db.updateEntryIfStatus(e.id, ['waiting'], { status: 'skipped', finished_at: nowIso() });
      if (row) {
        skipped += 1;
        await notify(e.request.student_id, 'request_updated',
          `The queue for "${e.request.title}" on ${slot.slot_date} was closed before your turn. Please book another slot.`,
          '/student/slots');
      }
    }
  }
  return { finished, skipped };
}

// ---------------- #12 QR check-in (public, the token is the secret) ----------------
async function entryForToken(token) {
  const entry = isUuid(token) ? await db.getEntryByToken(token) : null;
  if (!entry) throw notFound('This QR code is not valid');
  const slot = await db.getSlot(entry.slot_id);
  return { entry, slot };
}

export async function getCheckIn(token) {
  const { entry, slot } = await entryForToken(token);
  return {
    studentName: entry.request?.student?.full_name ?? null,
    instructorName: slot.instructor?.full_name ?? null,
    title: entry.request?.title ?? null,
    module: slot.module || null,
    slotDate: slot.slot_date,
    startTime: hhmm(entry.request?.preferred_start || slot.start_time),
    location: slot.location,
    position: placeIn(await orderedEntries(entry.slot_id), entry).place,
    status: entry.status,
    checkedInAt: entry.checked_in_at,
    isMeetingDay: slot.slot_date === todayLocal(),
  };
}

// Simulated door: works once, only on the meeting day, only while the entry is still active
export async function checkIn(token) {
  const { entry, slot } = await entryForToken(token);
  if (!ACTIVE.includes(entry.status) || entry.request?.status === 'cancelled' || slot.status === 'cancelled') {
    throw conflict('ENTRY_FINISHED', 'This meeting is already finished or cancelled');
  }
  if (slot.slot_date !== todayLocal()) {
    throw conflict('NOT_MEETING_DAY', `This ticket only works on the meeting day (${slot.slot_date})`);
  }
  if (entry.checked_in_at) throw conflict('ALREADY_CHECKED_IN', 'You are already checked in');

  const row = await db.markCheckedIn(entry.id, nowIso());
  if (!row) throw conflict('ALREADY_CHECKED_IN', 'You are already checked in');
  const { ahead } = placeIn(await orderedEntries(entry.slot_id), entry);
  return { checkedInAt: row.checked_in_at, ahead };
}

// ---------------- #4 Meeting history + notes ----------------
export async function listMeetings(user, filters) {
  const column = user.role === 'instructor' ? 'instructor_id' : 'student_id';
  const rows = await db.listMeetings({ column, universityId: user.universityId, ...filters });
  let meetings = rows.map(meetingOut);

  // Text search over the request title, both notes and the module
  if (filters.q) {
    const q = filters.q.toLowerCase();
    meetings = meetings.filter(m => [m.title, m.instructorNotes, m.studentNotes, m.module?.code, m.module?.name,
      user.role === 'instructor' ? m.student?.fullName : m.instructor?.fullName]
      .some(v => v && v.toLowerCase().includes(q)));
  }

  const total = meetings.length;
  const start = (filters.page - 1) * filters.limit;
  return { data: meetings.slice(start, start + filters.limit), meta: { page: filters.page, limit: filters.limit, total } };
}

async function ownMeeting(user, id) {
  const m = await db.getMeeting(id);
  if (!m) throw notFound('Meeting not found');
  if (m.student_id !== user.universityId && m.instructor_id !== user.universityId) throw forbidden('This is not your meeting');
  return m;
}

export const getMeeting = async (user, id) => meetingOut(await ownMeeting(user, id));

// Each side only writes its own notes column
export async function saveNotes(user, id, notes) {
  await ownMeeting(user, id);
  const column = user.role === 'instructor' ? 'instructor_notes' : 'student_notes';
  return meetingOut(await db.updateMeetingNotes(id, column, notes || null));
}

// ---------------- #14 Add to queue when the instructor confirms a request (called by the SQS consumer / Lambda) ----------------
// Idempotent: a repeated event for the same request returns the existing entry and sends nothing again.
export async function addToQueue(requestId) {
  const request = await db.getRequestWithSlot(requestId);
  if (!request) throw notFound(`Request ${requestId} not found`);
  if (request.status !== 'confirmed') throw conflict('REQUEST_NOT_CONFIRMED', `Request ${requestId} is ${request.status}, not confirmed`);

  const existing = await db.getEntryByRequest(requestId);
  if (existing) return { entry: existing, request, created: false };
  if (request.slot?.status === 'cancelled') throw conflict('SLOT_CANCELLED', 'This slot was cancelled');

  // Next position = last + 1. Two confirmations at once can pick the same number, so retry on a clash
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const position = (await db.maxPosition(request.slot.id)) + 1;
    try {
      const entry = await db.insertEntry({ slot_id: request.slot.id, request_id: requestId, position });
      return { entry, request, created: true };
    } catch (err) {
      if (err.dbCode !== '23505') throw err;
      const raced = await db.getEntryByRequest(requestId);
      if (raced) return { entry: raced, request, created: false };
    }
  }
  throw new AppError(503, 'QUEUE_BUSY', 'Could not get a queue position. Please try again.');
}

// QR image -> S3, email -> Brevo, copy -> SES. Each step is independent: one failing never undoes the queue entry.
export async function sendTicket(entry, request) {
  const png = await makeQrPng(entry.qr_token);
  const slot = request.slot;
  const ticket = {
    studentName: request.student?.full_name,
    instructorName: slot.instructor?.full_name,
    title: request.title,
    slotDate: slot.slot_date,
    startTime: hhmm(request.preferred_start),
    endTime: hhmm(request.preferred_end),
    location: slot.location,
    token: entry.qr_token,
  };
  const { subject, html, text } = buildTicketEmail(ticket);
  const mail = { to: request.student?.email, toName: ticket.studentName, subject, html, text, png };

  const attempt = async (name, fn) => {
    try {
      return await fn();
    } catch (err) {
      console.error(`[S3] ${name} failed for request ${request.id}: ${err.message}`);
      return { status: 'failed', error: err.message };
    }
  };
  return {
    qrImage: await attempt('S3 upload', () => storeQrImage(entry.qr_token, png)),
    brevo: await attempt('Brevo email', () => sendWithBrevo(mail)),
    ses: await attempt('SES copy', () => copyToSes(mail)),
  };
}

// The whole "request confirmed" job: queue the student, then send the ticket once
export async function processRequestConfirmed(requestId) {
  const { entry, request, created } = await addToQueue(requestId);
  const delivery = created ? await sendTicket(entry, request) : null;
  const { place } = placeIn(await orderedEntries(entry.slot_id), entry);
  return { requestId, queueEntryId: entry.id, position: place, created, to: request.student?.email, delivery };
}

// When a confirmed request is cancelled, its queue entry is taken out of the line
export async function removeFromQueue(requestId) {
  const entry = await db.getEntryByRequest(requestId);
  if (!entry || !ACTIVE.includes(entry.status)) return { removed: false };
  const row = await db.updateEntryIfStatus(entry.id, ACTIVE, { status: 'skipped', finished_at: nowIso() });
  return { removed: Boolean(row) };
}
