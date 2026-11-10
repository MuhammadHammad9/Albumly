import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import { EMPTY_QUIZ } from '../utils/preferences.js'
import { DEFAULT_WEIGHTS, MAX_WEIGHT, sanitizeWeights } from '../utils/recommender.js'

// The discovery quiz answers and the recommendation weights, remembered in this browser.
// A tiny store in the same style as services/recents.js. This is Albumly's own preference data,
// not the library, so it does not go through the library repository.

const STORAGE_KEY = 'albumly:intelligence:v1' // bump the version if the saved shape ever changes

const weight = z.number().min(0).max(MAX_WEIGHT)
const schema = z.object({
  quiz: z.object({
    genres: z.array(z.string().min(1).max(60)).max(30),
    decades: z.array(z.number().int().min(1900).max(2100)).max(20),
    artists: z.array(z.object({ id: z.string().min(1).max(200), name: z.string().max(500) })).max(20),
  }),
  weights: z.object({ genre: weight, era: weight, connection: weight, taste: weight }),
})

const defaults = () => ({ quiz: EMPTY_QUIZ, weights: DEFAULT_WEIGHTS })

// localStorage may be missing, blocked or hold junk: fall back to the defaults
function load() {
  try {
    const result = schema.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY)))
    return result.success ? result.data : defaults()
  } catch {
    return defaults()
  }
}

let state = load()
const listeners = new Set()

function setState(next) {
  state = next
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Still works for this visit; it just will not be remembered
  }
  listeners.forEach((listener) => listener())
}

// Adds the item when missing, removes it when present
const toggle = (list, item, same = (a, b) => a === b) => (list.some((x) => same(x, item)) ? list.filter((x) => !same(x, item)) : [...list, item])

export const preferences = {
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => state,

  setWeight: (part, value) => setState({ ...state, weights: sanitizeWeights({ ...state.weights, [part]: value }) }),
  resetWeights: () => setState({ ...state, weights: DEFAULT_WEIGHTS }),

  toggleGenre: (genre) => setState({ ...state, quiz: { ...state.quiz, genres: toggle(state.quiz.genres, genre.trim().toLowerCase()).slice(0, 30) } }),
  toggleDecade: (decade) => setState({ ...state, quiz: { ...state.quiz, decades: toggle(state.quiz.decades, decade).slice(0, 20) } }),
  toggleArtist: (artist) =>
    setState({ ...state, quiz: { ...state.quiz, artists: toggle(state.quiz.artists, { id: artist.id, name: artist.name }, (a, b) => a.id === b.id).slice(0, 20) } }),
  clearQuiz: () => setState({ ...state, quiz: EMPTY_QUIZ }),

  // Tests start from a clean slate; also re-reads storage
  reset() {
    state = load()
    listeners.forEach((listener) => listener())
  },
}

// { quiz, weights }, re-rendering whenever either changes
export function usePreferences() {
  return useSyncExternalStore(preferences.subscribe, preferences.getSnapshot)
}
