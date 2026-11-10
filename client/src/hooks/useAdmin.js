import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// Admin data. `api` is the community API (hooks/useCommunity.js) or a fake in tests.

export function useAdminStatus(api, enabled) {
  return useQuery({ queryKey: ['admin', 'status'], queryFn: () => api.adminStatus(), enabled, retry: false })
}

// Refreshes every 15 seconds while the page is open. This asks only our own server, which
// reads counters it already keeps: no Spotify request.
export function useAdminMetrics(api, enabled) {
  return useQuery({ queryKey: ['admin', 'metrics'], queryFn: () => api.adminMetrics(), enabled, refetchInterval: 15_000 })
}

export function useReports(api, status, enabled) {
  return useQuery({ queryKey: ['admin', 'reports', status], queryFn: () => api.adminReports({ status }), enabled })
}

// Hide / dismiss / restore, then reload both queues
export function useModeration(api) {
  const client = useQueryClient()
  const refresh = () => client.invalidateQueries({ queryKey: ['admin', 'reports'] })
  const resolve = useMutation({ mutationFn: ({ report, action, reason }) => api.resolveReport(report.id, { action, reason }), onSuccess: refresh })
  const restore = useMutation({ mutationFn: ({ report }) => api.unhide(report.targetType, report.target.hideKey), onSuccess: refresh })
  return { resolve, restore }
}
