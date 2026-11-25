// [S3] Supabase queries only (create/read/update/delete/search)
import { supabase, unwrap } from '../../shared/supabase.js';

// Columns we read with every queue entry: the request title and the student's name and email
const ENTRY_COLS = `id, slot_id, request_id, position, status, qr_token, checked_in_at, called_at, finished_at, created_at,
  request:requests(id, title, status, preferred_start, preferred_end, student_id,
    student:university_registry(university_id, full_name, email))`;

const SLOT_COLS = `id, instructor_id, module_id, slot_date, start_time, end_time, location, capacity, status,
  instructor:university_registry(university_id, full_name, email),
  module:modules(id, code, name)`;

const MEETING_COLS = `id, request_id, slot_id, student_id, instructor_id, started_at, ended_at, instructor_notes, student_notes, created_at,
  request:requests(title),
  slot:slots!inner(slot_date, module_id, module:modules(id, code, name)),
  student:university_registry!meetings_student_id_fkey(university_id, full_name),
  instructor:university_registry!meetings_instructor_id_fkey(university_id, full_name)`;

// ---------------- Slots and requests (read only, owned by S1 and S2) ----------------
export const getSlot = async slotId =>
  unwrap(await supabase.from('slots').select(SLOT_COLS).eq('id', slotId).maybeSingle());

// The request with its slot, used when a confirmed request is added to the queue
export const getRequestWithSlot = async requestId =>
  unwrap(await supabase.from('requests')
    .select(`id, title, status, preferred_start, preferred_end, student_id,
      student:university_registry(university_id, full_name, email), slot:slots(${SLOT_COLS})`)
    .eq('id', requestId).maybeSingle());

// S3 closes the request lifecycle: confirmed -> completed when the meeting is done
export const setRequestCompleted = async requestId =>
  unwrap(await supabase.from('requests').update({ status: 'completed' }).eq('id', requestId).eq('status', 'confirmed'));

// ---------------- Queue entries ----------------
export const getEntryById = async id =>
  unwrap(await supabase.from('queue_entries').select(ENTRY_COLS).eq('id', id).maybeSingle());

export const getEntryByRequest = async requestId =>
  unwrap(await supabase.from('queue_entries').select(ENTRY_COLS).eq('request_id', requestId).maybeSingle());

export const getEntryByToken = async token =>
  unwrap(await supabase.from('queue_entries').select(ENTRY_COLS).eq('qr_token', token).maybeSingle());

export const listSlotEntries = async slotId =>
  unwrap(await supabase.from('queue_entries').select(ENTRY_COLS).eq('slot_id', slotId).order('position'));

// Highest position used in a slot (0 if empty); the next student gets this + 1
export async function maxPosition(slotId) {
  const rows = unwrap(await supabase.from('queue_entries').select('position').eq('slot_id', slotId)
    .order('position', { ascending: false }).limit(1));
  return rows[0]?.position || 0;
}

// Insert a new entry. A clash on (slot_id, position) or request_id comes back as dbCode 23505
export const insertEntry = async row =>
  unwrap(await supabase.from('queue_entries').insert(row).select(ENTRY_COLS).single());

// Update only if the entry is still in one of the expected statuses (protects against double clicks).
// Returns the updated row, or null if someone else changed it first.
export const updateEntryIfStatus = async (id, fromStatuses, patch) =>
  unwrap(await supabase.from('queue_entries').update(patch).eq('id', id).in('status', fromStatuses)
    .select(ENTRY_COLS).maybeSingle());

// Check-in: only sets checked_in_at if it is still empty, so a QR code works once
export const markCheckedIn = async (id, at) =>
  unwrap(await supabase.from('queue_entries').update({ checked_in_at: at }).eq('id', id).is('checked_in_at', null)
    .select('id, checked_in_at').maybeSingle());

// Students still in front: waiting or in a meeting with a smaller position
export async function countAhead(slotId, position) {
  const { count, error } = await supabase.from('queue_entries').select('id', { count: 'exact', head: true })
    .eq('slot_id', slotId).in('status', ['waiting', 'in_meeting']).lt('position', position);
  if (error) throw new Error(`Database error: ${error.message}`);
  return count || 0;
}

// ---------------- Meetings (history) ----------------
export async function insertMeeting(row) {
  const { data, error } = await supabase.from('meetings').insert(row).select('id').single();
  if (error?.code === '23505') return null; // already recorded (unique request_id), nothing to do
  if (error) throw new Error(`Database error: ${error.message}`);
  return data;
}

// Last 20 finished meetings of an instructor, used for the wait estimate
export const recentMeetingTimes = async instructorId =>
  unwrap(await supabase.from('meetings').select('started_at, ended_at').eq('instructor_id', instructorId)
    .not('ended_at', 'is', null).order('started_at', { ascending: false }).limit(20));

// Search: own meetings, optional module and slot date range. Text search runs in logic.js
export async function listMeetings({ column, universityId, moduleId, from, to }) {
  let query = supabase.from('meetings').select(MEETING_COLS).eq(column, universityId)
    .order('started_at', { ascending: false });
  if (moduleId) query = query.eq('slot.module_id', moduleId);
  if (from) query = query.gte('slot.slot_date', from);
  if (to) query = query.lte('slot.slot_date', to);
  return unwrap(await query);
}

export const getMeeting = async id =>
  unwrap(await supabase.from('meetings').select(MEETING_COLS).eq('id', id).maybeSingle());

export const updateMeetingNotes = async (id, column, notes) =>
  unwrap(await supabase.from('meetings').update({ [column]: notes }).eq('id', id).select(MEETING_COLS).single());
