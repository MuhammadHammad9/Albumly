import { createBrowserRouter } from 'react-router'
import AppShell from './components/layout/AppShell.jsx'
import Home from './pages/Home.jsx'
import NotFound from './pages/NotFound.jsx'
import RouteError from './pages/RouteError.jsx'

// Turns a dynamic import into what the router's `lazy` option expects. Each lazy page becomes its
// own JavaScript file, downloaded the first time someone visits it instead of on first load.
const page = (load) => () => load().then((module) => ({ Component: module.default }))

// Every page is a child of AppShell, so the sidebar, search bar and footer stay put while the page changes
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    // Shown while the first lazy page is downloading; the shell itself appears immediately after
    HydrateFallback: () => null,
    children: [
      {
        // A crash while rendering a page lands here, inside the shell, instead of blanking the app
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Home /> },
          { path: 'search', lazy: page(() => import('./pages/Search.jsx')) },
          { path: 'artist/:id', lazy: page(() => import('./pages/Artist.jsx')) },
          { path: 'album/:id', lazy: page(() => import('./pages/Album.jsx')) },
          { path: 'library', lazy: page(() => import('./pages/Library.jsx')) },
          { path: 'library/collections/:id', lazy: page(() => import('./pages/Collection.jsx')) },
          { path: 'compare', lazy: page(() => import('./pages/Compare.jsx')) },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])
