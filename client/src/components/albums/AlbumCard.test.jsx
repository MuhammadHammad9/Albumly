import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, test } from 'vitest'
import { libraryStore } from '../../stores/libraryStore.js'
import { resetLibrary } from '../../test/libraryFixtures.js'
import AlbumCard from './AlbumCard.jsx'

const release = {
  id: 'neon-harbor--pier-lights',
  releaseDate: '2013-11',
  precision: 'month',
  totalTracks: 5,
  albumType: 'single',
  name: 'Pier Lights',
  year: 2013,
  inferredType: 'ep',
  artists: [{ id: 'neon-harbor', name: 'Neon Harbor' }],
  coverUrl: null,
}

// The card contains a <Link>, which only works inside a router
const renderCard = (props) => render(<AlbumCard release={release} {...props} />, { wrapper: MemoryRouter })

test('links to the album page and shows title, year and type', () => {
  renderCard()

  expect(screen.getByRole('link')).toHaveAttribute('href', '/album/neon-harbor--pier-lights')
  expect(screen.getByRole('heading', { name: 'Pier Lights' })).toBeInTheDocument()
  expect(screen.getByText('2013 · EP')).toBeInTheDocument()
})

test('adds the artist name only when asked', () => {
  renderCard({ showArtist: true })

  expect(screen.getByText('2013 · EP · Neon Harbor')).toBeInTheDocument()
})

test('falls back to initials when there is no cover image', () => {
  renderCard()

  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByText('PL')).toBeInTheDocument()
})

describe('save toggle', () => {
  beforeEach(() => resetLibrary())

  test('saves and unsaves the album without confirming when nothing would be lost', () => {
    renderCard()
    const toggle = () => screen.getByRole('button', { name: 'Save Pier Lights' })
    expect(toggle()).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    expect(libraryStore.getState().entries[release.id].album.name).toBe('Pier Lights')

    fireEvent.click(toggle())
    expect(libraryStore.getState().entries[release.id]).toBeUndefined()
  })

  test('asks first when the saved album has a rating, and Cancel keeps it', () => {
    renderCard()
    fireEvent.click(screen.getByRole('button', { name: 'Save Pier Lights' }))
    // Store changes made outside a click must be wrapped in act() so React re-renders before we look
    act(() => libraryStore.getState().setRating(release.id, 8))

    fireEvent.click(screen.getByRole('button', { name: 'Save Pier Lights' }))
    const confirm = screen.getByRole('group', { name: /Remove “Pier Lights”\?/ })
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(confirm).not.toBeInTheDocument()
    expect(libraryStore.getState().entries[release.id]).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Save Pier Lights' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(libraryStore.getState().entries[release.id]).toBeUndefined()
  })
})
