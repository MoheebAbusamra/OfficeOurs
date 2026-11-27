// Supabase queries only (create/read/update/delete/search)
import { supabase } from '../../shared/supabase.js';

// ------------------------------------------------------------------ FAQ (#13)

const FAQ_COLUMNS = 'id, instructor_id, module_id, question, answer, created_at, updated_at';

// The FAQs of one instructor, newest first. moduleId and q (search text) are optional.
export async function findFaqs(filters) {
  let query = supabase.from('faqs').select(FAQ_COLUMNS).eq('instructor_id', filters.instructorId);

  if (filters.moduleId) query = query.eq('module_id', filters.moduleId);
  // ilike = case-insensitive "contains"; or(...) = match the question OR the answer
  if (filters.q) query = query.or(`question.ilike.%${filters.q}%,answer.ilike.%${filters.q}%`);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// One FAQ by id, or null
export async function findFaqById(id) {
  const { data, error } = await supabase.from('faqs').select(FAQ_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Saves a new FAQ and returns it
export async function insertFaq(faq) {
  const { data, error } = await supabase.from('faqs').insert(faq).select(FAQ_COLUMNS).single();
  if (error) throw error;
  return data;
}

// Changes some columns of an FAQ and returns the updated FAQ (updated_at is set by a trigger)
export async function updateFaq(id, changes) {
  const { data, error } = await supabase.from('faqs').update(changes).eq('id', id).select(FAQ_COLUMNS).single();
  if (error) throw error;
  return data;
}

// Removes an FAQ for good
export async function deleteFaq(id) {
  const { error } = await supabase.from('faqs').delete().eq('id', id);
  if (error) throw error;
}

// ------------------------------------------------------------------ Requests (#2, #5, #6, #9)

// The columns we read for a request. The parts in brackets join other tables through foreign keys:
//   university_registry(...)  the student (requests.student_id)
//   slots(...)                the slot, with its instructor and module (scheduling table, read only)
//   queue_entries(...)        the queue entry once the request is queued (queue table, read only)
// "!name_fkey" tells Supabase which foreign key to follow, because requests and slots are also
// linked through the queue_entries and meetings tables
const REQUEST_COLUMNS = `
  id, student_id, slot_id, title, description, preferred_start, preferred_end, priority, status,
  faq_suggestion, opened_at, status_reason, cancelled_by, created_at, updated_at,
  university_registry!requests_student_id_fkey(university_id, full_name),
  slots!requests_slot_id_fkey(id, instructor_id, module_id, slot_date, start_time, end_time, location, capacity, status,
        university_registry!slots_instructor_id_fkey(university_id, full_name),
        modules(id, code, name)),
  queue_entries!queue_entries_request_id_fkey(id, status)
`;

// Ids of all slots of one instructor (to find the requests of their inbox)
export async function findSlotIdsOfInstructor(instructorId) {
  const { data, error } = await supabase.from('slots').select('id').eq('instructor_id', instructorId);
  if (error) throw error;
  return data.map((row) => row.id);
}

// Requests with optional filters. Only the filters that are given are added to the query.
export async function findRequests(filters) {
  let query = supabase.from('requests').select(REQUEST_COLUMNS);

  if (filters.studentId) query = query.eq('student_id', filters.studentId);
  if (filters.slotIds) query = query.in('slot_id', filters.slotIds);
  if (filters.slotId) query = query.eq('slot_id', filters.slotId);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.priority) query = query.eq('priority', filters.priority);
  if (filters.unopened) query = query.is('opened_at', null);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// One request by id, or null
export async function findRequestById(id) {
  const { data, error } = await supabase.from('requests').select(REQUEST_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// The confirmed requests of these slots (only slot_id, to count the taken seats per slot)
export async function findConfirmedRequests(slotIds) {
  const { data, error } = await supabase
    .from('requests')
    .select('slot_id')
    .eq('status', 'confirmed')
    .in('slot_id', slotIds);
  if (error) throw error;
  return data;
}

// Saves a new request and returns it.
// A second active request for the same slot breaks the unique index -> error code 23505 (handled in logic.js)
export async function insertRequest(request) {
  const { data, error } = await supabase.from('requests').insert(request).select(REQUEST_COLUMNS).single();
  if (error) throw error;
  return data;
}

// Changes some columns of a request and returns it (updated_at is set by a trigger).
// "expected" makes the change safe when two people click at the same time: the row is only changed
// if it is still in that state, e.g. { status: 'pending', unopened: true }. Returns null if it was not.
export async function updateRequest(id, changes, expected = {}) {
  let query = supabase.from('requests').update(changes).eq('id', id);
  if (expected.status) query = query.eq('status', expected.status);
  if (expected.unopened) query = query.is('opened_at', null);

  const { data, error } = await query.select(REQUEST_COLUMNS).maybeSingle();
  if (error) throw error;
  return data;
}

// ------------------------------------------------------------------ Notifications (#3)
// (new notifications are saved by shared/notify.js, so every service can create them)

const NOTIFICATION_COLUMNS = 'id, recipient_id, type, message, link, is_read, created_at';

// One page of a user's notifications, newest first, plus the total number that match.
// range(from, to) = rows number "from" to "to" (counting from 0); count: 'exact' also returns the total.
export async function findNotifications(filters) {
  let query = supabase
    .from('notifications')
    .select(NOTIFICATION_COLUMNS, { count: 'exact' })
    .eq('recipient_id', filters.recipientId);

  if (filters.unreadOnly) query = query.eq('is_read', false);
  if (filters.since) query = query.gt('created_at', filters.since); // gt = greater than (newer than)

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(filters.from, filters.to);
  if (error) throw error;
  return { rows: data, total: count };
}

// How many unread notifications a user has (head: true = only count, no rows)
export async function countUnreadNotifications(recipientId) {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', recipientId)
    .eq('is_read', false);
  if (error) throw error;
  return count;
}

// One notification by id, or null
export async function findNotificationById(id) {
  const { data, error } = await supabase.from('notifications').select(NOTIFICATION_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

// Marks one notification as read and returns it
export async function markNotificationRead(id) {
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', id)
    .select(NOTIFICATION_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

// Marks all unread notifications of a user as read and returns how many changed
export async function markAllNotificationsRead(recipientId) {
  const { data, error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('recipient_id', recipientId)
    .eq('is_read', false)
    .select('id');
  if (error) throw error;
  return data.length;
}
