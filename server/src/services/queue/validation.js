// Input rules per endpoint; bad input is rejected with 400 and a clear message
import { badRequest } from '../../shared/errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const isUuid = value => typeof value === 'string' && UUID.test(value);

const isRealDate = value => DATE.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime())
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

// Path ids: /queue/position/{requestId}, /queue/slots/{slotId}, /queue/entries/{id}, /meetings/{id}
export function checkUuidParam(value, field) {
  if (!isUuid(value)) throw badRequest(`${field} must be a valid id`, [{ field, issue: 'not a valid uuid' }]);
  return value;
}

// PATCH /queue/entries/{id}/skip body: { reason? } (max 300 characters)
export function checkSkipBody(body = {}) {
  const reason = body?.reason;
  if (reason === undefined || reason === null || reason === '') return { reason: null };
  if (typeof reason !== 'string') throw badRequest('Reason must be text', [{ field: 'reason', issue: 'must be a string' }]);
  const trimmed = reason.trim();
  if (trimmed.length > 300) throw badRequest('Reason must be 300 characters or less', [{ field: 'reason', issue: 'too long' }]);
  return { reason: trimmed || null };
}

// PATCH /meetings/{id}/notes body: { notes } (required string, max 5000 characters, empty string clears it)
export function checkNotesBody(body = {}) {
  const notes = body?.notes;
  if (notes === undefined || notes === null) throw badRequest('Notes are required', [{ field: 'notes', issue: 'required' }]);
  if (typeof notes !== 'string') throw badRequest('Notes must be text', [{ field: 'notes', issue: 'must be a string' }]);
  const trimmed = notes.trim();
  if (trimmed.length > 5000) throw badRequest('Notes must be 5000 characters or less', [{ field: 'notes', issue: 'too long' }]);
  return { notes: trimmed };
}

// GET /meetings query: q, moduleId, from, to, page, limit
export function checkMeetingsQuery(query = {}) {
  const details = [];
  const out = { q: null, moduleId: null, from: null, to: null, page: 1, limit: 20 };

  if (query.q !== undefined && query.q !== '') {
    out.q = String(query.q).trim().slice(0, 100) || null;
  }
  if (query.moduleId !== undefined && query.moduleId !== '') {
    const n = Number(query.moduleId);
    if (!Number.isInteger(n) || n < 1) details.push({ field: 'moduleId', issue: 'must be a positive whole number' });
    else out.moduleId = n;
  }
  for (const field of ['from', 'to']) {
    if (query[field] !== undefined && query[field] !== '') {
      if (!isRealDate(String(query[field]))) details.push({ field, issue: 'must be a date like 2026-11-24' });
      else out[field] = String(query[field]);
    }
  }
  if (out.from && out.to && out.from > out.to) details.push({ field: 'to', issue: 'must be on or after from' });
  for (const [field, max] of [['page', 10000], ['limit', 100]]) {
    if (query[field] !== undefined && query[field] !== '') {
      const n = Number(query[field]);
      if (!Number.isInteger(n) || n < 1 || n > max) details.push({ field, issue: `must be a whole number from 1 to ${max}` });
      else out[field] = n;
    }
  }

  if (details.length) throw badRequest('Some search filters are not valid', details);
  return out;
}
