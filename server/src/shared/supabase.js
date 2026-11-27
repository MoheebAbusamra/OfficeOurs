// One Supabase client (service role) used by every service's db.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;

if (!url || !key) console.warn('SUPABASE_URL or SUPABASE_SECRET_KEY is missing: database calls will fail');

// The secret key bypasses RLS, so this client must only ever run on the server
export const supabase = createClient(url || 'http://localhost', key || 'missing', {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Turns a Supabase { data, error } result into data, or throws so the error handler returns 500
export function unwrap({ data, error }) {
  if (error) {
    const err = new Error(`Database error: ${error.message}`);
    err.dbCode = error.code; // e.g. 23505 = unique violation
    throw err;
  }
  return data;
}
