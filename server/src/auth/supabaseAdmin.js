// The two calls our server makes to Supabase Auth's HTTP API. The secret key goes only in
// these request headers: it is never logged and never sent to the browser.

export function createAuthAdmin({ supabaseUrl, secretKey, fetch = globalThis.fetch }) {
  const base = new URL('/auth/v1/', supabaseUrl)
  const keyHeaders = { apikey: secretKey, Authorization: `Bearer ${secretKey}` }

  return {
    // Removes the account itself. Our tables point at it with ON DELETE CASCADE, so any rows
    // still left go with it. "Already gone" (404) counts as done, so a retry is safe.
    async deleteUser(userId) {
      const response = await fetch(new URL(`admin/users/${encodeURIComponent(userId)}`, base), { method: 'DELETE', headers: keyHeaders })
      if (!response.ok && response.status !== 404) throw new Error(`Supabase Auth answered ${response.status} when deleting a user`)
    },

    // Asks Supabase Auth who owns a token. Only used for old HS256 tokens (see verifyToken.js).
    // Returns null when Supabase says the token is not valid.
    async getUser(token) {
      const response = await fetch(new URL('user', base), { headers: { apikey: secretKey, Authorization: `Bearer ${token}` } })
      if (response.status === 401 || response.status === 403) return null
      if (!response.ok) throw new Error(`Supabase Auth answered ${response.status}`)
      const user = await response.json()
      return { id: user.id, email: user.email ?? null }
    },
  }
}
