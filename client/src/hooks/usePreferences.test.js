import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'
import { DEFAULT_WEIGHTS } from '../utils/recommender.js'
import { preferences, usePreferences } from './usePreferences.js'

const KEY = 'albumly:intelligence:v1'

beforeEach(() => {
  localStorage.clear()
  preferences.reset()
})

test('starts with the default weights and an empty quiz', () => {
  const { result } = renderHook(() => usePreferences())
  expect(result.current.weights).toEqual(DEFAULT_WEIGHTS)
  expect(result.current.quiz).toEqual({ genres: [], decades: [], artists: [] })
})

test('changes are shown at once and saved', () => {
  const { result } = renderHook(() => usePreferences())
  act(() => preferences.setWeight('genre', 12))
  act(() => preferences.toggleGenre('  Ambient '))
  act(() => preferences.toggleDecade(1990))
  act(() => preferences.toggleArtist({ id: 'x', name: 'X', extra: 'dropped' }))

  expect(result.current.weights.genre).toBe(10) // clamped
  expect(result.current.quiz).toEqual({ genres: ['ambient'], decades: [1990], artists: [{ id: 'x', name: 'X' }] })
  expect(JSON.parse(localStorage.getItem(KEY)).quiz.genres).toEqual(['ambient'])

  act(() => preferences.toggleGenre('ambient'))
  act(() => preferences.resetWeights())
  expect(result.current.quiz.genres).toEqual([])
  expect(result.current.weights).toEqual(DEFAULT_WEIGHTS)
})

test('junk in storage is ignored', () => {
  localStorage.setItem(KEY, JSON.stringify({ quiz: { genres: 'nope' }, weights: {} }))
  preferences.reset()
  expect(preferences.getSnapshot().weights).toEqual(DEFAULT_WEIGHTS)
  localStorage.setItem(KEY, '{not json')
  preferences.reset()
  expect(preferences.getSnapshot().quiz.genres).toEqual([])
})
