import { expect, test } from '../../fixtures.js'
import { ALBUMS, ARTISTS } from '../../support/catalog.js'
import { libraryWith, seedLibrary, snapshot } from '../../support/library.js'

// The production build (vite build), served with the same security headers as client/vercel.json.
// Any Content Security Policy violation is recorded and fails the test, so the CSP is checked
// against the real bundle before it reaches Vercel.

async function watchCsp(page) {
  await page.addInitScript(() => {
    window.__cspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__cspViolations.push(`${event.violatedDirective} blocked ${event.blockedURI || "inline code"} (${(event.sourceFile || "").split("/").pop()}:${event.lineNumber}:${event.columnNumber})`)
    })
  })
}
const violations = (page) => page.evaluate(() => window.__cspViolations)

test('pages send the security headers', async ({ request }) => {
  const response = await request.get('/')
  const headers = response.headers()
  expect(headers['content-security-policy']).toContain("script-src 'self'")
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['permissions-policy']).toContain('camera=()')
})

test('share and search-engine tags are in the page', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /Albumly/)
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og-image\.png$/)
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /every album/)
  const image = await request.get('/og-image.png')
  expect(image.headers()['content-type']).toContain('image/png')
  const robots = await request.get('/robots.txt')
  expect(await robots.text()).toContain('User-agent: *')
})

const PAGES = [
  ['home', '/', /Find every album/],
  ['artist', `/artist/${ARTISTS.neonHarbor.id}`, ARTISTS.neonHarbor.name],
  ['album', `/album/${ALBUMS.afterimage.id}`, ALBUMS.afterimage.name],
  ['compare (chart)', `/compare?a=${ALBUMS.glassArcade.id}&b=${ALBUMS.afterimage.id}`, 'Compare albums'],
  ['library', '/library', 'Your library'],
  ['insights (charts)', '/discover/insights', 'Your Albumly library'],
  ['connections (graph)', `/discover/connections?artist=${ARTISTS.neonHarbor.id}`, 'Connections'],
  ['battles', '/battles', 'Album Battle'],
]

for (const [name, path, heading] of PAGES) {
  test(`no CSP violations on the ${name} page`, async ({ page }) => {
    await watchCsp(page)
    await seedLibrary(page, libraryWith([snapshot(ALBUMS.glassArcade), snapshot(ALBUMS.nightFerry, undefined, 2018)]))
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(await violations(page)).toEqual([])
  })
}

test('demo mode is announced in the footer', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('contentinfo')).toContainText('Demo mode')
})

test.describe('error boundaries', () => {
  // These break things on purpose, and the app logs what went wrong
  test.use({ allowConsoleErrors: true })

  test('a page that crashes while drawing shows "Reload" inside the app', async ({ page }) => {
    // An album answer missing every field makes the album page throw while rendering
    await page.route(`**/api/albums/${ALBUMS.glassArcade.id}`, (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"id":"x"}' }))
    await page.goto(`/album/${ALBUMS.glassArcade.id}`)
    const alert = page.getByRole('alert')
    await expect(alert.getByRole('heading', { name: 'This page hit a problem' })).toBeVisible()
    await expect(alert.getByRole('button', { name: 'Reload' })).toBeVisible()
    // The rest of the app is still there
    await expect(page.getByRole('navigation', { name: 'Main' }).first()).toBeVisible()
  })

  test('a page file that fails to download (e.g. after a new deploy) offers Reload', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Featured artists' })).toBeVisible()
    // Every not-yet-loaded page file now fails, as an old tab would after a redeploy
    await page.route('**/assets/Library-*.js', (route) => route.fulfill({ status: 404, body: 'gone' }))
    await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Library' }).click()
    await expect(page.getByRole('heading', { name: 'This page hit a problem' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible()
  })
})
