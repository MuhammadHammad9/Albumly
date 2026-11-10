import { expect, test } from '../fixtures.js'
import { ARTISTS } from '../support/catalog.js'

const releaseTabs = (page) => page.getByRole('tablist', { name: 'Release type' })
const panel = (page) => page.getByRole('tabpanel')
// The "N releases" line above the grid
const resultCount = (page) => panel(page).getByRole('status').first()

test.beforeEach(async ({ page }) => {
  await page.goto(`/artist/${ARTISTS.neonHarbor.id}`)
  await expect(page.getByRole('heading', { level: 1, name: ARTISTS.neonHarbor.name })).toBeVisible()
})

test('artist header and release-type tabs', async ({ page }) => {
  await expect(page).toHaveTitle(`${ARTISTS.neonHarbor.name} · Albumly`)
  await expect(page.getByRole('link', { name: 'Open on Spotify' })).toHaveAttribute('rel', /noreferrer/)
  const tabs = releaseTabs(page)
  await expect(tabs.getByRole('tab', { name: /^All/ })).toHaveAttribute('aria-selected', 'true')
  for (const name of ['Albums', 'Singles', 'Compilations']) {
    await expect(tabs.getByRole('tab', { name: new RegExp(`^${name}`) })).toBeVisible()
  }

  await tabs.getByRole('tab', { name: /^Albums/ }).click()
  await expect(page).toHaveURL(/tab=album/)
  await expect(panel(page).getByRole('link', { name: /Night Ferry/ })).toBeVisible()
  await expect(panel(page).getByRole('link', { name: /Halogen/ })).toHaveCount(0) // a single
})

test('tabs move with the arrow keys', async ({ page }) => {
  const all = releaseTabs(page).getByRole('tab', { name: /^All/ })
  await all.focus()
  await all.press('ArrowRight')
  const albums = releaseTabs(page).getByRole('tab', { name: /^Albums/ })
  await expect(albums).toBeFocused()
  await expect(albums).toHaveAttribute('aria-selected', 'true')
})

test('filter by text and year, then clear', async ({ page }) => {
  const filter = page.getByRole('searchbox', { name: 'Filter releases by title' })
  await filter.fill('slow')
  await expect(resultCount(page)).toContainText('Showing')
  await expect(panel(page).getByRole('link', { name: /Slow Lightning/ }).first()).toBeVisible()
  await expect(panel(page).getByRole('link', { name: /Night Ferry/ })).toHaveCount(0)
  await expect(page).toHaveURL(/q=slow/)

  await filter.fill('')
  await page.getByRole('combobox', { name: 'From year' }).selectOption('2021')
  await page.getByRole('combobox', { name: 'To year' }).selectOption('2021')
  await expect(panel(page).getByRole('link', { name: /Afterimage/ })).toBeVisible()
  await expect(panel(page).getByRole('link', { name: /Glass Arcade/ })).toHaveCount(0)

  await filter.fill('no such title')
  await expect(page.getByRole('heading', { name: 'No releases match these filters' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(panel(page).getByRole('link', { name: /Glass Arcade/ }).first()).toBeVisible()
})

test('sort and view live in the URL and survive reload', async ({ page }) => {
  await releaseTabs(page).getByRole('tab', { name: /^Albums/ }).click()
  await page.getByRole('combobox', { name: 'Sort releases' }).selectOption({ label: 'Oldest first' })
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'List' }).click()
  await expect(page).toHaveURL(/sort=oldest/)
  await expect(page).toHaveURL(/view=list/)

  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Sort releases' })).toHaveValue('oldest')
  await expect(page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'List' })).toHaveAttribute('aria-pressed', 'true')
  // Oldest first: the 2012 debut comes before the 2024 album
  await expect(panel(page).getByRole('link', { name: /Slow Lightning/ }).first()).toBeVisible()
  const text = await panel(page).innerText()
  expect(text.indexOf('Low Tide Signals')).toBeGreaterThan(-1)
  expect(text.indexOf('Low Tide Signals')).toBeLessThan(text.indexOf('Slow Lightning'))
})

test('timeline view groups releases by year', async ({ page }) => {
  await page.getByRole('group', { name: 'View' }).getByRole('button', { name: 'Timeline' }).click()
  await expect(page.getByRole('combobox', { name: 'Sort releases' })).toBeDisabled()
  for (const year of ['2012', '2015', '2024']) {
    await expect(panel(page).getByRole('heading', { name: year, exact: true })).toBeVisible()
  }
})

test('deluxe edition is stacked under the original and can be expanded', async ({ page }) => {
  await releaseTabs(page).getByRole('tab', { name: /^Albums/ }).click()
  await expect(resultCount(page)).toContainText('alternate edition')
  const toggle = panel(page).getByRole('button', { name: /edition of Glass Arcade/ })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(panel(page).getByRole('link', { name: /Glass Arcade \(Deluxe Edition\)/ })).toBeVisible()

  // Turning grouping off shows the deluxe edition as its own card
  await page.getByRole('button', { name: 'Group editions' }).click()
  await expect(page).toHaveURL(/editions=separate/)
  await expect(panel(page).getByRole('button', { name: /edition of Glass Arcade/ })).toHaveCount(0)
})

test('completeness report opens and lists groups', async ({ page }) => {
  await page.getByText(/About this discography/).click()
  const table = page.getByRole('table', { name: 'Releases loaded per group' })
  await expect(table).toBeVisible()
  await expect(table.getByRole('rowheader', { name: 'Albums' })).toBeVisible()
  await expect(page.getByText('From the demo catalogue')).toBeVisible()
})

test('inferred EPs are explained', async ({ page }) => {
  await releaseTabs(page).getByRole('tab', { name: /^EPs/ }).click()
  await expect(page.getByText('Spotify does not label EPs')).toBeVisible()
  await expect(panel(page).getByRole('link', { name: /Pier Lights/ })).toBeVisible()
})
