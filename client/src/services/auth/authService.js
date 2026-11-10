// Sign-up, sign-in and sign-out, through Supabase Auth. The browser talks to Supabase directly for
// this (only for this: library data always goes through our own API). The auth library is only
// downloaded when accounts are configured, so it does not slow down the first page load.
import { AUTH_STORAGE_KEY, MIN_PASSWORD_LENGTH, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.js'

// The user id of a session saved by an earlier visit, read without loading the auth library.
// Lets a returning user see their account library immediately. null when there is none.
export function peekStoredUserId(storage = globalThis.localStorage) {
  try {
    const id = JSON.parse(storage.getItem(AUTH_STORAGE_KEY) ?? 'null')?.user?.id
    return typeof id === 'string' && id ? id : null
  } catch {
    return null
  }
}

// Supabase's error codes, in words a person understands
const MESSAGES = {
  invalid_credentials: 'That email and password do not match an account.',
  email_not_confirmed: 'Please confirm your email first: open the link we sent you.',
  user_already_exists: 'An account with this email already exists. Try signing in.',
  weak_password: `Choose a stronger password (at least ${MIN_PASSWORD_LENGTH} characters).`,
  over_email_send_rate_limit: 'Too many emails were sent just now. Please wait a few minutes and try again.',
  over_request_rate_limit: 'Too many attempts. Please wait a minute and try again.',
  email_address_invalid: 'That email address does not look right.',
  same_password: 'The new password must be different from the old one.',
  validation_failed: 'Please check the email address and password.',
}

export function describeAuthError(error) {
  if (!error) return 'Something went wrong. Please try again.'
  if (MESSAGES[error.code]) return MESSAGES[error.code]
  if (error.status === 0 || error.name === 'AuthRetryableFetchError') return "Can't reach the sign-in service. Check your connection and try again."
  if (error.status === 429) return MESSAGES.over_request_rate_limit
  return 'Something went wrong. Please try again.'
}

async function loadSupabaseClient() {
  const { AuthClient } = await import('@supabase/auth-js')
  return new AuthClient({
    url: `${SUPABASE_URL}/auth/v1`,
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
    storageKey: AUTH_STORAGE_KEY,
    persistSession: true,
    autoRefreshToken: true, // gets a fresh access token before the old one expires
    detectSessionInUrl: true, // picks up the tokens from email links (confirmation, password reset)
    flowType: 'implicit', // so a confirmation link also works when opened on another device
  })
}

const redirectUrl = () => `${globalThis.location?.origin ?? ''}/account`
const toUser = (user) => (user ? { id: user.id, email: user.email ?? null } : null)

// loadClient is swapped for a fake in tests
export function createAuthService({ loadClient = loadSupabaseClient } = {}) {
  let clientPromise = null
  const client = () => (clientPromise ??= loadClient())
  const fail = (error) => ({ ok: false, message: describeAuthError(error) })

  return {
    // Calls listener(event, user) for every change: SIGNED_IN, SIGNED_OUT, PASSWORD_RECOVERY, ...
    async onChange(listener) {
      const auth = await client()
      auth.onAuthStateChange((event, session) => {
        // Supabase advises not to await other work inside this callback
        setTimeout(() => listener(event, toUser(session?.user)), 0)
      })
    },

    async currentUser() {
      const { data } = await (await client()).getSession()
      return toUser(data.session?.user)
    },

    async signUp(email, password) {
      const { data, error } = await (await client()).signUp({ email, password, options: { emailRedirectTo: redirectUrl() } })
      if (error) return fail(error)
      // No session yet means "check your email". (Supabase answers the same way for an email that
      // is already registered, so nobody can find out who has an account.)
      return { ok: true, needsConfirmation: !data.session }
    },

    async signIn(email, password) {
      const { error } = await (await client()).signInWithPassword({ email, password })
      return error ? fail(error) : { ok: true }
    },

    // scope 'local' signs out this browser only
    async signOut() {
      const { error } = await (await client()).signOut({ scope: 'local' })
      return error ? fail(error) : { ok: true }
    },

    async resetPassword(email) {
      const { error } = await (await client()).resetPasswordForEmail(email, { redirectTo: redirectUrl() })
      return error ? fail(error) : { ok: true }
    },

    async updatePassword(password) {
      const { error } = await (await client()).updateUser({ password })
      return error ? fail(error) : { ok: true }
    },

    // A valid access token for our API (refreshed first if it was about to expire), or null
    async getAccessToken() {
      const { data } = await (await client()).getSession()
      return data.session?.access_token ?? null
    },

    // Forces a new access token; null when the session cannot be renewed (it has ended)
    async refresh() {
      const { data, error } = await (await client()).refreshSession()
      return error ? null : (data.session?.access_token ?? null)
    },
  }
}
