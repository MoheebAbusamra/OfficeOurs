// [S1] Input rules per endpoint; bad input is rejected with 400 and a clear message
import { AppError } from '../../shared/errors.js';
 
// GET /instructors?moduleId=2
export function validateInstructorsQuery(query) {
  if (query.moduleId !== undefined && !/^\d+$/.test(query.moduleId)) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', [
      { field: 'moduleId', issue: 'must be a whole number' },
    ]);
  }
}
 
// GET /slots?moduleId=&instructorId=&from=&to=&q=&status=&page=&limit=
export function validateSlotsQuery(query) {
  const details = [];
 
  // /^\d+$/ means "only digits", /^\d{4}-\d{2}-\d{2}$/ means a date like 2026-11-25
  if (query.moduleId !== undefined && !/^\d+$/.test(query.moduleId)) {
    details.push({ field: 'moduleId', issue: 'must be a whole number' });
  }
  if (query.from !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(query.from)) {
    details.push({ field: 'from', issue: 'must be a date like 2026-11-25' });
  }
  if (query.to !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(query.to)) {
    details.push({ field: 'to', issue: 'must be a date like 2026-11-25' });
  }
  // Dates in this format can be compared as text: "2026-11-25" < "2026-12-01"
  if (query.from && query.to && query.to < query.from) {
    details.push({ field: 'to', issue: 'must be on or after from' });
  }
  if (query.status !== undefined && query.status !== 'active' && query.status !== 'cancelled') {
    details.push({ field: 'status', issue: 'must be active or cancelled' });
  }
  if (query.page !== undefined && (!/^\d+$/.test(query.page) || Number(query.page) < 1)) {
    details.push({ field: 'page', issue: 'must be 1 or more' });
  }
  if (query.limit !== undefined && (!/^\d+$/.test(query.limit) || Number(query.limit) < 1 || Number(query.limit) > 100)) {
    details.push({ field: 'limit', issue: 'must be between 1 and 100' });
  }
 
  if (details.length > 0) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please check the highlighted fields', details);
  }
}
 
// /slots/:id must look like a uuid, otherwise the slot cannot exist (404, as in openapi.yaml)
export function validateSlotId(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new AppError(404, 'NOT_FOUND', 'Slot not found');
  }
}
 