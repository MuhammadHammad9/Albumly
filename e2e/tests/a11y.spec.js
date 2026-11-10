import { expect, test } from '../fixtures.js'
import { runAxe } from '../support/a11y.js'
import { ALBUMS, ARTISTS } from '../support/catalog.js'
import { libraryWith, seedLibrary, snapshot } from '../support/library.js'

// Automated accessibility check (axe-core, WCAG 2.1 A and AA rules) on every page.
// "serious" and "critical" problems fail the test; the full report for each page is kept in
// e2e/test-results/<test>/axe-<page>.json and attached to the HTML report.
const PAGES = [
  ['home', '/', 'Featured artists'],
  ['search', '/search?q=mara', 'Results for “mara”'],
  ['search (empty)', '/search', 'Search'],
  ['artist', `/artist/${ARTISTS.neonHarbor.id}`, ARTISTS.neonHarbor.name],
  ['album', `/album/${ALBUMS.glassArcade.id}`, ALBUMS.glassArcade.name],
  ['library', '/library', 'Your library'],
  ['collection', '/library/collections/c-roadtrip', 'Road trip'],
  ['compare', `/compare?a=${ALBUMS.glassArcade.id}&b=${ALBUMS.nightFerry.id}`, 'Compare albums'],
  ['discover', '/discover', 'Discover'],
  ['insights', '/discover/insights', 'Your Albumly library'],
  ['calendar', '/discover/calendar', 'Release calendar'],
  ['connections', `/discover/connections?artist=${ARTISTS.neonHarbor.id}`, 'Connections'],
  ['battles', '/battles', 'Album Battle'],
  ['account', '/account', 'Account'],
  ['privacy', '/privacy', 'Privacy policy'],
  ['admin', '/admin', 'Admin'],
  ['not found', '/no-such-page', 'Page not found'],
]

for (const [name, path, heading] of PAGES) {
  test(`no serious accessibility problems on the ${name} page`, async ({ page }, testInfo) => {
    // A small saved library, so the library, insights and collection pages have content to check
    const albums = [snapshot(ALBUMS.glassArcade), snapshot(ALBUMS.nightFerry, undefined, 2018)]
    await seedLibrary(page, libraryWith(albums, [{ id: 'c-roadtrip', name: 'Road trip', albumIds: albums.map((a) => a.id) }]))
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
    const violations = await runAxe(page, testInfo, name.replace(/\W+/g, '-'))
    const serious = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.impact} ${v.id}: ${v.help}`)
    expect(serious).toEqual([])
  })
}
