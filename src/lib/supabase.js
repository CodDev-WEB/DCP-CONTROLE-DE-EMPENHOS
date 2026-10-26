import { createClient } from '@supabase/supabase-js';

// Public browser configuration. Environment variables override these defaults.
// Publishable keys are designed for client-side use; protect all data with RLS.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://xowzltjsmebgckksizkh.supabase.co';
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'sb_publishable_fCRilDN3iDtGfKlUAvZANQ_H0mKsr_r';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
