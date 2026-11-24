// [S1] Endpoints (method + URL) -> validation -> logic; mounted at /api/v1
import { Router } from 'express';
import { requireAuth } from '../../shared/auth.js';
import { validateInstructorsQuery, validateSlotsQuery, validateSlotId } from './validation.js';
import { listModules, listInstructors, listSlots, getSlot } from './logic.js';
 
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
 
export default router;
 