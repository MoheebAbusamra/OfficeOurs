// [S1] Supabase queries only (create/read/update/delete/search)
import { supabase } from '../../shared/supabase.js';
 
// The columns we read for a slot. "university_registry(...)" and "modules(...)" join the
// instructor's name and the module, using the foreign keys instructor_id and module_id.
const SLOT_COLUMNS = `
  id, instructor_id, module_id, slot_date, start_time, end_time, location, capacity, status,
  university_registry(university_id, full_name),
  modules(id, code, name)
`;
 
// Modules a student group studies
export async function findModulesOfGroup(groupId) {
  const { data, error } = await supabase
    .from('group_modules')
    .select('modules(id, code, name)')
    .eq('group_id', groupId)
    .order('module_id');
  if (error) throw error;
  return data;
}
 
// Modules an instructor teaches
export async function findModulesOfInstructor(instructorId) {
  const { data, error } = await supabase
    .from('instructor_modules')
    .select('modules(id, code, name)')
    .eq('instructor_id', instructorId)
    .order('module_id');
  if (error) throw error;
  return data;
}
 
// Who teaches which module, for a list of module ids, e.g. [1, 2, 3]
export async function findTeachersOfModules(moduleIds) {
  const { data, error } = await supabase
    .from('instructor_modules')
    .select('module_id, university_registry(university_id, full_name)')
    .in('module_id', moduleIds);
  if (error) throw error;
  return data;
}
 
// Slots with optional filters. Only the filters that are given are added to the query.
export async function findSlots(filters) {
  let query = supabase.from('slots').select(SLOT_COLUMNS);
 
  if (filters.instructorId) query = query.eq('instructor_id', filters.instructorId);
  if (filters.moduleId) query = query.eq('module_id', filters.moduleId);
  if (filters.from) query = query.gte('slot_date', filters.from); // gte = greater than or equal
  if (filters.to) query = query.lte('slot_date', filters.to); // lte = less than or equal
  if (filters.status) query = query.eq('status', filters.status);
 
  const { data, error } = await query.order('slot_date').order('start_time');
  if (error) throw error;
  return data;
}
 
// One slot by id, or null
export async function findSlotById(id) {
  const { data, error } = await supabase.from('slots').select(SLOT_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}
 
// The confirmed requests of these slots (we only need slot_id to count them per slot)
export async function findConfirmedRequests(slotIds) {
  const { data, error } = await supabase
    .from('requests')
    .select('slot_id')
    .eq('status', 'confirmed')
    .in('slot_id', slotIds);
  if (error) throw error;
  return data;
}
 
// Weekly timetable of a student group (lectures, labs, tutorials)
export async function findSchedule(groupId) {
  const { data, error } = await supabase
    .from('schedule_entries')
    .select('day_of_week, start_time, end_time')
    .eq('group_id', groupId);
  if (error) throw error;
  return data;
}
 
// Public holidays from a date onwards (the table is filled by GET /holidays in step 5)
export async function findHolidayDates(fromDate) {
  const { data, error } = await supabase.from('holidays').select('holiday_date').gte('holiday_date', fromDate);
  if (error) throw error;
  return data;
}
 