import { expect, test } from '../fixtures.js'
import { runAxe } from '../support/a11y.js'
import { ALBUMS, ARTISTS } from '../support/catalog.js'

// Automated accessibility check (axe-core) on the main pages. In Part A only "critical" problems
// fail the test; everything else is attached to the report (e2e/playwright-report) for review.
const PAGES = [
  ['home', '/', 'Featured artists'],
  ['search', '/search?q=mara', 'Results for “mara”'],
  ['artist', `/artist/${ARTISTS.neonHarbor.id}`, ARTISTS.neonHarbor.name],
  ['album', `/album/${ALBUMS.glassArcade.id}`, ALBUMS.glassArcade.name],
  ['library', '/library', 'Your library'],
  ['compare', `/compare?a=${ALBUMS.glassArcade.id}&b=${ALBUMS.nightFerry.id}`, 'Compare albums'],
]

for (const [name, path, heading] of PAGES) {
  test(`no critical accessibility problems on the ${name} page`, async ({ page }, testInfo) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
    const violations = await runAxe(page, testInfo, name)
    const critical = violations.filter((v) => v.impact === 'critical').map((v) => `${v.id}: ${v.help}`)
    expect(critical).toEqual([])
  })
}
