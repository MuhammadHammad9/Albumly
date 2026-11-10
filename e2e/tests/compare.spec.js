import { expect, test } from '../fixtures.js'
import { ALBUMS } from '../support/catalog.js'

test('Add to compare on one album, Compare with it on another', async ({ page }) => {
  await page.goto(`/album/${ALBUMS.glassArcade.id}`)
  await page.getByRole('link', { name: 'Add to compare' }).click()
  await expect(page).toHaveURL(new RegExp(`/compare\\?a=${ALBUMS.glassArcade.id}$`))
  await expect(page.getByText(`Compare with ${ALBUMS.glassArcade.name}”`, { exact: false })).toBeVisible()

  // Move to the second album without a full reload (the waiting album is kept in memory)
  await page.goBack()
  await page.getByRole('main').getByRole('link', { name: 'Neon Harbor', exact: true }).first().click()
  await page.getByRole('tabpanel').getByRole('link', { name: new RegExp(`^${ALBUMS.afterimage.name}`) }).click()
  await page.getByRole('link', { name: `Compare with ${ALBUMS.glassArcade.name}` }).click()

  await expect(page).toHaveURL(new RegExp(`a=${ALBUMS.glassArcade.id}&b=${ALBUMS.afterimage.id}`))
  await expect(page).toHaveTitle(`${ALBUMS.glassArcade.name} vs ${ALBUMS.afterimage.name} · Albumly`)
  const table = page.getByRole('table', { name: /Differences are album B minus album A/ })
  const tracksRow = table.getByRole('row', { name: /^Tracks \d/ })
  await expect(tracksRow).toContainText(String(ALBUMS.glassArcade.tracks))
  await expect(tracksRow).toContainText(String(ALBUMS.afterimage.tracks))
  await expect(tracksRow).toContainText('+10')
  // The chart is loaded lazily with its own heading
  await expect(page.getByRole('heading', { name: 'Track lengths in running order' })).toBeVisible()
})

test('Swap and Clear', async ({ page }) => {
  await page.goto(`/compare?a=${ALBUMS.glassArcade.id}&b=${ALBUMS.nightFerry.id}`)
  await expect(page.getByRole('table', { name: /Differences/ })).toBeVisible()
  await page.getByRole('button', { name: 'Swap' }).click()
  await expect(page).toHaveURL(new RegExp(`a=${ALBUMS.nightFerry.id}&b=${ALBUMS.glassArcade.id}`))
  await page.getByRole('button', { name: 'Clear both albums' }).click()
  await expect(page.getByRole('heading', { name: 'Choose two albums' })).toBeVisible()
})

test('an unknown album id shows an error in that slot only', async ({ page }) => {
  await page.goto(`/compare?a=${ALBUMS.glassArcade.id}&b=not-a-real-album`)
  await expect(page.getByRole('alert').filter({ hasText: 'Album B: This album is not in the catalogue.' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: ALBUMS.glassArcade.name })).toBeVisible()
})
