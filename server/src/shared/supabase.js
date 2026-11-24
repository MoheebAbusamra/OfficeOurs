// [Shared] One Supabase client (service role) used by every service's db.js
import { createClient } from '@supabase/supabase-js';

// The secret key skips RLS, so this client must only ever run on the server (never in the frontend)
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
