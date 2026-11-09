import { STATUSES, LIBRARY_SORTS } from '../../utils/library.js'
import s from './library.module.css'

// A labelled <select> with an "any" option; empty string means "no filter"
function Select({ label, value, onChange, anyLabel, options }) {
  return (
    <label>
      <span className="sr-only">{label}</span>
      <select className={s.select} value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        {anyLabel && <option value="">{anyLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}

// Controlled toolbar: it owns no state. Menus only offer values that exist in the library (`facets`).
// Every change is reported as onChange({ key: value }), which the page writes to the URL.
export default function LibraryFilters({ values, facets, onChange }) {
  const years = facets.years.map((year) => ({ value: String(year), label: String(year) }))

  return (
    <div className={s.toolbar} role="group" aria-label="Filter and sort your library">
      <input
        type="search"
        className={s.input}
        aria-label="Filter by title or artist"
        placeholder="Filter by title or artist"
        value={values.q}
        onChange={(event) => onChange({ q: event.target.value })}
      />
      <Select
        label="Artist"
        anyLabel="Any artist"
        value={values.artist}
        onChange={(artist) => onChange({ artist })}
        options={facets.artists.map((artist) => ({ value: artist.id, label: artist.name }))}
      />
      {years.length > 1 && (
        <>
          <Select label="From year" anyLabel="From" value={values.from} onChange={(from) => onChange({ from })} options={years} />
          <Select label="To year" anyLabel="To" value={values.to} onChange={(to) => onChange({ to })} options={years} />
        </>
      )}
      <Select
        label="Status"
        anyLabel="Any status"
        value={values.status}
        onChange={(status) => onChange({ status })}
        options={Object.entries(STATUSES).map(([value, label]) => ({ value, label }))}
      />
      {facets.tags.length > 0 && (
        <Select label="Tag" anyLabel="Any tag" value={values.tag} onChange={(tag) => onChange({ tag })} options={facets.tags.map((tag) => ({ value: tag, label: tag }))} />
      )}
      <Select label="Sort" value={values.sort} onChange={(sort) => onChange({ sort })} options={LIBRARY_SORTS.map((option) => ({ value: option.key, label: option.label }))} />
    </div>
  )
}
