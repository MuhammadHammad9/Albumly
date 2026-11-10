import { expect, test } from '../fixtures.js'

test('home page loads with featured artists and the demo-mode note', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle('Albumly')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Find every album')
  await expect(page.getByRole('heading', { name: 'Featured artists' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Neon Harbor/ }).first()).toBeVisible()
  await expect(page.getByText('Demo mode: showing a sample catalogue')).toBeVisible()
  await expect(page.getByText('not affiliated with or endorsed by Spotify')).toBeVisible()
})

test('page has landmarks and a working skip link', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('main')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeAttached()
  await page.keyboard.press('Tab')
  const skip = page.getByRole('link', { name: 'Skip to content' })
  await expect(skip).toBeFocused()
  await skip.press('Enter')
  await expect(page).toHaveURL(/#main$/)
})

test('main navigation reaches every top-level page', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Main' }).first()
  await nav.getByRole('link', { name: 'Library' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Your library' })).toBeVisible()
  await nav.getByRole('link', { name: 'Compare' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Compare albums' })).toBeVisible()
  await nav.getByRole('link', { name: 'Search' }).click()
  // The empty search page has no h1 yet (noted in docs/security-review.md); check its prompt instead
  await expect(page.getByRole('heading', { name: 'Search artists, albums and tracks' })).toBeVisible()
  await nav.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('heading', { name: 'Featured artists' })).toBeVisible()
})
