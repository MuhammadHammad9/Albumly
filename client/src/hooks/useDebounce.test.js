import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useDebounce } from './useDebounce.js'

// Fake timers let the test "wait" 400 ms instantly and deterministically
beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('returns the initial value immediately', () => {
  const { result } = renderHook(() => useDebounce('the', 400))

  expect(result.current).toBe('the')
})

test('only updates after the value has been stable for the full delay', () => {
  const { result, rerender } = renderHook(({ value }) => useDebounce(value, 400), { initialProps: { value: 't' } })

  rerender({ value: 'th' })
  act(() => vi.advanceTimersByTime(399))
  expect(result.current).toBe('t')

  act(() => vi.advanceTimersByTime(1))
  expect(result.current).toBe('th')
})

test('rapid changes collapse into a single update with the last value', () => {
  const { result, rerender } = renderHook(({ value }) => useDebounce(value, 400), { initialProps: { value: '' } })

  for (const value of ['w', 'we', 'wee', 'week', 'weekn', 'weeknd']) {
    rerender({ value })
    act(() => vi.advanceTimersByTime(100)) // typing faster than the delay
    expect(result.current).toBe('')
  }

  act(() => vi.advanceTimersByTime(400))
  expect(result.current).toBe('weeknd')
})
