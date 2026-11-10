import { expect, test } from '../fixtures.js'
import { ALBUMS, ARTISTS } from '../support/catalog.js'
import { libraryWith, seedLibrary, snapshot } from '../support/library.js'

// Recommendations, insights, calendar, connections and eras, all computed by Albumly from the
// library and the demo catalogue (no Spotify)

const maraAlbum = snapshot(ALBUMS.paperMoons, ARTISTS.maraVoss, 2016)
function seededLibrary() {
  const library = libraryWith([snapshot(ALBUMS.glassArcade), snapshot(ALBUMS.nightFerry, undefined, 2018), maraAlbum])
  library.entries[ALBUMS.glassArcade.id] = { ...library.entries[ALBUMS.glassArcade.id], status: 'listened', rating: 9, tags: ['late night'] }
  library.entries[ALBUMS.nightFerry.id] = { ...library.entries[ALBUMS.nightFerry.id], status: 'favourite', rating: 7 }
  return library
}

test('Discover asks for some taste first', async ({ page }) => {
  await page.goto('/discover')
  await expect(page.getByRole('heading', { level: 1, name: 'Discover' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Discover' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tell Albumly what you like' })).toBeVisible()
})

test('recommendations leave out saved albums and give a reason for each', async ({ page }) => {
  await seedLibrary(page, seededLibrary())
  await page.goto('/discover')
  const section = page.getByRole('region', { name: 'Recommended for you' })
  const reasons = section.getByRole('list', { name: /^Why .* is recommended$/ })
  await expect(reasons.first()).toBeVisible()
  expect(await reasons.count()).toBeGreaterThan(0)
  for (const list of await reasons.all()) await expect(list.getByRole('listitem').first()).toBeVisible()
  // Saved albums are never recommended back
  for (const owned of [ALBUMS.glassArcade.name, ALBUMS.nightFerry.name, ALBUMS.paperMoons.name]) {
    await expect(section.getByRole('heading', { level: 3, name: owned, exact: true })).toHaveCount(0)
  }
})

test('insights describe the library, not listening stats', async ({ page }) => {
  await seedLibrary(page, seededLibrary())
  await page.goto('/discover/insights')
  await expect(page.getByRole('heading', { level: 1, name: 'Your Albumly library' })).toBeVisible()
  await expect(page.getByText('These are not Spotify listening stats.')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Library totals' })).toContainText('3')
  await expect(page.getByRole('region', { name: /Music DNA/i })).toBeVisible()
})

test('insights with an empty library point to finding albums', async ({ page }) => {
  await page.goto('/discover/insights')
  await expect(page.getByRole('heading', { name: 'No albums saved yet' })).toBeVisible()
})

test('release calendar lists releases of saved artists by month', async ({ page }) => {
  await seedLibrary(page, seededLibrary())
  await page.goto('/discover/calendar')
  await expect(page.getByRole('heading', { level: 1, name: 'Release calendar' })).toBeVisible()
  await expect(page.getByRole('list', { name: /^Releases in \d{4}$/ })).toBeVisible()
})

test('connections map an artist’s neighbours', async ({ page }) => {
  await page.goto(`/discover/connections?artist=${ARTISTS.neonHarbor.id}`)
  await expect(page.getByRole('heading', { level: 1, name: 'Connections' })).toBeVisible()
  await expect(page.getByRole('group', { name: /^Connection map of \d+ artists$/ })).toBeVisible()
  const steps = page.getByRole('group', { name: 'Steps away' })
  await steps.getByRole('button', { name: '1' }).click()
  await expect(page).toHaveURL(/depth=1/)
  await expect(page.getByRole('main').getByRole('link', { name: ARTISTS.maraVoss.name }).first()).toBeVisible()
})

test('artist page shows eras anchored on studio albums', async ({ page }) => {
  await page.goto(`/artist/${ARTISTS.neonHarbor.id}`)
  const eras = page.getByRole('region', { name: 'Eras' })
  await expect(eras.getByRole('heading', { level: 3, name: ALBUMS.glassArcade.name })).toBeVisible()
  await eras.getByRole('link', { name: 'See connections' }).click()
  await expect(page).toHaveURL(new RegExp(`/discover/connections\\?artist=${ARTISTS.neonHarbor.id}`))
})
