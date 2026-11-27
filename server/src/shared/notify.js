// Saves an in-app notification; the bell polls GET /notifications (#3)
// Any service can use it:  await notify('241339', 'queue_called', 'You are next', '/student/queue/<id>')
import { supabase } from './supabase.js';

// type must be one of the types allowed in schema.sql:
// request_created, request_updated, request_confirmed, request_rejected, request_cancelled,
// slot_changed, slot_cancelled, queue_called, meeting_completed
export async function notify(recipientId, type, message, link = null) {
  const { error } = await supabase.from('notifications').insert({ recipient_id: recipientId, type, message, link });
  // A lost bell message must never undo the action that caused it, so we only log the problem
  if (error) console.error(`[notify] could not notify ${recipientId}:`, error.message);
}
