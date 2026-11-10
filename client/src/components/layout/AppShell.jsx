import { Link, Outlet, ScrollRestoration, useLocation, useNavigationType } from 'react-router'
import ImportPrompt from '../account/ImportPrompt.jsx'
import SessionBanner from '../account/SessionBanner.jsx'
import { useHealth } from '../../hooks/catalog.js'
import { useSpotlight } from '../../hooks/useSpotlight.js'
import BottomNav from './BottomNav.jsx'
import Navbar from './Navbar.jsx'
import Sidebar from './Sidebar.jsx'
import s from './layout.module.css'

// The frame around every page. <Outlet /> is where the current route's page renders.
export default function AppShell() {
  const { data: health } = useHealth()
  const { pathname } = useLocation()
  // "POP" is the first load and the back/forward buttons: those show the page at once.
  // Pages opened by a link fade in.
  const arrivedByLink = useNavigationType() !== 'POP'
  useSpotlight()

  return (
    <div className={s.shell}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar />

      <div className={s.main}>
        <Navbar />
        <main id="main" className={s.content}>
          <SessionBanner />
          <ImportPrompt />
          {/* key: each address gets a fresh page, so its entrance animations play again */}
          <div key={pathname} className={arrivedByLink ? s.pageEnter : undefined}>
            <Outlet />
          </div>
        </main>
        <footer className={s.footer}>
          {health?.provider === 'mock' && <p className={s.demoNote}>Demo mode: showing a sample catalogue of fictional artists.</p>}
          <p>Albumly is an independent project and is not affiliated with or endorsed by Spotify.</p>
          <p>
            <Link to="/privacy">Privacy</Link>
          </p>
        </footer>
      </div>

      <BottomNav />
      <ScrollRestoration />
    </div>
  )
}
