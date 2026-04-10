import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Browser / client-side client (uses anon key + RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Server-side admin client (bypasses RLS — server only)
export const supabaseAdmin = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Helper for API routes — just returns admin client
// (auth is handled via token passed in Authorization header)
export function createSupabaseServer(req, res) {
  return supabaseAdmin
}
