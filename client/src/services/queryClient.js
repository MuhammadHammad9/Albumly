import { QueryClient } from '@tanstack/react-query'

// The one data cache for the whole app. It lives in its own module so the router can start a
// page's requests (see router.jsx) before React has rendered anything.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Catalogue data changes rarely: reuse it for 5 minutes before refetching in the background
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      // Retry once when the server is unreachable or failing; a 4xx will not get better by asking again
      // (but never on a rate limit: asking again straight away is exactly what not to do)
      retry: (failureCount, error) =>
        failureCount < 1 && error.code !== 'rate_limited' && (error.status === 0 || error.status >= 500),
    },
  },
})
