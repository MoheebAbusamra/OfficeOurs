// Endpoints (method + URL) -> validation -> logic; mounted at /api/v1
import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/auth.js';
import { validateInstructorsQuery, validateSlotsQuery, validateSlotId, validateCreateSlot, validateUpdateSlot, validateHolidaysQuery } from './validation.js';
import { listModules, listInstructors, listSlots, getSlot, createSlot, updateSlot, deleteSlot, getHolidays, getDashboard } from './logic.js';
 
const router = Router();
 
// Modules for the filter dropdowns
router.get('/modules', requireAuth, async (req, res) => {
  const modules = await listModules(req.user);
  res.json({ data: modules });
});
 
// Instructors for the filter dropdowns (optionally for one module)
router.get('/instructors', requireAuth, async (req, res) => {
  validateInstructorsQuery(req.query);
  const instructors = await listInstructors(req.user, req.query.moduleId);
  res.json({ data: instructors });
});
 
// Search slots (students) or list own slots (instructors), with paging
router.get('/slots', requireAuth, async (req, res) => {
  validateSlotsQuery(req.query);
  const result = await listSlots(req.user, req.query);
  res.json(result); // already { data, meta }
});
 
// One slot with its confirmed count
router.get('/slots/:id', requireAuth, async (req, res) => {
  validateSlotId(req.params.id);
  const slot = await getSlot(req.user, req.params.id);
  res.json({ data: slot });
});
 
// Create a slot (instructors only)
router.post('/slots', requireAuth, requireRole('instructor'), async (req, res) => {
  const body = req.body || {};
  validateCreateSlot(body);
  const slot = await createSlot(req.user, body);
  res.status(201).json({ data: slot });
});
 
// Edit or cancel a slot (owner only, checked in logic.js)
router.patch('/slots/:id', requireAuth, requireRole('instructor'), async (req, res) => {
  validateSlotId(req.params.id);
  const body = req.body || {};
  validateUpdateSlot(body);
  const slot = await updateSlot(req.user, req.params.id, body);
  res.json({ data: slot });
});
 
// Delete a slot (owner only, and only without active requests)
router.delete('/slots/:id', requireAuth, requireRole('instructor'), async (req, res) => {
  validateSlotId(req.params.id);
  await deleteSlot(req.user, req.params.id);
  res.status(204).end();
});
 
// Egypt public holidays for one year (any logged-in user)
router.get('/holidays', requireAuth, async (req, res) => {
  validateHolidaysQuery(req.query);
  const holidays = await getHolidays(Number(req.query.year));
  res.json({ data: holidays });
});
 
// Instructor home page numbers
router.get('/dashboard', requireAuth, requireRole('instructor'), async (req, res) => {
  const dashboard = await getDashboard(req.user);
  res.json({ data: dashboard });
});
 
export default router;
 