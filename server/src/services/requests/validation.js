// [S2] Input rules per endpoint; bad input is rejected with 400 and a clear message
import { AppError } from '../../shared/errors.js';

// A uuid looks like 3f2b8c1e-0a4d-4c9b-9f1e-2d7a6b5c4e3f
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Throws one 400 with every problem found, so the form can highlight all fields at once
function throwIfAny(details) {
  if (details.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', details);
  }
}

// Text must be a string whose trimmed length is between min and max
function checkText(value, field, min, max, details) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    details.push({ field, issue: `must be ${min} to ${max} characters` });
  }
}

// ------------------------------------------------------------------ FAQ (#13)

// /faqs/:id must look like a uuid, otherwise the FAQ cannot exist (404, as in openapi.yaml)
export function validateFaqId(id) {
  if (!UUID.test(id)) {
    throw new AppError(404, 'NOT_FOUND', 'FAQ not found');
  }
}

// GET /faqs?instructorId=&moduleId=&q=
// Instructors always get their own FAQ. Students must say whose FAQ they want.
export function validateFaqsQuery(query, role) {
  const details = [];

  if (role === 'student' && !query.instructorId) {
    details.push({ field: 'instructorId', issue: 'is required for students' });
  }
  if (query.instructorId !== undefined && (typeof query.instructorId !== 'string' || query.instructorId.length > 20)) {
    details.push({ field: 'instructorId', issue: 'must be a university ID' });
  }
  if (query.moduleId !== undefined && !/^\d+$/.test(query.moduleId)) {
    details.push({ field: 'moduleId', issue: 'must be a whole number' });
  }
  if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 100)) {
    details.push({ field: 'q', issue: 'must be at most 100 characters' });
  }

  throwIfAny(details);
}

// POST /faqs body: { moduleId?, question, answer }
// PATCH /faqs/:id body: the same fields, but each one is optional (partial = true)
export function validateFaqInput(body, partial = false) {
  const details = [];
  const has = (field) => body[field] !== undefined;

  if (partial && !has('moduleId') && !has('question') && !has('answer')) {
    details.push({ field: 'body', issue: 'send at least one of moduleId, question, answer' });
  }
  // null means a general FAQ that is not tied to one module
  if (has('moduleId') && body.moduleId !== null && !Number.isInteger(body.moduleId)) {
    details.push({ field: 'moduleId', issue: 'must be a module id or null' });
  }
  if (!partial || has('question')) checkText(body.question, 'question', 5, 300, details);
  if (!partial || has('answer')) checkText(body.answer, 'answer', 5, 2000, details);

  throwIfAny(details);
}

// ------------------------------------------------------------------ Requests (#2, #5, #6, #9)

const STATUSES = ['pending', 'confirmed', 'rejected', 'cancelled', 'completed'];
const PRIORITIES = ['low', 'normal', 'high'];
const SORTS = ['newest', 'oldest', 'priority', 'slotDate'];
// A time like 09:30 (hours 00-23, minutes 00-59)
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// /requests/:id must look like a uuid, otherwise the request cannot exist
export function validateRequestId(id) {
  if (!UUID.test(id)) {
    throw new AppError(404, 'NOT_FOUND', 'Request not found');
  }
}

// GET /requests?status=&priority=&slotId=&moduleId=&unopened=&q=&sort=&page=&limit=
export function validateRequestsQuery(query) {
  const details = [];

  if (query.status !== undefined && !STATUSES.includes(query.status)) {
    details.push({ field: 'status', issue: `must be one of ${STATUSES.join(', ')}` });
  }
  if (query.priority !== undefined && !PRIORITIES.includes(query.priority)) {
    details.push({ field: 'priority', issue: 'must be low, normal or high' });
  }
  if (query.slotId !== undefined && !UUID.test(query.slotId)) {
    details.push({ field: 'slotId', issue: 'must be a slot id' });
  }
  if (query.moduleId !== undefined && !/^\d+$/.test(query.moduleId)) {
    details.push({ field: 'moduleId', issue: 'must be a whole number' });
  }
  if (query.unopened !== undefined && query.unopened !== 'true' && query.unopened !== 'false') {
    details.push({ field: 'unopened', issue: 'must be true or false' });
  }
  if (query.q !== undefined && (typeof query.q !== 'string' || query.q.length > 100)) {
    details.push({ field: 'q', issue: 'must be at most 100 characters' });
  }
  if (query.sort !== undefined && !SORTS.includes(query.sort)) {
    details.push({ field: 'sort', issue: `must be one of ${SORTS.join(', ')}` });
  }
  if (query.page !== undefined && (!/^\d+$/.test(query.page) || Number(query.page) < 1)) {
    details.push({ field: 'page', issue: 'must be 1 or more' });
  }
  if (query.limit !== undefined && (!/^\d+$/.test(query.limit) || Number(query.limit) < 1 || Number(query.limit) > 100)) {
    details.push({ field: 'limit', issue: 'must be between 1 and 100' });
  }

  throwIfAny(details);
}

