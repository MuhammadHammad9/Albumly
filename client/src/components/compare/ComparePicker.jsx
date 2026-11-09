import { ArrowLeftRight, X } from 'lucide-react'
import lib from '../library/library.module.css'
import s from './compare.module.css'

// Group saved albums by artist for the <select> menus
function groupByArtist(entries) {
  const groups = new Map()
  for (const { album } of entries) {
    const artist = album.artists.map((a) => a.name).join(', ') || 'Unknown artist'
    if (!groups.has(artist)) groups.set(artist, [])
    groups.get(artist).push(album)
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([artist, albums]) => ({ artist, albums: albums.sort((x, y) => x.name.localeCompare(y.name)) }))
}

function Slot({ slot, value, groups, inLibrary, name, onChange }) {
  return (
    <label className={s.picker}>
      <span className={s.pickerLabel}>
        <span className={slot === 'a' ? s.swatchA : s.swatchB} aria-hidden="true" />
        Album {slot.toUpperCase()}
      </span>
      <select className={s.select} value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">Choose from your library…</option>
        {/* An album added with "Add to compare" may not be saved: still show it as chosen */}
        {value && !inLibrary(value) && <option value={value}>{name ?? 'Chosen album'}</option>}
        {groups.map((group) => (
          <optgroup key={group.artist} label={group.artist}>
            {group.albums.map((album) => (
              <option key={album.id} value={album.id}>
                {album.name}
                {album.year ? ` (${album.year})` : ''}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

// Two album menus (from the library) plus Swap and Clear. Controlled: the page owns the URL.
export default function ComparePicker({ a, b, entries, names, onChange }) {
  const groups = groupByArtist(entries)
  const saved = new Set(entries.map((entry) => entry.album.id))
  const inLibrary = (id) => saved.has(id)

  return (
    <div className={s.pickers}>
      <Slot slot="a" value={a} groups={groups} inLibrary={inLibrary} name={names[a]} onChange={(id) => onChange({ a: id, b })} />
      <Slot slot="b" value={b} groups={groups} inLibrary={inLibrary} name={names[b]} onChange={(id) => onChange({ a, b: id })} />
      <div className={s.pickerButtons}>
        <button type="button" className={lib.smallButton} disabled={!a && !b} onClick={() => onChange({ a: b, b: a })}>
          <ArrowLeftRight size={16} aria-hidden="true" />
          Swap
        </button>
        <button type="button" className={lib.subtle} disabled={!a && !b} onClick={() => onChange({ a: null, b: null })}>
          <X size={16} aria-hidden="true" />
          <span className="sr-only">Clear both albums</span>
        </button>
      </div>
    </div>
  )
}
