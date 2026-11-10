import { expect, test } from '../fixtures.js'
import { ARTISTS } from '../support/catalog.js'

// Some groups arrive one page at a time; the rest loads when their tab is opened
test('opening "Appears On" loads every guest appearance', async ({ page }) => {
  await page.goto(`/artist/${ARTISTS.cassMarlowe.id}`)
  const tab = page.getByRole('tablist', { name: 'Release type' }).getByRole('tab', { name: /^Appears On/ })
  await expect(tab).toContainText('13')
  await tab.click()
  await expect(page.getByRole('tabpanel').getByRole('status').first()).toHaveText(/^13 releases/)
})

test('compilations load in full when their tab opens', async ({ page }) => {
  await page.goto(`/artist/${ARTISTS.driftwood.id}`)
  await page.getByRole('tablist', { name: 'Release type' }).getByRole('tab', { name: /^Compilations/ }).click()
  const panel = page.getByRole('tabpanel')
  await expect(panel.getByRole('link', { name: /Driftwood Sampler Vol\. 12/ })).toBeVisible()
  // Numbered volumes are not editions of each other, but the expanded edition is
  await expect(panel.getByRole('button', { name: /edition of Driftwood Sampler Vol\. 3$/ })).toBeVisible()
})
