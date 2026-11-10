import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import Artwork from './Artwork.jsx'

afterEach(() => vi.useRealTimers())

test('a cover that fails to load is tried again before falling back to initials', () => {
  vi.useFakeTimers()
  render(<Artwork src="https://i.scdn.co/image/a" alt="Album cover" name="Glass Arcade" />)

  fireEvent.error(screen.getByRole('img', { name: 'Album cover' }))
  act(() => vi.advanceTimersByTime(1500))
  // Second try loads fine: the image stays
  expect(screen.getByRole('img', { name: 'Album cover' }).tagName).toBe('IMG')

  fireEvent.error(screen.getByRole('img', { name: 'Album cover' }))
  act(() => vi.advanceTimersByTime(5000))
  fireEvent.error(screen.getByRole('img', { name: 'Album cover' }))
  // Out of retries: initials
  expect(screen.getByRole('img', { name: 'Album cover' }).tagName).toBe('DIV')
  expect(screen.getByText('GA')).toBeInTheDocument()
})

test('a new address starts again even after the old one failed', () => {
  vi.useFakeTimers()
  const { rerender } = render(<Artwork src="https://i.scdn.co/image/a" alt="Cover" name="Glass Arcade" />)
  for (const wait of [1500, 5000]) {
    fireEvent.error(screen.getByRole('img', { name: 'Cover' }))
    act(() => vi.advanceTimersByTime(wait))
  }
  fireEvent.error(screen.getByRole('img', { name: 'Cover' }))
  expect(screen.getByRole('img', { name: 'Cover' }).tagName).toBe('DIV')

  rerender(<Artwork src="https://i.scdn.co/image/b" alt="Cover" name="Glass Arcade" />)
  expect(screen.getByRole('img', { name: 'Cover' }).tagName).toBe('IMG')
})
