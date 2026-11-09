import { Disc3 } from 'lucide-react'
import { Link } from 'react-router'
import SearchBar from '../common/SearchBar.jsx'
import s from './layout.module.css'

export default function Navbar() {
  return (
    <header className={s.navbar}>
      {/* The sidebar carries the brand on desktop; this copy only shows on mobile */}
      <Link to="/" className={s.navbarBrand} aria-label="Albumly home">
        <Disc3 size={28} aria-hidden="true" />
      </Link>
      <SearchBar />
    </header>
  )
}
