import { expect, test } from '../fixtures.js'
import { ARTISTS, SEARCH_LABEL } from '../support/catalog.js'

const searchBox = (page) => page.getByRole('combobox', { name: SEARCH_LABEL })

test('suggestions work with the keyboard (combobox)', async ({ page }) => {
  await page.goto('/')
  const box = searchBox(page)
  await box.fill('neon')
  const list = page.getByRole('listbox', { name: 'Artist suggestions' })
  await expect(list.getByRole('option', { name: /Neon Harbor/ }).first()).toBeVisible()

  // ArrowDown highlights the first option, ArrowUp wraps round to the last ("See all results")
  await box.press('ArrowDown')
  await expect(list.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
  await box.press('ArrowUp')
  await expect(list.getByRole('option').last()).toHaveAttribute('aria-selected', 'true')
  await expect(list.getByRole('option').last()).toHaveText(/See all results/)
  await box.press('ArrowDown')
  await expect(list.getByRole('option').first()).toHaveAttribute('aria-selected', 'true')
  await box.press('Enter')
  await expect(page).toHaveURL(/\/artist\//)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('Escape closes the suggestions', async ({ page }) => {
  await page.goto('/')
  const box = searchBox(page)
  await box.fill('mara')
  await expect(page.getByRole('listbox', { name: 'Artist suggestions' })).toBeVisible()
  await box.press('Escape')
  await expect(box).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('listbox')).toHaveCount(0)
})

test('same-name artists are shown as separate results', async ({ page }) => {
  await page.goto('/search?q=neon%20harb')
  const panel = page.getByRole('tabpanel')
  await expect(panel.getByRole('link', { name: new RegExp(ARTISTS.neonHarbor.name) }).first()).toBeVisible()
  await expect(panel.getByRole('link', { name: new RegExp(ARTISTS.tribute.name) })).toBeVisible()
})

test('Enter in the search box opens the full results page', async ({ page }) => {
  await page.goto('/')
  const box = searchBox(page)
  await box.fill('mara')
  await box.press('Enter')
  await expect(page).toHaveURL(/\/search\?q=mara/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Results for “mara”')
  await expect(page.getByRole('tab', { name: 'Artists' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel').getByRole('link', { name: new RegExp(ARTISTS.maraVoss.name) })).toBeVisible()
})

test('a structured query is understood and opens the Albums tab', async ({ page }) => {
  await page.goto('/search?q=neon%20harbor%202015%20album')
  await expect(page.getByText('Understood as:')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Albums' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel').getByRole('link', { name: /Glass Arcade/ }).first()).toBeVisible()
})

test('tracks tab lists tracks', async ({ page }) => {
  await page.goto('/search?q=neon%20harbor%20songs')
  await expect(page.getByRole('tab', { name: 'Tracks' })).toHaveAttribute('aria-selected', 'true')
  const tracks = page.getByRole('list', { name: 'Tracks' })
  await expect(tracks.getByRole('listitem').first()).toBeVisible()
})

test('switching tabs keeps the search in the URL and survives a reload', async ({ page }) => {
  await page.goto('/search?q=mara%20voss')
  await page.getByRole('tab', { name: 'Albums' }).click()
  await expect(page).toHaveURL(/tab=album/)
  await page.reload()
  await expect(page.getByRole('tab', { name: 'Albums' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tabpanel').getByRole('link', { name: /Paper Moons/ }).first()).toBeVisible()
})

test('a search with no matches says so', async ({ page }) => {
  await page.goto('/search?q=zzqqxx')
  await expect(page.getByRole('heading', { name: 'No artists found' })).toBeVisible()
})
