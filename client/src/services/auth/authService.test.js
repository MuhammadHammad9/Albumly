import { expect, test, vi } from 'vitest'
import { createAuthService, describeAuthError } from './authService.js'

// A stand-in for Supabase's auth client with only what sign-up uses
function fakeClient({ signInError = null } = {}) {
  return {
    signUp: vi.fn(async () => ({ data: { session: null }, error: null })),
    signInWithPassword: vi.fn(async () => ({ error: signInError })),
  }
}

test('when our server creates the account, the browser signs straight in and no email is needed', async () => {
  const client = fakeClient()
  const auth = createAuthService({ loadClient: async () => client, signUpOnServer: async () => ({ ok: true }) })

  expect(await auth.signUp('new@example.com', 'long-enough-1')).toEqual({ ok: true, needsConfirmation: false })
  expect(client.signInWithPassword).toHaveBeenCalledWith({ email: 'new@example.com', password: 'long-enough-1' })
  expect(client.signUp).not.toHaveBeenCalled()
})

test('when the server leaves sign-up to Supabase, the confirmation email flow is used', async () => {
  const client = fakeClient()
  const auth = createAuthService({ loadClient: async () => client, signUpOnServer: async () => ({ unavailable: true }) })

  expect(await auth.signUp('new@example.com', 'long-enough-1')).toEqual({ ok: true, needsConfirmation: true })
  expect(client.signUp).toHaveBeenCalled()
})

test("the server's refusal is shown as it is, without trying Supabase", async () => {
  const client = fakeClient()
  const message = 'An account with this email already exists. Try signing in.'
  const auth = createAuthService({ loadClient: async () => client, signUpOnServer: async () => ({ ok: false, message }) })

  expect(await auth.signUp('a@example.com', 'long-enough-1')).toEqual({ ok: false, message })
  expect(client.signUp).not.toHaveBeenCalled()
})

test('if the connection drops after the account was created, signing in finishes the sign-up', async () => {
  const lost = { ok: false, lostConnection: true, message: "Can't reach Albumly." }
  const created = fakeClient()
  const auth = createAuthService({ loadClient: async () => created, signUpOnServer: async () => lost })
  expect(await auth.signUp('a@example.com', 'long-enough-1')).toEqual({ ok: true, needsConfirmation: false })

  // Not created: the connection message is shown, and Supabase's email sign-up is not tried
  const notCreated = fakeClient({ signInError: { code: 'invalid_credentials' } })
  const auth2 = createAuthService({ loadClient: async () => notCreated, signUpOnServer: async () => lost })
  expect(await auth2.signUp('a@example.com', 'long-enough-1')).toEqual({ ok: false, message: lost.message })
  expect(notCreated.signUp).not.toHaveBeenCalled()
})

test('unknown Supabase errors say what went wrong instead of a vague message', () => {
  expect(describeAuthError({ code: 'something_new', message: 'Database error saving new user' })).toBe(
    'Sign-in service error: Database error saving new user',
  )
  expect(describeAuthError({ code: 'over_email_send_rate_limit' })).toMatch(/as many emails as it can/)
})
