import { useState } from 'react'
import { SEARCH_SORTS } from '../../utils/queryParser.js'
import s from './search.module.css'

const KIND_OPTIONS = [
  { value: 'album', label: 'Albums' },
  { value: 'single', label: 'Singles' },
  { value: 'ep', label: 'EPs' },
  { value: 'compilation', label: 'Compilations' },
]

// A text or number box that only reports its value when you press Enter or leave it. Year and
// artist filters each cost a new search request, so they must not fire on every keystroke.
function CommitInput({ label, value, onCommit, className, ...inputProps }) {
  const [text, setText] = useState(value)
  const commit = () => text.trim() !== value && onCommit(text.trim())

  return (
    <label className={s.field}>
      {label}
      <input
        className={className}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
        }}
        {...inputProps}
      />
    </label>
  )
}

// Controlled: the page passes the current values (from the URL) and gets changes through onChange.
// Year and artist go to the server; type, minimum tracks and order work on the loaded results.
export default function SearchFilters({ tab, values, onChange }) {
  const sorts = SEARCH_SORTS[tab]
  const hasFilters = ['from', 'to', 'artist', 'kind', 'min'].some((key) => values[key]) || (values.sort && values.sort !== 'relevance')
  // key: when a value changes from outside (URL, Clear), the box starts again from the new value
  const commitProps = (name) => ({ value: values[name], onCommit: (value) => onChange({ [name]: value }) })

  return (
    <div className={s.filters} role="group" aria-label="Search filters">
      <CommitInput key={`from-${values.from}`} label="From year" className={s.year} type="number" min={1900} max={2100} placeholder="Any" inputMode="numeric" {...commitProps('from')} />
      <CommitInput key={`to-${values.to}`} label="To year" className={s.year} type="number" min={1900} max={2100} placeholder="Any" inputMode="numeric" {...commitProps('to')} />
      <CommitInput key={`artist-${values.artist}`} label="Artist" className={s.artist} placeholder="Any artist" maxLength={100} {...commitProps('artist')} />

      {tab === 'album' && (
        <>
          <label className={s.field}>
            Type
            <select className={s.select} value={values.kind} onChange={(event) => onChange({ kind: event.target.value })}>
              <option value="">Any type</option>
              {KIND_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <CommitInput key={`min-${values.min}`} label="Min. tracks" className={s.number} type="number" min={1} max={200} placeholder="Any" inputMode="numeric" {...commitProps('min')} />
        </>
      )}

      <label className={s.field}>
        Order
        <select className={s.select} value={values.sort || 'relevance'} onChange={(event) => onChange({ sort: event.target.value })}>
          {sorts.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {hasFilters && (
        <button type="button" className={s.clear} onClick={() => onChange({ from: '', to: '', artist: '', kind: '', min: '', sort: '' })}>
          Clear filters
        </button>
      )}
    </div>
  )
}
