import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { beforeEach, expect, test } from 'vitest'
import { libraryStore } from '../stores/libraryStore.js'
import { collection, entry, resetLibrary } from '../test/libraryFixtures.js'
import Collection from './Collection.jsx'

function Location() {
  const location = useLocation()
  return <p data-testid="location">{location.pathname + location.search}</p>
}

function renderCollection(id = 'c1') {
  return render(
    <MemoryRouter initialEntries={[`/library/collections/${id}`]}>
      <Routes>
        <Route path="/library/collections/:id" element={<Collection />} />
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  )
}

const titles = () => within(screen.getByRole('list', { name: 'Albums in this collection' })).getAllByRole('link').map((link) => link.textContent)

beforeEach(() =>
  resetLibrary({
    version: 1,
    entries: { a: entry('a'), b: entry('b'), c: entry('c') },
    collections: [collection('c1', ['a', 'b', 'c'], { name: 'Road trip' }), collection('c2', [], { name: 'Rainy days' })],
  }),
)

test('Move up / Move down buttons reorder the albums and are disabled at the ends', () => {
  renderCollection()
  expect(titles()).toEqual(['Album a', 'Album b', 'Album c'])
  expect(screen.getByRole('button', { name: 'Move Album a up' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Move Album c down' })).toBeDisabled()

  fireEvent.click(screen.getByRole('button', { name: 'Move Album c up' }))
  expect(titles()).toEqual(['Album a', 'Album c', 'Album b'])
  fireEvent.click(screen.getByRole('button', { name: 'Move Album a down' }))
  expect(titles()).toEqual(['Album c', 'Album a', 'Album b'])
  expect(libraryStore.getState().collections[0].albumIds).toEqual(['c', 'a', 'b'])
})

test('each grip is a keyboard-operable drag handle', () => {
  renderCollection()
  const grip = screen.getByRole('button', { name: 'Reorder Album a' })

  expect(grip).toHaveAttribute('aria-roledescription', 'sortable')
  expect(grip).toHaveAttribute('aria-describedby')
})

test('removing from the collection keeps the album saved', () => {
  renderCollection()
  fireEvent.click(screen.getByRole('button', { name: 'Remove Album b from this collection' }))

  expect(titles()).toEqual(['Album a', 'Album c'])
  expect(libraryStore.getState().entries.b).toBeDefined()
})

test('rename refuses a name another collection uses', () => {
  renderCollection()
  fireEvent.click(screen.getByRole('button', { name: 'Rename Road trip' }))
  fireEvent.change(screen.getByLabelText('Collection name'), { target: { value: 'rainy DAYS' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('alert')).toHaveTextContent('You already have a collection called “Rainy days”.')

  fireEvent.change(screen.getByLabelText('Collection name'), { target: { value: 'Long drive' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByRole('heading', { level: 1, name: 'Long drive' })).toBeInTheDocument()
})

test('delete asks in the page, then returns to the collections list', () => {
  renderCollection()
  fireEvent.click(screen.getByRole('button', { name: 'Delete collection' }))
  expect(screen.getByRole('group', { name: /The albums stay in your library/ })).toBeInTheDocument()

  fireEvent.click(within(screen.getByRole('group', { name: /The albums stay/ })).getByRole('button', { name: 'Delete collection' }))

  expect(screen.getByTestId('location')).toHaveTextContent('/library?view=collections')
  expect(libraryStore.getState().collections.map((c) => c.id)).toEqual(['c2'])
  expect(Object.keys(libraryStore.getState().entries)).toHaveLength(3)
})

test('an unknown collection shows a not-found page', () => {
  renderCollection('nope')
  expect(screen.getByRole('heading', { name: 'Collection not found' })).toBeInTheDocument()
})
