import { Disc3 } from 'lucide-react'
import { Link, NavLink } from 'react-router'
import { NAV_SECTIONS } from './navItems.js'
import s from './layout.module.css'

export default function Sidebar() {
  return (
    <aside className={s.sidebar}>
      <Link to="/" className={s.brand}>
        <span className={s.brandMark}>
          <Disc3 size={22} aria-hidden="true" />
        </span>
        Albumly
      </Link>

      <nav aria-label="Main" className={s.sideNav}>
        {NAV_SECTIONS.map(([section, items]) => (
          <div key={section} className={s.navSection}>
            <p className={s.navHeading} aria-hidden="true">
              {section}
            </p>
            <ul className={s.navList}>
              {items.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  {/* NavLink adds aria-current="page" on the active route; the CSS styles that */}
                  <NavLink to={to} end={end} className={s.navLink} viewTransition>
                    <Icon size={19} aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <p className={s.sideNote}>Independent project · Not affiliated with Spotify</p>
    </aside>
  )
}
