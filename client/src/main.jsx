import './zodSetup.js'
import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './router.jsx'
import { queryClient } from './services/queryClient.js'
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

// While the app is starting up, lists appear at once instead of animating in (the entrance
// styles check for this mark). Two seconds after the page has loaded the mark comes off, and
// from then on cards and rows animate whenever they appear.
document.documentElement.dataset.booting = ''
window.addEventListener('load', () => setTimeout(() => delete document.documentElement.dataset.booting, 2000), { once: true })

// Before the first render: a returning signed-in user sees their account library straight away
session.start()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
