// [S3] Endpoints (method + URL) -> validation -> logic; mounted at /api/v1
import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/auth.js';
import * as logic from './logic.js';
import { checkMeetingsQuery, checkNotesBody, checkSkipBody, checkUuidParam } from './validation.js';

const router = Router();
const student = [requireAuth, requireRole('student')];
const instructor = [requireAuth, requireRole('instructor')];
const anyone = [requireAuth, requireRole('student', 'instructor')];

// ---------------- Queue (#7, #11) ----------------
router.get('/queue/position/:requestId', ...student, async (req, res) => {
  const requestId = checkUuidParam(req.params.requestId, 'requestId');
  res.json({ data: await logic.getPosition(req.user, requestId) });
});

router.get('/queue/slots/:slotId', ...instructor, async (req, res) => {
  const slotId = checkUuidParam(req.params.slotId, 'slotId');
  const { entries, slot } = await logic.getSlotQueue(req.user, slotId);
  res.json({ data: entries, meta: { slot } });
});

router.post('/queue/slots/:slotId/next', ...instructor, async (req, res) => {
  const slotId = checkUuidParam(req.params.slotId, 'slotId');
  res.json({ data: await logic.callNext(req.user, slotId) });
});

router.patch('/queue/entries/:id/skip', ...instructor, async (req, res) => {
  const id = checkUuidParam(req.params.id, 'id');
  const { reason } = checkSkipBody(req.body);
  res.json({ data: await logic.skipEntry(req.user, id, reason) });
});

router.post('/queue/slots/:slotId/close', ...instructor, async (req, res) => {
  const slotId = checkUuidParam(req.params.slotId, 'slotId');
  res.json({ data: await logic.closeQueue(req.user, slotId) });
});

// ---------------- QR check-in (#12), public: the token is the secret ----------------
router.get('/check-in/:token', async (req, res) => {
  res.json({ data: await logic.getCheckIn(req.params.token) });
});

router.post('/check-in/:token', async (req, res) => {
  res.json({ data: await logic.checkIn(req.params.token) });
});

// ---------------- Meeting history (#4) ----------------
router.get('/meetings', ...anyone, async (req, res) => {
  const filters = checkMeetingsQuery(req.query);
  res.json(await logic.listMeetings(req.user, filters));
});

router.get('/meetings/:id', ...anyone, async (req, res) => {
  const id = checkUuidParam(req.params.id, 'id');
  res.json({ data: await logic.getMeeting(req.user, id) });
});

router.patch('/meetings/:id/notes', ...anyone, async (req, res) => {
  const id = checkUuidParam(req.params.id, 'id');
  const { notes } = checkNotesBody(req.body);
  res.json({ data: await logic.saveNotes(req.user, id, notes) });
});

export default router;
