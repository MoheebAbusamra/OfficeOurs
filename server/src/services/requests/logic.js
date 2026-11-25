// [S2] Business rules: status workflow pending -> confirmed/rejected/cancelled, edit only while unopened, emergency cancel
import { AppError } from '../../shared/errors.js';
import { listModules } from '../scheduling/logic.js'; // S2 -> S1: which modules a user teaches or studies
import * as db from './db.js';

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
