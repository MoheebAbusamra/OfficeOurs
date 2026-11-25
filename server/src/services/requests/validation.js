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
