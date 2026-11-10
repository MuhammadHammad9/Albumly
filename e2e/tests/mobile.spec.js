import { expect, test } from '../fixtures.js'
import { ALBUMS, ARTISTS } from '../support/catalog.js'

// Runs only in the "mobile" project (Pixel 7 size), because of the @mobile tag
test.describe('@mobile', () => {
  test('bottom navigation works', async ({ page }) => {
    await page.goto('/')
    const nav = page.getByRole('navigation', { name: 'Main' }).locator('visible=true')
    await expect(nav).toHaveCount(1)
    await nav.getByRole('link', { name: 'Library' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Your library' })).toBeVisible()
    await nav.getByRole('link', { name: 'Compare' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Compare albums' })).toBeVisible()
  })

  for (const [name, path, heading] of [
    ['home', '/', /Find every album/],
    ['artist', `/artist/${ARTISTS.neonHarbor.id}`, ARTISTS.neonHarbor.name],
    ['album', `/album/${ALBUMS.afterimage.id}`, ALBUMS.afterimage.name],
    ['library', '/library', 'Your library'],
  ]) {
    test(`no sideways scrolling on the ${name} page`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(0)
    })
  }
})
