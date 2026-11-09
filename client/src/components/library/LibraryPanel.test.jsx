import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { libraryStore } from '../../stores/libraryStore.js'
import { album, resetLibrary } from '../../test/libraryFixtures.js'
import LibraryPanel from './LibraryPanel.jsx'

const glass = { ...album('glass', { name: 'Glass Arcade' }), totalDurationMs: 2_700_000, tracks: [] }
const entryOf = (id) => libraryStore.getState().entries[id]
const renderPanel = (target = glass) => render(<LibraryPanel album={target} />, { wrapper: MemoryRouter })

beforeEach(() => resetLibrary())

test('saving reveals status, rating, tags and notes, which all reach the store', () => {
  renderPanel()
  fireEvent.click(screen.getByRole('button', { name: 'Save to library' }))

  expect(entryOf('glass').album.totalDurationMs).toBe(2_700_000)

  fireEvent.click(screen.getByRole('radio', { name: 'Listened' }))
  fireEvent.click(screen.getByRole('radio', { name: '8 out of 10' }))
  expect(entryOf('glass')).toMatchObject({ status: 'listened', rating: 8 })

  const tagBox = screen.getByLabelText('Tags')
  fireEvent.change(tagBox, { target: { value: 'Late Night' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  expect(within(screen.getByRole('list', { name: 'Tags' })).getByText('late night')).toBeInTheDocument()

  fireEvent.change(tagBox, { target: { value: 'late night' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add' }))
  expect(screen.getByRole('alert')).toHaveTextContent('“late night” is already a tag.')

  const review = screen.getByLabelText('Review')
  fireEvent.change(review, { target: { value: 'Shimmering.' } })
  expect(entryOf('glass').review).toBe('') // saved on leaving the box, not per keystroke
  fireEvent.blur(review)
  expect(entryOf('glass').review).toBe('Shimmering.')
})

test('creating a collection adds the album, refuses a duplicate name and warns about another edition', () => {
  libraryStore.getState().saveAlbum(album('base', { name: 'Glass Arcade (Deluxe Edition)' }))
  renderPanel()

  fireEvent.change(screen.getByLabelText('New collection name'), { target: { value: 'Neon nights' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create and add' }))
  expect(screen.getByRole('checkbox', { name: 'Neon nights' })).toBeChecked()
  expect(entryOf('glass')).toBeDefined() // adding to a collection saved it

  fireEvent.change(screen.getByLabelText('New collection name'), { target: { value: 'NEON NIGHTS' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create and add' }))
  expect(screen.getByText('You already have a collection called “Neon nights”.')).toBeInTheDocument()

  // Put the deluxe edition in the same collection: a warning, but it is allowed
  const collectionId = libraryStore.getState().collections[0].id
  const result = libraryStore.getState().addToCollection(collectionId, album('base', { name: 'Glass Arcade (Deluxe Edition)' }))
  expect(result.similar.name).toBe('Glass Arcade')
})

test('removing an album with data asks first, in the page', () => {
  renderPanel()
  fireEvent.click(screen.getByRole('button', { name: 'Save to library' }))
  fireEvent.click(screen.getByRole('radio', { name: 'Favourite' }))

  fireEvent.click(screen.getByRole('button', { name: 'Remove from library' }))
  expect(screen.getByRole('group', { name: /This deletes its status, rating, tags and notes/ })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Remove' }))

  expect(entryOf('glass')).toBeUndefined()
  expect(screen.getByRole('button', { name: 'Save to library' })).toBeInTheDocument()
})
