import { expect, test } from 'vitest'
import { createRepositorySwitch } from './repositorySwitch.js'
import { emptyLibrary } from './schema.js'
import { createLibraryStore } from '../../stores/libraryStore.js'
import { album, entry, memoryRepository } from '../../test/libraryFixtures.js'

test('the store shows whichever repository is active, and saves only to it', () => {
  const browser = memoryRepository({ ...emptyLibrary(), entries: { local: entry('local') } })
  const account = memoryRepository({ ...emptyLibrary(), entries: { cloud: entry('cloud') } })
  const source = createRepositorySwitch(browser)
  const store = createLibraryStore(source)
  expect(Object.keys(store.getState().entries)).toEqual(['local'])

  source.use(account)
  expect(Object.keys(store.getState().entries)).toEqual(['cloud'])
  expect(account.saved).toHaveLength(0) // switching is not a change to save

  store.getState().saveAlbum(album('new'))
  expect(Object.keys(account.saved.at(-1).entries)).toEqual(['cloud', 'new'])
  expect(browser.saved).toHaveLength(0) // the browser library is untouched while signed in

  source.use(browser)
  expect(Object.keys(store.getState().entries)).toEqual(['local'])
})

test('changes pushed by the active repository reach the store; an inactive one is ignored', () => {
  const browser = memoryRepository()
  const account = memoryRepository()
  const source = createRepositorySwitch(browser)
  const store = createLibraryStore(source)
  source.use(account)

  account.listener({ ...emptyLibrary(), entries: { fresh: entry('fresh') } })
  expect(Object.keys(store.getState().entries)).toEqual(['fresh'])
  expect(account.saved).toHaveLength(0)
})
