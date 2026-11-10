import { readFile, writeFile } from 'node:fs/promises'
import { expect, test } from '../fixtures.js'
import { ALBUMS, ARTISTS } from '../support/catalog.js'
import { libraryWith, seedLibrary, snapshot } from '../support/library.js'

const libraryPanel = (page) => page.getByRole('region', { name: 'Your library' })

test('save from an album card, then it is still saved after a reload', async ({ page }) => {
  await page.goto(`/artist/${ARTISTS.neonHarbor.id}?tab=album`)
  const save = page.getByRole('button', { name: `Save ${ALBUMS.nightFerry.name}` })
  await expect(save).toHaveAttribute('aria-pressed', 'false')
  await save.click()
  await expect(save).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Library' }).click()
  await expect(page.getByRole('tab', { name: /^Albums/ })).toContainText('1')
  await expect(page.getByRole('tabpanel').getByRole('link', { name: new RegExp(ALBUMS.nightFerry.name) })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('tabpanel').getByRole('link', { name: new RegExp(ALBUMS.nightFerry.name) })).toBeVisible()
})

test('status, rating, tags and a new collection from the album page', async ({ page }) => {
  await page.goto(`/album/${ALBUMS.glassArcade.id}`)
  const panel = libraryPanel(page)
  await panel.getByRole('button', { name: 'Save to library' }).click()
  await expect(panel.getByText('Saved', { exact: true })).toBeVisible()

  await panel.getByRole('radio', { name: 'Listened' }).check()
  await panel.getByRole('radio', { name: '8 out of 10' }).check()
  await panel.getByPlaceholder('Add a tag, e.g. late night').fill('late night')
  await panel.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(panel.getByRole('list', { name: 'Tags' }).getByRole('listitem')).toHaveText(['late night'])

  await panel.getByRole('textbox', { name: 'New collection name' }).fill('Night drives')
  await panel.getByRole('button', { name: 'Create and add' }).click()
  await expect(panel.getByText('Added to “Night drives”.')).toBeVisible()
  await expect(panel.getByRole('checkbox', { name: 'Night drives' })).toBeChecked()

  // Everything is still there after a reload
  await page.reload()
  await expect(libraryPanel(page).getByRole('radio', { name: 'Listened' })).toBeChecked()
  await expect(libraryPanel(page).getByRole('radio', { name: '8 out of 10' })).toBeChecked()

  // The collection page lists the album
  await page.goto('/library?view=collections')
  await page.getByRole('link', { name: /Night drives/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Night drives' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Albums in this collection' }).getByRole('listitem')).toHaveCount(1)
})

test('reorder a collection with the Move buttons', async ({ page }) => {
  const albums = [ALBUMS.glassArcade, ALBUMS.nightFerry, ALBUMS.afterimage].map((album) => snapshot(album))
  await seedLibrary(page, libraryWith(albums, [{ id: 'c-roadtrip', name: 'Road trip', albumIds: albums.map((a) => a.id) }]))
  await page.goto('/library/collections/c-roadtrip')
  const list = page.getByRole('list', { name: 'Albums in this collection' })
  await expect(list.getByRole('listitem').first()).toContainText(ALBUMS.glassArcade.name)

  await page.getByRole('button', { name: `Move ${ALBUMS.glassArcade.name} down` }).click()
  await expect(list.getByRole('listitem').nth(0)).toContainText(ALBUMS.nightFerry.name)
  await expect(list.getByRole('listitem').nth(1)).toContainText(ALBUMS.glassArcade.name)
  await expect(page.getByRole('button', { name: `Move ${ALBUMS.nightFerry.name} up` })).toBeDisabled()

  await page.reload()
  await expect(list.getByRole('listitem').nth(0)).toContainText(ALBUMS.nightFerry.name)
})

test('removing an album with data asks first, and Escape cancels', async ({ page }) => {
  const album = snapshot(ALBUMS.paperMoons, { id: 'mara-voss', name: 'Mara Voss' }, 2016)
  const library = libraryWith([album])
  library.entries[album.id].rating = 9
  await seedLibrary(page, library)
  await page.goto('/library')

  const toggle = page.getByRole('button', { name: `Save ${ALBUMS.paperMoons.name}` })
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await toggle.click()
  // Focus moves to Cancel, so a stray Enter cannot delete anything
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')

  await toggle.click()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Your library is empty' })).toBeVisible()
})

test('library filters narrow the list and live in the URL', async ({ page }) => {
  const albums = [
    snapshot(ALBUMS.glassArcade),
    snapshot(ALBUMS.nightFerry, undefined, 2018),
    snapshot(ALBUMS.paperMoons, { id: 'mara-voss', name: 'Mara Voss' }, 2016),
  ]
  await seedLibrary(page, libraryWith(albums))
  await page.goto('/library')
  await page.getByRole('searchbox', { name: 'Filter by title or artist' }).fill('paper')
  await expect(page.getByRole('tabpanel').getByRole('status')).toHaveText('1 of 3 albums')
  await expect(page).toHaveURL(/q=paper/)
  await page.reload()
  await expect(page.getByRole('tabpanel').getByRole('status')).toHaveText('1 of 3 albums')
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.getByRole('tabpanel').getByRole('status')).toHaveText('3 albums')
})

test('export JSON, re-import it, and reject a broken file with an exact error', async ({ page }, testInfo) => {
  const album = snapshot(ALBUMS.glassArcade)
  await seedLibrary(page, libraryWith([album]))
  await page.goto('/library')
  await page.getByText('Back up or restore your library').click()

  // Export: the file is built in the browser and downloaded
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON (backup)' }).click()])
  expect(download.suggestedFilename()).toMatch(/^albumly-library-\d{4}-\d{2}-\d{2}\.json$/)
  const exported = testInfo.outputPath('export.json')
  await download.saveAs(exported)
  const data = JSON.parse(await readFile(exported, 'utf8'))
  expect(Object.keys(data.entries)).toEqual([album.id])

  // Importing the same file again changes nothing
  const fileInput = page.getByLabel('Import a JSON backup')
  await fileInput.setInputFiles(exported)
  await page.getByRole('button', { name: 'Merge into library' }).click()
  await expect(page.getByText('Nothing new: your library already had everything in this file.')).toBeVisible()

  // A rating of 42 is rejected, and the report names the exact field
  data.entries[album.id].rating = 42
  const broken = testInfo.outputPath('broken.json')
  await writeFile(broken, JSON.stringify(data))
  await fileInput.setInputFiles(broken)
  const report = page.getByRole('alert').filter({ hasText: 'This file was not imported' })
  await expect(report).toBeVisible()
  await expect(report).toContainText(`entries.${album.id}.rating`)
})
