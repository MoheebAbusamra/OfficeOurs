// [S2] Endpoints (method + URL) -> validation -> logic; mounted at /api/v1
import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/auth.js';
import { validateFaqId, validateFaqsQuery, validateFaqInput } from './validation.js';
import { listFaqs, createFaq, updateFaq, deleteFaq } from './logic.js';

const router = Router();

// ------------------------------------------------------------------ FAQ (#13)

// Instructor: own FAQ. Student: FAQ of ?instructorId=
router.get('/faqs', requireAuth, async (req, res) => {
  validateFaqsQuery(req.query, req.user.role);
  const faqs = await listFaqs(req.user, req.query);
  res.json({ data: faqs });
});

// Add an FAQ (instructors only)
router.post('/faqs', requireAuth, requireRole('instructor'), async (req, res) => {
  const body = req.body || {};
  validateFaqInput(body);
  const faq = await createFaq(req.user, body);
  res.status(201).json({ data: faq });
});

// Edit an FAQ (owner only, checked in logic.js)
router.patch('/faqs/:id', requireAuth, requireRole('instructor'), async (req, res) => {
  validateFaqId(req.params.id);
  const body = req.body || {};
  validateFaqInput(body, true);
  const faq = await updateFaq(req.user, req.params.id, body);
  res.json({ data: faq });
});

// Delete an FAQ (owner only, checked in logic.js)
router.delete('/faqs/:id', requireAuth, requireRole('instructor'), async (req, res) => {
  validateFaqId(req.params.id);
  await deleteFaq(req.user, req.params.id);
  res.status(204).end();
});

export default router;
