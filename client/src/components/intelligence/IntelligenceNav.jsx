import { NavLink } from 'react-router'
import s from './intelligence.module.css'

// The tabs shared by every Discover page. Each one is its own address, so Back works.
const INTELLIGENCE_LINKS = [
  { to: '/discover', label: 'For you', end: true },
  { to: '/discover/insights', label: 'Insights' },
  { to: '/discover/calendar', label: 'Release calendar' },
  { to: '/discover/connections', label: 'Connections' },
]

export default function IntelligenceNav() {
  return (
    <nav aria-label="Discover" className={s.subnav}>
      {INTELLIGENCE_LINKS.map(({ to, label, end }) => (
        <NavLink key={to} to={to} end={end} className={s.subnavLink}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
