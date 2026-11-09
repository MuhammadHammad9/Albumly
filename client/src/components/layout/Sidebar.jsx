import { Disc3 } from 'lucide-react'
import { Link, NavLink } from 'react-router'
import { NAV_ITEMS } from './navItems.js'
import s from './layout.module.css'

export default function Sidebar() {
  return (
    <aside className={s.sidebar}>
      <Link to="/" className={s.brand}>
        <Disc3 size={28} aria-hidden="true" />
        Albumly
      </Link>

      <nav aria-label="Main">
        <ul className={s.navList}>
          {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              {/* NavLink adds aria-current="page" on the active route; the CSS styles that */}
              <NavLink to={to} end={end} className={s.navLink}>
                <Icon size={20} aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  )
}
