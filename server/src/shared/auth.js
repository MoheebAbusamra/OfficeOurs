// [S1] Middleware: verifies the token from /auth/login (via Supabase on the server) and checks the role (student/instructor) (#A)
import { supabase } from './supabase.js';
import { AppError } from './errors.js';

// Put this before any route that needs a logged-in user. It fills req.user.
export async function requireAuth(req, res, next) {
  // 1. Read the token from the header "Authorization: Bearer <token>"
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new AppError(401, 'UNAUTHORIZED', 'Please log in first');

  // 2. Ask Supabase Auth which account this token belongs to
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new AppError(401, 'UNAUTHORIZED', 'Your session has expired. Please log in again');

  // 3. profiles links the login account to a university ID
  const { data: profile } = await supabase.from('profiles').select('university_id').eq('id', data.user.id).maybeSingle();
  if (!profile) throw new AppError(401, 'UNAUTHORIZED', 'No profile found for this account. Please register first');

  // 4. The registry gives the name, role and group
  const { data: person } = await supabase
    .from('university_registry')
    .select('university_id, full_name, email, role, group_id')
    .eq('university_id', profile.university_id)
    .single();

  req.user = {
    universityId: person.university_id,
    fullName: person.full_name,
    email: person.email,
    role: person.role,
    groupId: person.group_id,
    token,
  };
  next();
}

// Put this after requireAuth to allow only one role, e.g. requireRole('instructor')
export function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) throw new AppError(403, 'FORBIDDEN', `Only ${role}s can do this`);
    next();
  };
}
