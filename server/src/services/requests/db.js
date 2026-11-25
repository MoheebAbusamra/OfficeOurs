// [S2] Supabase queries only (create/read/update/delete/search)
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
