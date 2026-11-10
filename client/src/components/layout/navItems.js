import { GitCompareArrows, Home, Library, Search, Sparkles, Swords } from 'lucide-react'

// Shared by the desktop sidebar and the mobile bottom bar, so the two can never drift apart.
// `section` groups the links under a heading in the sidebar.
export const NAV_ITEMS = [
  { to: '/', label: 'Home', icon: Home, end: true, section: 'Browse' },
  { to: '/search', label: 'Search', icon: Search, section: 'Browse' },
  { to: '/discover', label: 'Discover', icon: Sparkles, section: 'Browse' },
  { to: '/library', label: 'Library', icon: Library, section: 'Your music' },
  { to: '/compare', label: 'Compare', icon: GitCompareArrows, section: 'Your music' },
  { to: '/battles', label: 'Battles', icon: Swords, section: 'Community' },
]

// [['Browse', [...items]], ['Your music', [...]], ...] in first-seen order
export const NAV_SECTIONS = [
  ...NAV_ITEMS.reduce((sections, item) => sections.set(item.section, [...(sections.get(item.section) ?? []), item]), new Map()),
]
