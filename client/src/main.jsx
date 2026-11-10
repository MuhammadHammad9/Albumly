import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './router.jsx'
import { session } from './services/session.js'
import './styles/global.css'

const queryClient = new QueryClient({
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

// Before the first render: a returning signed-in user sees their account library straight away
session.start()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
