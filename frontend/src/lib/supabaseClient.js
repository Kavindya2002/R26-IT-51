import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If env vars aren't set, we export null and every calling site checks
// for that — so the rest of the app (and the Analyzer specifically)
// keeps working even before you've created a Supabase project.
export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

export const isDatabaseConfigured = Boolean(supabase);
