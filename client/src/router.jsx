import { createBrowserRouter } from 'react-router'
import AppShell from './components/layout/AppShell.jsx'
import Home from './pages/Home.jsx'
import NotFound from './pages/NotFound.jsx'
import RouteError from './pages/RouteError.jsx'
import { albumQuery, artistQuery, discographyQuery } from './hooks/catalog.js'
import { queryClient } from './services/queryClient.js'

// Turns a dynamic import into what the router's `lazy` option expects. Each lazy page becomes its
// own JavaScript file, downloaded the first time someone visits it instead of on first load.
const page = (load) => () => load().then((module) => ({ Component: module.default }))

// Starts a page's requests while its JavaScript file is still downloading, instead of after it
// has rendered. Never waits and never throws: the page shows loading and error states itself.
const prefetch = (queries) => ({ params }) => {
  for (const query of queries(params)) queryClient.prefetchQuery(query)
  return null
}

// Every page is a child of AppShell, so the sidebar, search bar and footer stay put while the page changes
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    // Last safety net: a crash in the shell itself (navigation, footer) would otherwise show the
    // router's built-in developer error screen
    errorElement: <RouteError />,
    // Shown while the first lazy page is downloading; the shell itself appears immediately after
    HydrateFallback: () => null,
    children: [
      {
        // A crash while rendering a page lands here, inside the shell, instead of blanking the app
        errorElement: <RouteError />,
        children: [
          { index: true, element: <Home /> },
          { path: 'search', lazy: page(() => import('./pages/Search.jsx')) },
          {
            path: 'artist/:id',
            loader: prefetch(({ id }) => [artistQuery(id), discographyQuery(id)]),
            lazy: page(() => import('./pages/Artist.jsx')),
          },
          { path: 'album/:id', loader: prefetch(({ id }) => [albumQuery(id)]), lazy: page(() => import('./pages/Album.jsx')) },
          { path: 'library', lazy: page(() => import('./pages/Library.jsx')) },
          { path: 'library/collections/:id', lazy: page(() => import('./pages/Collection.jsx')) },
          { path: 'compare', lazy: page(() => import('./pages/Compare.jsx')) },
          { path: 'account', lazy: page(() => import('./pages/Account.jsx')) },
          { path: 'privacy', lazy: page(() => import('./pages/Privacy.jsx')) },
          { path: 'discover', lazy: page(() => import('./pages/Discover.jsx')) },
          { path: 'discover/insights', lazy: page(() => import('./pages/Insights.jsx')) },
          { path: 'discover/calendar', lazy: page(() => import('./pages/ReleaseCalendar.jsx')) },
          { path: 'discover/connections', lazy: page(() => import('./pages/Connections.jsx')) },
          { path: 'shared/:slug', lazy: page(() => import('./pages/PublicCollection.jsx')) },
          { path: 'battles', lazy: page(() => import('./pages/Battles.jsx')) },
          { path: 'admin', lazy: page(() => import('./pages/Admin.jsx')) },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])
