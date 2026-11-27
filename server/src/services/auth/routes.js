// Auth endpoints: POST /auth/register, POST /auth/login, POST /auth/logout, GET /auth/me
import { Router } from 'express';
import { requireAuth } from '../../shared/auth.js';
import { validateRegister, validateLogin } from './validation.js';
import { register, login, logout, getMe } from './logic.js';
 
const router = Router();
 
// Register with a university ID (no token needed)
router.post('/auth/register', async (req, res) => {
  const body = req.body || {}; // body is empty if the request sent no JSON
  validateRegister(body);
  const user = await register(body.universityId.trim(), body.password);
  res.status(201).json({ data: user });
});
 
// Log in with university ID + password (no token needed)
router.post('/auth/login', async (req, res) => {
  const body = req.body || {};
  validateLogin(body);
  const result = await login(body.universityId.trim(), body.password);
  res.json({ data: result });
});
 
// Log out: ends the session of the token that was sent
router.post('/auth/logout', requireAuth, async (req, res) => {
  await logout(req.user.token);
  res.status(204).end();
});
 
// The logged-in user with group, modules and schedule
router.get('/auth/me', requireAuth, async (req, res) => {
  const user = await getMe(req.user.universityId);
  res.json({ data: user });
});
 
export default router;
 