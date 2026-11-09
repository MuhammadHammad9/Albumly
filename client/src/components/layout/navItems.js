import { GitCompareArrows, Home, Library, Search } from 'lucide-react'

// Shared by the desktop sidebar and the mobile bottom bar, so the two can never drift apart
export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/compare', label: 'Compare', icon: GitCompareArrows },
]
