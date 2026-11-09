import s from './search.module.css'

const TAB_LABELS = { artist: 'Artists', album: 'Albums', track: 'Tracks' }
const KIND_LABELS = { album: 'Albums only', single: 'Singles only', ep: 'EPs only', compilation: 'Compilations only' }

// Shows how the search box text was read, e.g. Searching “the weeknd” · Year 2020 · Albums only.
// Nothing is shown for plain text, where there is nothing to explain.
export default function ParsedQuery({ parsed }) {
  const chips = []
  if (parsed.artist) chips.push(['Artist', parsed.artist])
  if (parsed.yearFrom !== undefined) {
    chips.push(['Year', parsed.yearFrom === parsed.yearTo ? String(parsed.yearFrom) : `${parsed.yearFrom}–${parsed.yearTo}`])
  }
  if (parsed.albumType) chips.push(['Type', KIND_LABELS[parsed.albumType]])
  else if (parsed.tab) chips.push(['Showing', TAB_LABELS[parsed.tab]])
  if (chips.length === 0) return null

  return (
    <p className={s.parsed}>
      Understood as:
      {parsed.text && (
        <span className={s.parsedChip}>
          <span>Text </span>“{parsed.text}”
        </span>
      )}
      {chips.map(([label, value]) => (
        <span key={label} className={s.parsedChip}>
          <span>{label} </span>
          {value}
        </span>
      ))}
    </p>
  )
}
