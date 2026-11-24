// [S1] Supabase queries for auth: look up student ID in the registry, create/read user profile
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../../shared/supabase.js';
 
// One person from the seeded registry, or null if the ID does not exist
export async function findPerson(universityId) {
  const { data, error } = await supabase
    .from('university_registry')
    .select('university_id, full_name, email, role, group_id')
    .eq('university_id', universityId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
 
// The profile row for a university ID, or null if this ID has not registered yet
export async function findProfile(universityId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, university_id')
    .eq('university_id', universityId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
 
// Creates the login account in Supabase Auth (email_confirm: true = no confirmation email)
// Returns { user, error } so logic.js can decide what the error means
export async function createAuthUser(email, password) {
  const { data, error } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  return { user: data.user, error };
}
 
// Removes a login account again (used only if saving the profile fails)
export async function deleteAuthUser(userId) {
  await supabase.auth.admin.deleteUser(userId);
}
 
// Links the login account (auth.users.id) to the university ID
export async function createProfile(userId, universityId) {
  const { error } = await supabase.from('profiles').insert({ id: userId, university_id: universityId });
  if (error) throw error;
}
 
// Checks email + password and returns a session (token), or null if they are wrong.
// We make a NEW client here on purpose: signing in on the shared client would switch it
// to this user's session, and then every other query in the app would run as this user.
export async function signIn(email, password) {
  const loginClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await loginClient.auth.signInWithPassword({ email, password });
  if (error) return null;
  return data.session;
}
 
// Ends the session that belongs to this token
export async function signOut(token) {
  await supabase.auth.admin.signOut(token);
}
 
// Group name, e.g. "CS-Y3-G1"
export async function findGroupName(groupId) {
  const { data, error } = await supabase.from('groups').select('name').eq('id', groupId).single();
  if (error) throw error;
  return data.name;
}
 
// Modules a student group studies. "modules(id, code, name)" joins the modules table
export async function findGroupModules(groupId) {
  const { data, error } = await supabase
    .from('group_modules')
    .select('modules(id, code, name)')
    .eq('group_id', groupId)
    .order('module_id');
  if (error) throw error;
  return data;
}
 
// Modules an instructor teaches
export async function findInstructorModules(instructorId) {
  const { data, error } = await supabase
    .from('instructor_modules')
    .select('modules(id, code, name)')
    .eq('instructor_id', instructorId)
    .order('module_id');
  if (error) throw error;
  return data;
}
 
// Weekly timetable of a student group, sorted by day then start time
export async function findSchedule(groupId) {
  const { data, error } = await supabase
    .from('schedule_entries')
    .select('day_of_week, start_time, end_time, kind, modules(id, code, name)')
    .eq('group_id', groupId)
    .order('day_of_week')
    .order('start_time');
  if (error) throw error;
  return data;
}
 