// [S2] Business rules: status workflow pending -> confirmed/rejected/cancelled, edit only while unopened, emergency cancel
import { AppError } from '../../shared/errors.js';
import { notify } from '../../shared/notify.js';
import { publish, EVENTS } from '../../shared/events.js';
// S2 -> S1: Judy's scheduling rules (which modules a user has, one slot, which slots a student may book)
import { listModules, getSlot, listSlots } from '../scheduling/logic.js';
import * as db from './db.js';
import * as gemini from './gemini.js';

// ------------------------------------------------------------------ FAQ (#13)

// Database row (snake_case) -> API shape from openapi.yaml (camelCase)
function toFaqResponse(row) {
  return {
    id: row.id,
    instructorId: row.instructor_id,
    moduleId: row.module_id,
    question: row.question,
    answer: row.answer,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Keeps only letters, digits, spaces and ' ? - in the search text.
// Commas, dots and brackets have a special meaning inside the Supabase or(...) filter, so they must go.
function cleanSearch(text) {
  if (!text) return '';
  return text.replace(/[^\p{L}\p{N}\s'?-]/gu, ' ').trim();
}

// A module-specific FAQ must be for a module this instructor teaches (null = general FAQ, always fine)
async function checkModuleIsTaught(user, moduleId) {
  if (moduleId === null || moduleId === undefined) return;

  const modules = await listModules(user);
  if (!modules.some((m) => m.id === moduleId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', [
      { field: 'moduleId', issue: 'must be one of the modules you teach' },
    ]);
  }
}

// Loads an FAQ and makes sure it belongs to this instructor
async function findOwnFaq(user, id) {
  const row = await db.findFaqById(id);
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'FAQ not found');
  }
  if (row.instructor_id !== user.universityId) {
    throw new AppError(403, 'FORBIDDEN', 'You can only change your own FAQs');
  }
  return row;
}

// GET /faqs: instructors see their own FAQ, students see the FAQ of the instructor they ask for
export async function listFaqs(user, query) {
  const instructorId = user.role === 'instructor' ? user.universityId : query.instructorId;

  const rows = await db.findFaqs({
    instructorId,
    moduleId: query.moduleId ? Number(query.moduleId) : undefined,
    q: cleanSearch(query.q),
  });
  return rows.map(toFaqResponse);
}

// POST /faqs (instructors only, checked in routes.js)
export async function createFaq(user, body) {
  const moduleId = body.moduleId ?? null;
  await checkModuleIsTaught(user, moduleId);

  const row = await db.insertFaq({
    instructor_id: user.universityId,
    module_id: moduleId,
    question: body.question.trim(),
    answer: body.answer.trim(),
  });
  return toFaqResponse(row);
}

// PATCH /faqs/:id (owner only). Only the fields that were sent are changed.
export async function updateFaq(user, id, body) {
  await findOwnFaq(user, id);

  const changes = {};
  if (body.moduleId !== undefined) {
    await checkModuleIsTaught(user, body.moduleId);
    changes.module_id = body.moduleId;
  }
  if (body.question !== undefined) changes.question = body.question.trim();
  if (body.answer !== undefined) changes.answer = body.answer.trim();

  const row = await db.updateFaq(id, changes);
  return toFaqResponse(row);
}

// DELETE /faqs/:id (owner only)
export async function deleteFaq(user, id) {
  await findOwnFaq(user, id);
  await db.deleteFaq(id);
}

// ------------------------------------------------------------------ Requests (#2, #5, #6, #9)

// Who may move a request from which status to which (anything else is INVALID_TRANSITION)
const ALLOWED = {
  instructor: { pending: ['confirmed', 'rejected', 'cancelled'], confirmed: ['cancelled'] },
  student: { pending: ['cancelled'], confirmed: ['cancelled'] },
};

// Sorting by priority: high first
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

// Today as "2026-11-25" and the time as "14:05", both in the server's local time (same as S1)
function today() {
  return new Date().toLocaleDateString('en-CA');
}
function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

// "10:00:00" (database) -> "10:00" (API)
function hhmm(time) {
  return time.slice(0, 5);
}

// "2026-11-30" + "10:00" -> "Mon 30 Nov at 10:00" (for notification texts)
function when(slotDate, startTime) {
  const day = new Date(`${slotDate}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
  });
  return `${day} at ${hhmm(startTime)}`;
}

// queue_entries comes back as an object, an array or null depending on the relation, so take the first one
function queueEntryOf(row) {
  const entry = Array.isArray(row.queue_entries) ? row.queue_entries[0] : row.queue_entries;
  return entry || null;
}

// The slot inside a request, in the same shape as S1's Slot in openapi.yaml
function toSlotShape(slot, confirmedCount) {
  return {
    id: slot.id,
    instructor: { universityId: slot.university_registry.university_id, fullName: slot.university_registry.full_name },
    module: slot.modules, // null = open to all of the instructor's modules
    slotDate: slot.slot_date,
    startTime: hhmm(slot.start_time),
    endTime: hhmm(slot.end_time),
    location: slot.location,
    capacity: slot.capacity,
    confirmedCount,
    isFull: confirmedCount >= slot.capacity,
    status: slot.status,
  };
}

// Database row (snake_case) -> API shape from openapi.yaml (camelCase)
function toRequestResponse(row, user, confirmedCount) {
  return {
    id: row.id,
    student: { universityId: row.university_registry.university_id, fullName: row.university_registry.full_name },
    slot: toSlotShape(row.slots, confirmedCount),
    title: row.title,
    description: row.description,
    preferredStart: hhmm(row.preferred_start),
    preferredEnd: hhmm(row.preferred_end),
    priority: row.priority,
    status: row.status,
    faqSuggestion: row.faq_suggestion,
    openedAt: row.opened_at,
    statusReason: row.status_reason,
    cancelledBy: row.cancelled_by,
    // Only the student who owns it, only while pending and not yet opened by the instructor
    canEdit: row.student_id === user.universityId && row.status === 'pending' && !row.opened_at,
    queueEntryId: queueEntryOf(row)?.id ?? null, // filled once S3 has queued the request
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Shapes a list of rows. One extra query counts the taken seats of all their slots at once.
async function shapeRequests(user, rows) {
  const slotIds = [...new Set(rows.map((row) => row.slot_id))];
  const counts = {}; // { "slot-id": 2, ... }
  if (slotIds.length > 0) {
    for (const r of await db.findConfirmedRequests(slotIds)) {
      counts[r.slot_id] = (counts[r.slot_id] || 0) + 1;
    }
  }
  return rows.map((row) => toRequestResponse(row, user, counts[row.slot_id] || 0));
}

async function shapeRequest(user, row) {
  const [shaped] = await shapeRequests(user, [row]);
  return shaped;
}

// Loads a request the user is allowed to see: the student who sent it, or the instructor of its slot
async function findVisibleRequest(user, id) {
  const row = await db.findRequestById(id);
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'Request not found');
  }
  const isOwner = user.role === 'student' && row.student_id === user.universityId;
  const isSlotInstructor = user.role === 'instructor' && row.slots.instructor_id === user.universityId;
  if (!isOwner && !isSlotInstructor) {
    throw new AppError(403, 'FORBIDDEN', 'This request is not yours');
  }
  return row;
}

// The window must lie inside the slot, e.g. 10:00-10:15 inside 10:00-12:00
function checkWindowInsideSlot(start, end, slotStart, slotEnd) {
  if (start < slotStart || end > slotEnd) {
    throw new AppError(409, 'WINDOW_OUTSIDE_SLOT', `Please pick a time between ${slotStart} and ${slotEnd}`);
  }
}

// GET /requests: student = my requests, instructor = requests on my slots (inbox)
export async function listRequests(user, query) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);

  // 1. The database does the simple filters
  const filters = {
    slotId: query.slotId,
    status: query.status,
    priority: query.priority,
    unopened: query.unopened === 'true',
  };
  if (user.role === 'student') {
    filters.studentId = user.universityId;
  } else {
    filters.slotIds = await db.findSlotIdsOfInstructor(user.universityId);
    if (filters.slotIds.length === 0) return { data: [], meta: { page, limit, total: 0 } };
  }
  let rows = await db.findRequests(filters); // newest first

  // 2. Module and search text are checked here (they live in joined tables)
  if (query.moduleId) {
    rows = rows.filter((row) => row.slots.module_id === Number(query.moduleId));
  }
  if (query.q) {
    const search = query.q.toLowerCase();
    rows = rows.filter((row) =>
      `${row.title} ${row.description} ${row.university_registry.full_name}`.toLowerCase().includes(search));
  }

  // 3. Sort (newest is already the database order)
  const sort = query.sort || 'newest';
  if (sort === 'oldest') rows.reverse();
  if (sort === 'priority') rows.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
  if (sort === 'slotDate') {
    const key = (row) => `${row.slots.slot_date} ${row.preferred_start}`;
    rows.sort((a, b) => key(a).localeCompare(key(b)));
  }

  // 4. Pages, then shape only the rows of this page
  const start = (page - 1) * limit;
  const data = await shapeRequests(user, rows.slice(start, start + limit));
  return { data, meta: { page, limit, total: rows.length } };
}

// GET /requests/:id. The instructor's first open sets opened_at, which locks the student's edits.
export async function getRequest(user, id) {
  let row = await findVisibleRequest(user, id);

  if (user.role === 'instructor' && !row.opened_at) {
    // If the row changed in between, keep the version we already have
    row = (await db.updateRequest(id, { opened_at: new Date().toISOString() }, { unopened: true })) || row;
  }
  return shapeRequest(user, row);
}

// POST /requests (students only, checked in routes.js)
export async function createRequest(user, body) {
  // 1. The slot (S2 -> S1: Judy's getSlot answers 404 when it does not exist)
  const slot = await getSlot(user, body.slotId);

  // 2. Still open: active, and not over yet
  const isOver = slot.slotDate < today() || (slot.slotDate === today() && slot.endTime <= nowTime());
  if (slot.status !== 'active' || isOver) {
    throw new AppError(409, 'SLOT_NOT_ACTIVE', 'This slot is no longer open for requests');
  }

  // 3. Open to this student (S2 -> S1: the same rules as the student's slot search,
  //    i.e. one of their modules, not a weekend, not a holiday)
  const bookable = await listSlots(user, {
    instructorId: slot.instructor.universityId, from: slot.slotDate, to: slot.slotDate, limit: 100,
  });
  if (!bookable.data.some((s) => s.id === slot.id)) {
    throw new AppError(403, 'FORBIDDEN', 'This slot is not open to your modules');
  }

  // 4. The window fits the slot, and a seat is still free
  checkWindowInsideSlot(body.preferredStart, body.preferredEnd, slot.startTime, slot.endTime);
  if (slot.isFull) {
    throw new AppError(409, 'SLOT_FULL', 'This slot is full');
  }

  // 5. Save. The unique index allows only one pending/confirmed request per student per slot.
  let row;
  try {
    row = await db.insertRequest({
      student_id: user.universityId,
      slot_id: slot.id,
      title: body.title.trim(),
      description: body.description.trim(),
      preferred_start: body.preferredStart,
      preferred_end: body.preferredEnd,
      priority: body.priority || 'normal',
      faq_suggestion: body.faqSuggestion ?? null,
    });
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError(409, 'DUPLICATE_REQUEST', 'You already have an active request for this slot');
    }
    throw err;
  }

  // 6. Tell the instructor
  await notify(slot.instructor.universityId, 'request_created',
    `${user.fullName} requested a meeting on ${when(slot.slotDate, slot.startTime)}: "${row.title}"`,
    '/instructor/inbox');

  return shapeRequest(user, row);
}

// PATCH /requests/:id (student owner only). Only while pending AND not yet opened by the instructor.
export async function updateRequest(user, id, body) {
  const row = await findVisibleRequest(user, id);
  const locked = () => new AppError(409, 'REQUEST_LOCKED',
    'The instructor already opened this request, so it can no longer be edited');

  if (row.opened_at) throw locked();
  if (row.status !== 'pending') {
    throw new AppError(409, 'REQUEST_LOCKED', `This request is ${row.status}, so it can no longer be edited`);
  }

  // The new window: the sent times, or the old ones for the times that were not sent
  const start = body.preferredStart ?? hhmm(row.preferred_start);
  const end = body.preferredEnd ?? hhmm(row.preferred_end);
  if (end <= start) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', [
      { field: 'preferredEnd', issue: 'must be after the start time' },
    ]);
  }
  checkWindowInsideSlot(start, end, hhmm(row.slots.start_time), hhmm(row.slots.end_time));

  const changes = { preferred_start: start, preferred_end: end };
  if (body.title !== undefined) changes.title = body.title.trim();
  if (body.description !== undefined) changes.description = body.description.trim();
  if (body.priority !== undefined) changes.priority = body.priority;

  // Saved only if it is still pending and unopened (the instructor may have opened it a second ago)
  const updated = await db.updateRequest(id, changes, { status: 'pending', unopened: true });
  if (!updated) throw locked();

  await notify(row.slots.instructor_id, 'request_updated',
    `${user.fullName} edited the request "${updated.title}" (${when(row.slots.slot_date, row.slots.start_time)})`,
    '/instructor/inbox');

  return shapeRequest(user, updated);
}

// PATCH /requests/:id/status
// Instructor: pending -> confirmed | rejected. Either side: pending | confirmed -> cancelled (reason required).
export async function changeStatus(user, id, body) {
  const row = await findVisibleRequest(user, id);
  const next = body.status;
  const slot = row.slots;

  // 1. Who may do what
  if (user.role === 'student' && next !== 'cancelled') {
    throw new AppError(403, 'FORBIDDEN', 'Only the instructor can confirm or reject a request');
  }
  if (!(ALLOWED[user.role][row.status] || []).includes(next)) {
    throw new AppError(409, 'INVALID_TRANSITION', `A ${row.status} request cannot be ${next}`);
  }

  // 2. A meeting that already started cannot be cancelled (S3 sets the queue entry to in_meeting / done)
  const entry = queueEntryOf(row);
  if (next === 'cancelled' && entry && (entry.status === 'in_meeting' || entry.status === 'done')) {
    throw new AppError(409, 'MEETING_STARTED', 'This meeting has already started, so it can no longer be cancelled');
  }

  // 3. Confirming needs an active, not yet past slot with a free seat
  if (next === 'confirmed') {
    if (slot.status !== 'active' || slot.slot_date < today()) {
      throw new AppError(409, 'SLOT_NOT_ACTIVE', 'This slot is cancelled or already over');
    }
    const confirmed = await db.findConfirmedRequests([slot.id]);
    if (confirmed.length >= slot.capacity) {
      throw new AppError(409, 'SLOT_FULL', 'This slot is already full');
    }
  }

  // 4. Save, only if nobody changed the status in the meantime
  const changes = { status: next };
  if (next === 'rejected' || next === 'cancelled') changes.status_reason = body.reason.trim();
  if (next === 'cancelled') changes.cancelled_by = user.role;
  if (user.role === 'instructor' && !row.opened_at) changes.opened_at = new Date().toISOString();

  const updated = await db.updateRequest(id, changes, { status: row.status });
  if (!updated) {
    throw new AppError(409, 'INVALID_TRANSITION', 'This request was just changed. Please refresh and try again');
  }

  // 5. Tell S3 (queue + QR email) and the other side
  const slotTime = when(slot.slot_date, slot.start_time);
  const student = row.university_registry;
  const instructor = slot.university_registry;

  if (next === 'confirmed') {
    await publish(EVENTS.REQUEST_CONFIRMED, {
      requestId: id, slotId: slot.id, studentId: row.student_id, instructorId: slot.instructor_id,
    });
    await notify(row.student_id, 'request_confirmed',
      `${instructor.full_name} confirmed "${row.title}" on ${slotTime}. Your QR ticket comes by email.`,
      '/student/requests');
  }
  if (next === 'rejected') {
    await notify(row.student_id, 'request_rejected',
      `${instructor.full_name} could not accept "${row.title}": ${changes.status_reason}`,
      '/student/requests');
  }
  if (next === 'cancelled') {
    await publish(EVENTS.REQUEST_CANCELLED, {
      requestId: id, slotId: slot.id, previousStatus: row.status, cancelledBy: user.role,
    });
    if (user.role === 'instructor') {
      await notify(row.student_id, 'request_cancelled',
        `${instructor.full_name} cancelled "${row.title}" on ${slotTime}: ${changes.status_reason}`,
        '/student/requests');
    } else {
      await notify(slot.instructor_id, 'request_cancelled',
        `${student.full_name} cancelled "${row.title}" on ${slotTime}: ${changes.status_reason}`,
        '/instructor/inbox');
    }
  }

  // 6. After a confirm, read again so the queue entry S3 just created is in the response
  const fresh = next === 'confirmed' ? await db.findRequestById(id) : updated;
  return shapeRequest(user, fresh);
}

// ------------------------------------------------------------------ Notifications (#3)

// Database row -> API shape from openapi.yaml
function toNotificationResponse(row) {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    link: row.link,
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

// GET /notifications: my notifications, newest first, plus my unread count for the bell badge
export async function listNotifications(user, query) {
  const page = Number(query.page || 1);
  const limit = Number(query.limit || 20);
  const from = (page - 1) * limit;

  const { rows, total } = await db.findNotifications({
    recipientId: user.universityId,
    unreadOnly: query.unreadOnly === 'true',
    since: query.since,
    from,
    to: from + limit - 1,
  });
  const unreadCount = await db.countUnreadNotifications(user.universityId);

  return { data: rows.map(toNotificationResponse), meta: { page, limit, total, unreadCount } };
}

// PATCH /notifications/:id/read (only your own)
export async function markNotificationRead(user, id) {
  const row = await db.findNotificationById(id);
  if (!row) {
    throw new AppError(404, 'NOT_FOUND', 'Notification not found');
  }
  if (row.recipient_id !== user.universityId) {
    throw new AppError(403, 'FORBIDDEN', 'This notification is not yours');
  }
  const updated = row.is_read ? row : await db.markNotificationRead(id);
  return toNotificationResponse(updated);
}

// PATCH /notifications/read-all
export async function markAllNotificationsRead(user) {
  const updated = await db.markAllNotificationsRead(user.universityId);
  return { updated };
}

// ------------------------------------------------------------------ AI (#13, Gemini)

// How many recent requests the FAQ suggestions look at (enough to spot patterns, small enough to stay fast)
const SUGGEST_LOOKBACK = 60;

// POST /requests/faq-check: before submitting, does the instructor's FAQ already answer the question?
// Returns the old fields (matched, faqId, faqQuestion, answer) plus the new ones (verdict, sources, ...)
export async function checkFaq(user, body) {
  // 1. The slot tells us whose FAQ to use (S2 -> S1, 404 if the slot does not exist)
  const slot = await getSlot(user, body.slotId);

  // 2. FAQs for the slot's module plus the general ones (all of them when the slot has no module)
  const all = await db.findFaqs({ instructorId: slot.instructor.universityId });
  const faqs = slot.module ? all.filter((f) => f.module_id === null || f.module_id === slot.module.id) : all;

  const noMatch = {
    matched: false, verdict: 'none', faqId: null, faqQuestion: null, answer: null,
    sources: [], stillWorthAsking: null, suggestedTitle: null,
  };
  if (faqs.length === 0) return noMatch; // nothing to compare with, no need to ask Gemini

  // 3. Gemini reasons over the FAQ (throws 502 AI_UNAVAILABLE if it fails; the student can still continue)
  const ai = await gemini.checkQuestionAgainstFaq(faqs, { title: body.title.trim(), description: body.description.trim() });

  const sources = ai.usedFaqIds.map((id) => {
    const faq = faqs.find((f) => f.id === id);
    return { faqId: faq.id, question: faq.question };
  });
  return {
    matched: ai.verdict !== 'none',
    verdict: ai.verdict, // answered | partial | none
    faqId: sources[0]?.faqId ?? null,
    faqQuestion: sources[0]?.question ?? null,
    answer: ai.answer,
    sources, // every FAQ entry the answer is based on
    stillWorthAsking: ai.stillWorthAsking, // only for "partial"
    suggestedTitle: ai.suggestedTitle, // a clearer title, or null
  };
}

// POST /faqs/suggest (instructors): drafts new FAQ entries from the questions students sent recently
export async function suggestFaqs(user, body) {
  if (body.moduleId !== undefined && body.moduleId !== null) await checkModuleIsTaught(user, body.moduleId);

  // 1. The newest requests on my slots (optionally only one module)
  const slotIds = await db.findSlotIdsOfInstructor(user.universityId);
  let rows = slotIds.length > 0 ? await db.findRequests({ slotIds }) : [];
  if (body.moduleId) rows = rows.filter((row) => row.slots.module_id === body.moduleId);
  rows = rows.slice(0, SUGGEST_LOOKBACK);

  // Patterns need at least 2 questions
  if (rows.length < 2) return { data: [], meta: { analyzed: rows.length } };

  // 2. Gemini compares them with the current FAQ
  const faqs = await db.findFaqs({ instructorId: user.universityId });
  const drafts = await gemini.suggestFaqEntries(
    rows.map((row) => ({ id: row.id, title: row.title, description: row.description })),
    faqs,
  );

  // 3. Add facts we compute ourselves (never taken from the model): how many requests and students, which module
  const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
  const data = drafts.map((draft) => {
    const used = draft.requestIds.map((id) => byId[id]);

    // The module most of these requests were about; null (general) when they are mixed
    let moduleId = body.moduleId ?? null;
    if (!moduleId) {
      const counts = {};
      for (const row of used) {
        if (row.slots.module_id) counts[row.slots.module_id] = (counts[row.slots.module_id] || 0) + 1;
      }
      for (const [id, count] of Object.entries(counts)) {
        if (count > used.length / 2) moduleId = Number(id);
      }
    }

    return {
      question: draft.question,
      answer: draft.answer,
      moduleId,
      requestCount: used.length,
      studentCount: new Set(used.map((row) => row.student_id)).size,
      exampleTitles: used.slice(0, 3).map((row) => row.title),
    };
  });
  data.sort((a, b) => b.requestCount - a.requestCount);

  return { data, meta: { analyzed: rows.length } };
}