// Checks the fields that POST and PATCH share. Only checks the fields that are present.
function checkRequestFields(body, details) {
  const has = (field) => body[field] !== undefined;

  if (has('title')) checkText(body.title, 'title', 3, 120, details);
  if (has('description')) checkText(body.description, 'description', 10, 2000, details);
  if (has('preferredStart') && (typeof body.preferredStart !== 'string' || !TIME.test(body.preferredStart))) {
    details.push({ field: 'preferredStart', issue: 'must be a time like 10:00' });
  }
  if (has('preferredEnd') && (typeof body.preferredEnd !== 'string' || !TIME.test(body.preferredEnd))) {
    details.push({ field: 'preferredEnd', issue: 'must be a time like 10:15' });
  }
  // Both times valid -> the end must come after the start ("10:15" > "10:00" works as text)
  if (TIME.test(body.preferredStart) && TIME.test(body.preferredEnd) && body.preferredEnd <= body.preferredStart) {
    details.push({ field: 'preferredEnd', issue: 'must be after the start time' });
  }
  if (has('priority') && !PRIORITIES.includes(body.priority)) {
    details.push({ field: 'priority', issue: 'must be low, normal or high' });
  }
}

// POST /requests body: { slotId, title, description, preferredStart, preferredEnd, priority?, faqSuggestion? }
export function validateCreateRequest(body) {
  const details = [];

  if (typeof body.slotId !== 'string' || !UUID.test(body.slotId)) {
    details.push({ field: 'slotId', issue: 'must be a slot id' });
  }
  // Required fields: report "missing" once here, the format checks below handle the rest
  for (const field of ['title', 'description', 'preferredStart', 'preferredEnd']) {
    if (body[field] === undefined) details.push({ field, issue: 'is required' });
  }
  checkRequestFields(body, details);
  // The AI answer the student saw and chose to continue past (null = no match)
  if (body.faqSuggestion !== undefined && body.faqSuggestion !== null
    && (typeof body.faqSuggestion !== 'string' || body.faqSuggestion.length > 2000)) {
    details.push({ field: 'faqSuggestion', issue: 'must be text up to 2000 characters or null' });
  }

  throwIfAny(details);
}

// PATCH /requests/:id body: any of { title, description, preferredStart, preferredEnd, priority }
export function validateUpdateRequest(body) {
  const details = [];
  const fields = ['title', 'description', 'preferredStart', 'preferredEnd', 'priority'];

  if (!fields.some((field) => body[field] !== undefined)) {
    details.push({ field: 'body', issue: `send at least one of ${fields.join(', ')}` });
  }
  checkRequestFields(body, details);

  throwIfAny(details);
}

// PATCH /requests/:id/status body: { status, reason? }. A reason is required to reject or cancel.
export function validateStatusChange(body) {
  const details = [];

  if (!['confirmed', 'rejected', 'cancelled'].includes(body.status)) {
    details.push({ field: 'status', issue: 'must be confirmed, rejected or cancelled' });
  }
  const needsReason = body.status === 'rejected' || body.status === 'cancelled';
  if (needsReason || (body.reason !== undefined && body.reason !== null)) {
    checkText(body.reason, 'reason', needsReason ? 5 : 0, 500, details);
  }

  throwIfAny(details);
}

// ------------------------------------------------------------------ Notifications (#3)

// /notifications/:id must look like a uuid, otherwise the notification cannot exist
export function validateNotificationId(id) {
  if (!UUID.test(id)) {
    throw new AppError(404, 'NOT_FOUND', 'Notification not found');
  }
}

// GET /notifications?unreadOnly=&since=&page=&limit=
export function validateNotificationsQuery(query) {
  const details = [];

  if (query.unreadOnly !== undefined && query.unreadOnly !== 'true' && query.unreadOnly !== 'false') {
    details.push({ field: 'unreadOnly', issue: 'must be true or false' });
  }
  // since must be a date-time, e.g. 2026-11-25T14:05:00Z (Date.parse gives NaN for anything else)
  if (query.since !== undefined && (typeof query.since !== 'string' || Number.isNaN(Date.parse(query.since)))) {
    details.push({ field: 'since', issue: 'must be a date-time like 2026-11-25T14:05:00Z' });
  }
  if (query.page !== undefined && (!/^\d+$/.test(query.page) || Number(query.page) < 1)) {
    details.push({ field: 'page', issue: 'must be 1 or more' });
  }
  if (query.limit !== undefined && (!/^\d+$/.test(query.limit) || Number(query.limit) < 1 || Number(query.limit) > 100)) {
    details.push({ field: 'limit', issue: 'must be between 1 and 100' });
  }

  throwIfAny(details);
}

// ------------------------------------------------------------------ AI (#13)

// POST /requests/faq-check body: { slotId, title, description }
export function validateFaqCheck(body) {
  const details = [];

  if (typeof body.slotId !== 'string' || !UUID.test(body.slotId)) {
    details.push({ field: 'slotId', issue: 'must be a slot id' });
  }
  checkText(body.title, 'title', 3, 120, details);
  checkText(body.description, 'description', 10, 2000, details);

  throwIfAny(details);
}

// POST /faqs/suggest body: { moduleId? } (only look at requests about one module)
export function validateFaqSuggest(body) {
  if (body.moduleId !== undefined && body.moduleId !== null && !Number.isInteger(body.moduleId)) {
    throwIfAny([{ field: 'moduleId', issue: 'must be a module id or null' }]);
  }
}
