import { expect, test } from '../fixtures.js'
import { ARTISTS } from '../support/catalog.js'

// These tests cause errors on purpose; the app may log them
test.use({ allowConsoleErrors: true })

test('a failing catalogue shows a friendly error with Try again', async ({ page }) => {
  // The demo catalogue treats a search starting with "!error" as an upstream failure
  await page.goto('/search?q=!error')
  const alert = page.getByRole('alert')
  await expect(alert.getByRole('heading', { name: 'The music catalogue is unavailable' })).toBeVisible()
  await expect(alert.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('an unreachable API says so instead of showing a blank page', async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort('connectionrefused'))
  await page.goto('/')
  await expect(page.getByRole('alert').getByRole('heading', { name: "Can't reach Albumly" })).toBeVisible({ timeout: 10_000 })
  // The shell (navigation, search) still works
  await expect(page.getByRole('combobox', { name: 'Search artists, albums and tracks' })).toBeVisible()
})

test('a rate limit is explained, and the app does not retry straight away', async ({ page }) => {
  let calls = 0
  await page.route('**/api/featured', (route) => {
    calls += 1
    return route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'Retry-After': '3600' },
      body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests', retryAfter: 3600 } }),
    })
  })
  await page.goto('/')
  const alert = page.getByRole('alert')
  await expect(alert.getByRole('heading', { name: 'Spotify has paused Albumly for a while' })).toBeVisible()
  await expect(alert).toContainText('Try again in about 60 minutes')
  // A long wait hides Try again: pressing it could not help yet
  await expect(alert.getByRole('button', { name: 'Try again' })).toHaveCount(0)
  // No retry storm: once the message is shown, no more requests are sent. (In development,
  // React's StrictMode can mount the page twice, so the first load may make 2 calls.)
  const callsWhenShown = calls
  expect(callsWhenShown).toBeLessThanOrEqual(2)
  await page.waitForTimeout(2500)
  expect(calls).toBe(callsWhenShown)
})

test('an unknown address shows the 404 page inside the app', async ({ page }) => {
  await page.goto('/this/does/not/exist')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeAttached()
})

test('a slow API shows an announced loading state', async ({ page }) => {
  await page.route(`**/api/artists/${ARTISTS.maraVoss.id}`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  await page.goto(`/artist/${ARTISTS.maraVoss.id}`)
  await expect(page.getByRole('status').filter({ hasText: 'Loading artist' })).toBeAttached()
  await expect(page.getByRole('heading', { level: 1, name: ARTISTS.maraVoss.name })).toBeVisible()
})
