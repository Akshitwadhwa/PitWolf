import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// The anon key is intentionally public. Row Level Security and the user's
// short-lived session token decide what this browser is allowed to write.
export const supabase = url && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true } })
  : null

export async function historyAccessToken() {
  if (!supabase) {
    throw new Error('Supabase is not configured in frontend/.env.')
  }

  const { data: existing, error: existingError } = await supabase.auth.getSession()
  if (existingError) throw existingError
  if (existing.session?.access_token) return existing.session.access_token

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) {
    throw new Error('Enable Anonymous Sign-Ins in Supabase Auth, then try the upload again.')
  }
  if (!data.session?.access_token) throw new Error('Supabase did not return a session token.')
  return data.session.access_token
}

export const isHistoryConfigured = Boolean(supabase)
