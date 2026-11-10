import { expect, test } from '../fixtures.js'
import { ALBUMS } from '../support/catalog.js'

test('album page shows details, duration and the tracklist', async ({ page }) => {
  await page.goto(`/album/${ALBUMS.glassArcade.id}`)
  await expect(page.getByRole('heading', { level: 1, name: ALBUMS.glassArcade.name })).toBeVisible()
  await expect(page).toHaveTitle(`${ALBUMS.glassArcade.name} · Albumly`)
  await expect(page.getByRole('img', { name: `${ALBUMS.glassArcade.name} by Neon Harbor cover` })).toBeVisible()
  await expect(page.getByText(`${ALBUMS.glassArcade.tracks} tracks`)).toBeVisible()
  const tracklist = page.getByRole('region', { name: 'Tracklist' })
  const spotifyLinks = tracklist.getByRole('link', { name: /^Open .* on Spotify$/ })
  await expect(spotifyLinks).toHaveCount(ALBUMS.glassArcade.tracks)
  // External links never tell Spotify which page the visitor came from
  for (const link of await spotifyLinks.all()) await expect(link).toHaveAttribute('rel', /noreferrer/)
})

test('artist link goes back to the artist page', async ({ page }) => {
  await page.goto(`/album/${ALBUMS.glassArcade.id}`)
  await page.getByRole('main').getByRole('link', { name: 'Neon Harbor', exact: true }).first().click()
  await expect(page.getByRole('heading', { level: 1, name: 'Neon Harbor' })).toBeVisible()
})

test('find a track filters a two-disc tracklist', async ({ page }) => {
  await page.goto(`/album/${ALBUMS.afterimage.id}`)
  const tracklist = page.getByRole('region', { name: 'Tracklist' })
  await expect(tracklist.getByRole('heading', { name: 'Disc 1' })).toBeVisible()
  await expect(tracklist.getByRole('heading', { name: 'Disc 2' })).toBeVisible()

  const filter = page.getByRole('searchbox', { name: 'Filter tracks by title or artist' })
  await filter.fill('kite')
  await expect(page.getByRole('status').filter({ hasText: `of ${ALBUMS.afterimage.tracks} tracks` })).toBeVisible()
  await filter.fill('zzzz')
  await expect(page.getByRole('heading', { name: 'No tracks match “zzzz”' })).toBeVisible()
})

test('unknown album shows a not-found page', async ({ page }) => {
  await page.goto('/album/neon-harbor--does-not-exist')
  await expect(page.getByRole('heading', { name: 'Album not found' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to home' }).click()
  await expect(page.getByRole('heading', { name: 'Featured artists' })).toBeVisible()
})

test('unknown artist shows a not-found page', async ({ page }) => {
  await page.goto('/artist/nobody-at-all')
  await expect(page.getByRole('heading', { name: 'Artist not found' })).toBeVisible()
})
