// [S2] Endpoints (method + URL) -> validation -> logic; mounted at /api/v1
import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/auth.js';
import {
  validateFaqId, validateFaqsQuery, validateFaqInput,
  validateRequestId, validateRequestsQuery, validateCreateRequest, validateUpdateRequest, validateStatusChange,
} from './validation.js';
import {
  listFaqs, createFaq, updateFaq, deleteFaq,
  listRequests, getRequest, createRequest, updateRequest, changeStatus,
} from './logic.js';

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

// ------------------------------------------------------------------ Requests (#2, #5, #6, #9)

// Student: my requests. Instructor: requests on my slots (inbox). With filters, sort and pages.
router.get('/requests', requireAuth, async (req, res) => {
  validateRequestsQuery(req.query);
  const result = await listRequests(req.user, req.query);
  res.json(result); // already { data, meta }
});

// Submit a request (students only)
router.post('/requests', requireAuth, requireRole('student'), async (req, res) => {
  const body = req.body || {};
  validateCreateRequest(body);
  const request = await createRequest(req.user, body);
  res.status(201).json({ data: request });
});

// One request. The instructor's first open locks the student's edits.
router.get('/requests/:id', requireAuth, async (req, res) => {
  validateRequestId(req.params.id);
  const request = await getRequest(req.user, req.params.id);
  res.json({ data: request });
});

// Edit a request (student owner, only while pending and unopened)
router.patch('/requests/:id', requireAuth, requireRole('student'), async (req, res) => {
  validateRequestId(req.params.id);
  const body = req.body || {};
  validateUpdateRequest(body);
  const request = await updateRequest(req.user, req.params.id, body);
  res.json({ data: request });
});

// Confirm / reject (instructor) or cancel (either side)
router.patch('/requests/:id/status', requireAuth, async (req, res) => {
  validateRequestId(req.params.id);
  const body = req.body || {};
  validateStatusChange(body);
  const request = await changeStatus(req.user, req.params.id, body);
  res.json({ data: request });
});

export default router;
