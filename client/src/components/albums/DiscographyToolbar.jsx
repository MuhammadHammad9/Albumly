import { Layers, LayoutGrid, List, Milestone, Search } from 'lucide-react'
import { SORT_OPTIONS } from '../../utils/releases.js'
import s from './explorer.module.css'

// Keys match VIEW_KEYS in utils/releases.js
const VIEWS = [
  { key: 'grid', label: 'Grid', icon: LayoutGrid },
  { key: 'list', label: 'List', icon: List },
  { key: 'timeline', label: 'Timeline', icon: Milestone },
]

// Controlled component: it owns no state. The parent passes the current values and
// receives every change through onChange({ field: value }).
export default function DiscographyToolbar({ text, sort, view, yearFrom, yearTo, years, groupEditions, onChange }) {
  return (
    <div className={s.toolbar}>
      <label className={s.search}>
        <span className="sr-only">Filter releases by title</span>
        <Search size={16} aria-hidden="true" />
        <input type="search" placeholder="Filter releases" value={text} onChange={(event) => onChange({ q: event.target.value })} />
      </label>

      {years.length > 1 && (
        <div className={s.years}>
          <YearSelect label="From year" placeholder="From" value={yearFrom} years={years} onChange={(year) => onChange({ from: year })} />
          <span aria-hidden="true">–</span>
          <YearSelect label="To year" placeholder="To" value={yearTo} years={years} onChange={(year) => onChange({ to: year })} />
        </div>
      )}

      <label className={s.field}>
        <span className="sr-only">Sort releases</span>
        {/* The timeline is always chronological, so sorting does not apply there */}
        <select className={s.select} value={sort} disabled={view === 'timeline'} onChange={(event) => onChange({ sort: event.target.value })}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {/* On: deluxe and remastered editions stack under the original. Off: every release on its own. */}
      <button
        type="button"
        className={s.editionToggle}
        aria-pressed={groupEditions}
        onClick={() => onChange({ editions: groupEditions ? 'separate' : 'grouped' })}
      >
        <Layers size={16} aria-hidden="true" />
        Group editions
      </button>

      <div className={s.viewToggle} role="group" aria-label="View">
        {VIEWS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" aria-pressed={view === key} title={label} onClick={() => onChange({ view: key })}>
            <Icon size={18} aria-hidden="true" />
            <span className="sr-only">{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function YearSelect({ label, placeholder, value, years, onChange }) {
  return (
    <label className={s.field}>
      <span className="sr-only">{label}</span>
      <select className={s.select} value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder}</option>
        {years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </label>
  )
}
