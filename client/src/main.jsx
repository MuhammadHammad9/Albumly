import './zodSetup.js'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './router.jsx'
import { session } from './services/session.js'
import './styles/global.css'

// Inter from Google Fonts, added from here rather than index.html so the page can draw straight
// away with the fallback font (a blocking stylesheet cost ~0.9 s on Lighthouse's mobile test).
// Done in a script because the CSP forbids the usual inline onload trick. display=optional: if
// Inter is not ready almost at once, this visit keeps the fallback font instead of swapping
// mid-page (a swap made the layout jump); the next visit has it cached.
const font = document.createElement('link')
font.rel = 'stylesheet'
font.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=optional'
document.head.append(font)

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
