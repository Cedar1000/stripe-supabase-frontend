import { getToken } from '@clerk/react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Requests carry the signed-in user's Clerk session token (Supabase third-party auth).
export const supabase = createClient(supabaseUrl, supabaseKey, {
  accessToken: () => getToken(),
});
