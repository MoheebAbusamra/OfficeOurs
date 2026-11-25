// [S1] Middleware: verifies the token from /auth/login (via Supabase on the server) and checks the role (student/instructor) (#A)
import { supabase } from './supabase.js';
import { AppError } from './errors.js';

const unauthorized = message => new AppError(401, 'UNAUTHORIZED', message);

// requireAuth: reads "Authorization: Bearer <token>", asks Supabase who it belongs to,
// then loads the registry person and puts req.user = { authId, universityId, fullName, email, role, groupId }
export async function requireAuth(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw unauthorized('Please log in first');

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) throw unauthorized('Your session has expired. Please log in again.');

    const { data: profile } = await supabase
      .from('profiles')
      .select('university_id, person:university_registry(university_id, full_name, email, role, group_id)')
      .eq('id', data.user.id)
      .maybeSingle();
    if (!profile?.person) throw unauthorized('No account is linked to this login');

    const p = profile.person;
    req.user = { authId: data.user.id, universityId: p.university_id, fullName: p.full_name, email: p.email, role: p.role, groupId: p.group_id };
    next();
  } catch (err) {
    next(err);
  }
}

// requireRole('instructor') or requireRole('student', 'instructor'); use after requireAuth
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user?.role)
    ? next()
    : next(new AppError(403, 'FORBIDDEN', `Only ${roles.join(' or ')}s can do this`));
