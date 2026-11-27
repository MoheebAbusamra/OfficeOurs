// Auth rules: student ID must exist in seed data, auto-fills group/modules/schedule, calls Supabase Auth
import { AppError } from '../../shared/errors.js';
import * as db from './db.js';
 
// GET /auth/me: the full user (also used at the end of register and login)
export async function getMe(universityId) {
  const person = await db.findPerson(universityId);
 
  // Start with the basic fields from the registry
  const user = {
    universityId: person.university_id,
    fullName: person.full_name,
    email: person.email,
    role: person.role,
    group: null,
    modules: [],
    schedule: [],
  };
 
  if (person.role === 'student') {
    // Students: group name, the group's modules and the weekly timetable
    user.group = await db.findGroupName(person.group_id);
 
    const moduleRows = await db.findGroupModules(person.group_id);
    for (const row of moduleRows) {
      user.modules.push(row.modules);
    }
 
    const scheduleRows = await db.findSchedule(person.group_id);
    for (const row of scheduleRows) {
      user.schedule.push({
        dayOfWeek: row.day_of_week,
        startTime: row.start_time.slice(0, 5), // the database gives "09:00:00", we send "09:00"
        endTime: row.end_time.slice(0, 5),
        kind: row.kind,
        module: row.modules,
      });
    }
  } else {
    // Instructors: only the modules they teach (no group, no timetable)
    const moduleRows = await db.findInstructorModules(person.university_id);
    for (const row of moduleRows) {
      user.modules.push(row.modules);
    }
  }
 
  return user;
}
 
// POST /auth/register
export async function register(universityId, password) {
  // 1. The ID must exist in the university registry
  const person = await db.findPerson(universityId);
  if (!person) {
    throw new AppError(404, 'NOT_FOUND', 'This university ID was not found. Check it or contact the registrar.');
  }
 
  // 2. The ID must not be registered already
  const profile = await db.findProfile(universityId);
  if (profile) {
    throw new AppError(409, 'ALREADY_REGISTERED', 'This ID is already registered. Log in instead.');
  }
 
  // 3. Create the login account with the email from the registry
  const { user, error } = await db.createAuthUser(person.email, password);
  if (error) {
    if (error.code === 'email_exists') {
      throw new AppError(409, 'ALREADY_REGISTERED', 'This ID is already registered. Log in instead.');
    }
    throw error;
  }
 
  // 4. Link the account to the university ID. If that fails, delete the account again
  //    so the student can simply try to register again.
  try {
    await db.createProfile(user.id, universityId);
  } catch (err) {
    await db.deleteAuthUser(user.id);
    throw err;
  }
 
  // 5. Return the full user (group, modules, schedule)
  return getMe(universityId);
}
 
// POST /auth/login
export async function login(universityId, password) {
  // 1. Find the email for this ID. Same message for "unknown ID" and "wrong password",
  //    so nobody can guess which IDs exist.
  const person = await db.findPerson(universityId);
  if (!person) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong university ID or password');
  }
 
  // 2. Supabase Auth checks the password and gives us a session
  const session = await db.signIn(person.email, password);
  if (!session) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong university ID or password');
  }
 
  // 3. Send back the token, when it expires, and the user
  return {
    token: session.access_token,
    expiresAt: new Date(session.expires_at * 1000).toISOString(), // expires_at is in seconds
    user: await getMe(universityId),
  };
}
 
// POST /auth/logout
export async function logout(token) {
  await db.signOut(token);
}
 