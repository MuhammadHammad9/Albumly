import { Outlet, ScrollRestoration } from 'react-router'
import { useHealth } from '../../hooks/catalog.js'
import BottomNav from './BottomNav.jsx'
import Navbar from './Navbar.jsx'
import Sidebar from './Sidebar.jsx'
import s from './layout.module.css'

// The frame around every page. <Outlet /> is where the current route's page renders.
export default function AppShell() {
  const { data: health } = useHealth()

  return (
    <div className={s.shell}>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar />

      <div className={s.main}>
        <Navbar />
        <main id="main" className={s.content}>
          <Outlet />
        </main>
        <footer className={s.footer}>
          {health?.provider === 'mock' && <p className={s.demoNote}>Demo mode: showing a sample catalogue of fictional artists.</p>}
          <p>Albumly is an independent project and is not affiliated with or endorsed by Spotify.</p>
        </footer>
      </div>

      <BottomNav />
      <ScrollRestoration />
    </div>
  )
}
