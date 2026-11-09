import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { ApiError } from '../../services/api.js'
import { describeWait } from '../../utils/errorMessages.js'
import { ErrorState } from './Feedback.jsx'

test('describeWait rounds to a friendly unit', () => {
  expect(describeWait(undefined)).toBe('about a minute')
  expect(describeWait(45)).toBe('about a minute')
  expect(describeWait(600)).toBe('about 10 minutes')
  expect(describeWait(86280)).toBe('about 24 hours')
})

test('a long rate limit explains the wait and hides "Try again"', () => {
  render(<ErrorState error={new ApiError(503, 'rate_limited', 'x', 86280)} onRetry={() => {}} />)

  expect(screen.getByRole('heading', { name: 'Spotify has paused Albumly for a while' })).toBeInTheDocument()
  expect(screen.getByText(/about 24 hours/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument()
})

test('a short rate limit still offers "Try again"', () => {
  render(<ErrorState error={new ApiError(503, 'rate_limited', 'x', 20)} onRetry={() => {}} />)

  expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
})

test('rejected Spotify credentials say it needs fixing on the server', () => {
  render(<ErrorState error={new ApiError(502, 'spotify_auth_failed', 'x')} onRetry={() => {}} />)

  expect(screen.getByRole('heading', { name: "Albumly can't connect to Spotify" })).toBeInTheDocument()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
