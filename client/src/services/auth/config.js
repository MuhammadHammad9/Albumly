// Account settings from client/.env.local. Both values are PUBLIC (they end up in the browser):
// the project address and the publishable key. Without them the app runs without accounts.
const env = import.meta.env

export const SUPABASE_URL = (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
export const SUPABASE_PUBLISHABLE_KEY = (env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
export const accountsEnabled = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)

// Where Supabase Auth keeps the session (access + refresh token) in localStorage
export const AUTH_STORAGE_KEY = 'albumly:auth'

export const MIN_PASSWORD_LENGTH = 8
