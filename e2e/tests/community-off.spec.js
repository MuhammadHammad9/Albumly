import { expect, test } from '../fixtures.js'

// With accounts off (no Supabase settings), the account-only pages explain themselves and do not
// even ask the server. The fixture fails a test on any console error, so a 503 would show up here.

test('Battles explains that it needs accounts', async ({ page }) => {
  await page.goto('/battles')
  await expect(page.getByRole('heading', { level: 1, name: 'Album Battle' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Battles need accounts' })).toBeVisible()
})

test('Admin explains that it needs accounts', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admin needs accounts' })).toBeVisible()
})

test('a shared link says sharing is not set up', async ({ page }) => {
  const calls = []
  page.on('request', (request) => request.url().includes('/api/public/') && calls.push(request.url()))
  await page.goto('/shared/late-night-drives-k3x9q2mw')
  await expect(page.getByRole('heading', { name: "Sharing isn't set up on this server" })).toBeVisible()
  expect(calls).toEqual([])
})

test('the Account page says accounts are not set up', async ({ page }) => {
  await page.goto('/account')
  await expect(page.getByRole('heading', { name: "Accounts aren't set up on this server." })).toBeVisible()
})

test('collection pages have no share panel without accounts', async ({ page }) => {
  await page.goto('/library?view=collections')
  await page.getByRole('textbox', { name: 'New collection name' }).fill('Road trip')
  await page.getByRole('button', { name: 'Create collection' }).click()
  await page.getByRole('link', { name: /Road trip/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Road trip' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Share' })).toHaveCount(0)
})
