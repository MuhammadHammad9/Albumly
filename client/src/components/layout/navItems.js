import { GitCompareArrows, Home, Library, Search, Sparkles, Swords } from 'lucide-react'

// Shared by the desktop sidebar and the mobile bottom bar, so the two can never drift apart
export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/discover', label: 'Discover', icon: Sparkles },
  { to: '/compare', label: 'Compare', icon: GitCompareArrows },
  { to: '/battles', label: 'Battles', icon: Swords },
]
