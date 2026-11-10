import { NavLink } from 'react-router'
import { NAV_ITEMS } from './navItems.js'
import s from './layout.module.css'

// Replaces the sidebar on small screens, where thumbs reach the bottom edge most easily
export default function BottomNav() {
  return (
    <nav className={s.bottomNav} aria-label="Main">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={s.bottomLink} viewTransition>
          <Icon size={22} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
