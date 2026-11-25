// [S3] Sends "your turn", "meeting done" and "skipped" notifications through S2's notifications table (polled by the bell)
// When S2 exports a createNotification() helper, replace the insert below with a call to it.
import { supabase } from '../../shared/supabase.js';

// type must be one of the notification types allowed in schema.sql
export async function notify(recipientId, type, message, link = null) {
  const { error } = await supabase.from('notifications').insert({ recipient_id: recipientId, type, message, link });
  // A failed notification must never break the queue action itself, so only log it
  if (error) console.error(`[S3] notification for ${recipientId} failed: ${error.message}`);
}
