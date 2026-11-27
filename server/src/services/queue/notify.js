// Sends "your turn", "meeting done" and "skipped" notifications through the notifications table (polled by the bell)
// The shared notify() helper (shared/notify.js) does the same insert.
import { supabase } from '../../shared/supabase.js';

// type must be one of the notification types allowed in schema.sql
export async function notify(recipientId, type, message, link = null) {
  const { error } = await supabase.from('notifications').insert({ recipient_id: recipientId, type, message, link });
  // A failed notification must never break the queue action itself, so only log it
  if (error) console.error(`[S3] notification for ${recipientId} failed: ${error.message}`);
}
