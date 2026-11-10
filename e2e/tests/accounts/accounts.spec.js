import { expect, test } from '../../fixtures.js'
import { ALBUMS } from '../../support/catalog.js'
import { fakeSupabase, signIn, uniqueEmail } from '../../support/fakeSupabase.js'
import { runAxe } from '../../support/a11y.js'
import { libraryWith, seedLibrary, snapshot } from '../../support/library.js'

// Accounts against a real Express server and real Postgres rules (PGlite), with Supabase Auth
// played by the test. Set E2E_ACCOUNTS=0 to skip this group.
test.skip(process.env.E2E_ACCOUNTS === '0', 'account tests turned off with E2E_ACCOUNTS=0')

test.beforeEach(async ({ context, request }) => {
  await fakeSupabase(context, request)
})

const signedInHeading = (page) => page.getByRole('heading', { name: 'Signed in' })

test('sign in, see the account, sign out', async ({ page }, testInfo) => {
  const email = uniqueEmail(testInfo)
  await signIn(page, email)
  await expect(signedInHeading(page)).toBeVisible()
  await expect(page.getByText(email).first()).toBeVisible()
  await expect(page.getByRole('link', { name: `Account (${email})` })).toBeVisible()
  await expect(page.getByText('Up to date')).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('tablist', { name: 'Sign in or create an account' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Account', exact: true })).toBeVisible()
})

test('a wrong password shows a plain message', async ({ page }, testInfo) => {
  await signIn(page, uniqueEmail(testInfo), 'not-the-password')
  await expect(page.getByRole('alert')).toHaveText('That email and password do not match an account.')
})

test('sign-up checks the password and then asks to confirm the email', async ({ page, context, request }, testInfo) => {
  await context.unrouteAll()
  await fakeSupabase(context, request, { confirmEmail: true })
  const email = uniqueEmail(testInfo)
  await page.goto('/account')
  await page.getByRole('tab', { name: 'Create account' }).click()
  await page.getByRole('textbox', { name: 'Email' }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('short')
  await page.getByRole('main').getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('at least 8 characters')

  await page.getByLabel('Password', { exact: true }).fill('long-enough-password')
  await page.getByRole('main').getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Check your email' })).toContainText(email)
})

test('the library saved before signing in moves into the account and shows up in a second browser', async ({ page, browser, request }, testInfo) => {
  const email = uniqueEmail(testInfo)
  await seedLibrary(page, libraryWith([snapshot(ALBUMS.glassArcade), snapshot(ALBUMS.nightFerry, undefined, 2018)]))
  await signIn(page, email)

  const offer = page.getByRole('region', { name: 'Library on this device' })
  await expect(offer).toContainText('2 albums')
  await offer.getByRole('button', { name: 'Add to account' }).click()
  await expect(page.getByText(/Moved into your account\./)).toBeVisible()

  // A second, separate browser (no shared storage) signing in to the same account
  const other = await browser.newContext()
  await fakeSupabase(other, request)
  const otherPage = await other.newPage()
  await signIn(otherPage, email)
  await expect(signedInHeading(otherPage)).toBeVisible()
  await otherPage.goto('/library')
  await expect(otherPage.getByRole('tabpanel').getByRole('link', { name: new RegExp(ALBUMS.glassArcade.name) })).toBeVisible()
  await expect(otherPage.getByRole('tabpanel').getByRole('link', { name: new RegExp(ALBUMS.nightFerry.name) })).toBeVisible()
  await other.close()
})

test('a collection shared by link opens for a logged-out visitor', async ({ page, browser }, testInfo) => {
  const email = uniqueEmail(testInfo)
  await signIn(page, email)
  await expect(signedInHeading(page)).toBeVisible()

  // Save an album into a new collection from its page (this syncs to the account)
  await page.goto(`/album/${ALBUMS.glassArcade.id}`)
  const panel = page.getByRole('region', { name: 'Your library' })
  await panel.getByRole('textbox', { name: 'New collection name' }).fill('Late night drives')
  await panel.getByRole('button', { name: 'Create and add' }).click()
  await expect(panel.getByRole('checkbox', { name: 'Late night drives' })).toBeChecked()

  await page.goto('/library?view=collections')
  await page.getByRole('link', { name: /Late night drives/ }).click()
  const share = page.getByRole('checkbox', { name: 'Anyone with the link can view this collection' })
  // The collection reaches the server a moment after it is made; the panel offers "Try again"
  await expect(async () => {
    const retry = page.getByRole('button', { name: 'Try again' })
    if (await retry.isVisible()) await retry.click()
    await expect(share).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  // The box follows the server: it ticks once the save is confirmed, so click and then wait
  await share.click()
  await expect(share).toBeChecked()
  const link = page.getByRole('textbox', { name: 'Share link' })
  await expect(link).toHaveValue(/\/shared\/late-night-drives-[a-z0-9]+$/)
  const sharedPath = new URL(await link.inputValue()).pathname

  // Someone else, not signed in, in a fresh browser
  const visitor = await browser.newContext()
  const visitorPage = await visitor.newPage()
  await visitorPage.goto(`http://127.0.0.1:5289${sharedPath}`)
  await expect(visitorPage.getByRole('heading', { level: 1, name: 'Late night drives' })).toBeVisible()
  await expect(visitorPage.getByText(ALBUMS.glassArcade.name).first()).toBeVisible()
  // Shared pages ask search engines not to index them
  await expect(visitorPage.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/)
  await visitor.close()
})

test('the admin page refuses an ordinary account', async ({ page }, testInfo) => {
  await signIn(page, uniqueEmail(testInfo))
  await expect(signedInHeading(page)).toBeVisible()
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: 'Admins only' })).toBeVisible()
})

test('deleting the account removes it and signs out', async ({ page }, testInfo) => {
  const email = uniqueEmail(testInfo)
  await signIn(page, email)
  await expect(signedInHeading(page)).toBeVisible()
  const remove = page.getByRole('button', { name: 'Delete my account' })
  await expect(remove).toBeDisabled()
  await page.getByRole('textbox', { name: /Type your email/ }).fill(email)
  await remove.click()
  await expect(page.getByRole('status').filter({ hasText: 'Your account and all its data were deleted.' })).toBeVisible()
  await expect(page.getByRole('tablist', { name: 'Sign in or create an account' })).toBeVisible()
})

test('signed-in pages have no serious accessibility problems', async ({ page }, testInfo) => {
  await seedLibrary(page, libraryWith([snapshot(ALBUMS.glassArcade), snapshot(ALBUMS.nightFerry, undefined, 2018)]))
  await signIn(page, uniqueEmail(testInfo))
  await expect(signedInHeading(page)).toBeVisible()
  for (const [name, path, heading] of [
    ['account', '/account', 'Signed in'],
    ['battles', '/battles', 'Album Battle'],
    ['admin', '/admin', 'Admins only'],
  ]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
    const serious = (await runAxe(page, testInfo, `signed-in-${name}`)).filter((v) => v.impact === 'serious' || v.impact === 'critical')
    expect(serious.map((v) => `${name}: ${v.id}`)).toEqual([])
  }
})
