import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '../services/api.js'
import { session } from '../services/session.js'
import { sessionStore } from '../stores/sessionStore.js'
import { createCommunityApi } from '../utils/communityApi.js'

// Signed-in calls go through the session (it adds the token and refreshes it once on a 401);
// public calls go straight to the API. 'optional' sends the token only when someone is signed in.
function communityRequest(method, path, { auth, body } = {}) {
  const signedIn = sessionStore.getState().status === 'signedIn'
  if (auth === true || (auth === 'optional' && signedIn)) return session.request(method, path, body)
  return apiRequest(method, path, { body })
}

// The app's community API. Pages take an `api` prop defaulting to this, so tests can pass a fake.
export const communityApi = createCommunityApi(communityRequest)

// ---------- shared collections ----------

export function useShare(api, collectionId, enabled) {
  return useQuery({
    queryKey: ['share', collectionId],
    queryFn: () => api.getShare(collectionId),
    enabled,
    retry: false,
  })
}

export function useSaveShare(api, collectionId) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (settings) => api.saveShare(collectionId, settings),
    onSuccess: (data) => client.setQueryData(['share', collectionId], data),
  })
}

// ---------- Album Battle ----------

// `who` is part of the key, so signing in or out loads the list again with or without "my vote"
export function useBattles(api, { view, who }) {
  return useQuery({
    queryKey: ['battles', view, who],
    queryFn: () => api.listBattles({ view, limit: 20 }),
    enabled: view !== 'vote' || Boolean(who),
  })
}

export function useLeaderboard(api, enabled = true) {
  return useQuery({ queryKey: ['leaderboard'], queryFn: () => api.getLeaderboard({ limit: 50 }), enabled })
}

// After a vote, the battle in every cached list is replaced with the server's answer
export function useVote(api) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ battleId, choice }) => api.vote(battleId, choice),
    onSuccess: ({ battle }) => {
      client.setQueriesData({ queryKey: ['battles'] }, (data) => data && { ...data, battles: data.battles.map((item) => (item.id === battle.id ? battle : item)) })
      client.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
}

export function useCreateBattle(api) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (albumIds) => api.createBattle(albumIds),
    onSuccess: () => client.invalidateQueries({ queryKey: ['battles'] }),
  })
}
