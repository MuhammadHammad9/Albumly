// Answers the browser's Supabase Auth requests inside the test, so account flows run without a
// real Supabase project. Tokens come from the accounts e2e API (port 5067), which signs them with
// a key pair made when it started, so our real server-side checks (signature, issuer, expiry) run.
export const FAKE_SUPABASE_URL = 'http://supabase.e2e.test'
const SESSION_URL = 'http://127.0.0.1:5067/__e2e/session'

// Every account test uses its own address, because all tests share one database
export const uniqueEmail = (testInfo, label = 'user') => `${label}-${testInfo.testId.slice(0, 8)}-${testInfo.workerIndex}-${Date.now()}@example.com`

// password: the only password the fake accepts. confirmEmail: sign-up answers "check your email".
export async function fakeSupabase(context, request, { password = 'correct-horse-1', confirmEmail = false } = {}) {
  let current = null // the session handed out last, for /user and refreshes

  const json = (route, status, body) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'x-supabase-api-version': '2024-01-01' }, body: JSON.stringify(body) })
  const newSession = async (email) => {
    const response = await request.post(SESSION_URL, { data: { email } })
    current = await response.json()
    return current
  }

  await context.route(`${FAKE_SUPABASE_URL}/auth/v1/**`, async (route) => {
    const req = route.request()
    const { pathname, searchParams } = new URL(req.url())
    const body = req.postDataJSON?.() ?? {}

    if (pathname.endsWith('/token') && searchParams.get('grant_type') === 'password') {
      if (body.password !== password) return json(route, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
      return json(route, 200, await newSession(body.email))
    }
    if (pathname.endsWith('/token') && searchParams.get('grant_type') === 'refresh_token') {
      return current ? json(route, 200, await newSession(current.user.email)) : json(route, 400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' })
    }
    if (pathname.endsWith('/signup')) {
      if (confirmEmail) return json(route, 200, { id: crypto.randomUUID(), aud: 'authenticated', role: '', email: body.email, confirmation_sent_at: new Date().toISOString(), app_metadata: {}, user_metadata: {}, identities: [] })
      return json(route, 200, await newSession(body.email))
    }
    if (pathname.endsWith('/user')) return current ? json(route, 200, current.user) : json(route, 401, { error_code: 'no_authorization', msg: 'No session' })
    if (pathname.endsWith('/logout')) return route.fulfill({ status: 204 })
    if (pathname.endsWith('/recover')) return json(route, 200, {})
    return json(route, 404, { msg: `Not faked: ${pathname}` })
  })
}

// Signs in through the real Account page form
export async function signIn(page, email, password = 'correct-horse-1') {
  await page.goto('/account')
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('main').getByRole('button', { name: 'Sign in', exact: true }).click()
}
