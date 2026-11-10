import { Shuffle } from 'lucide-react'
import { useId, useState } from 'react'
import { artistNames, pickRandomPair } from '../../utils/battles.js'
import c from '../common/common.module.css'
import s from './community.module.css'

// Start a battle between two albums from your own library. The server copies the albums from
// your saved snapshots, so making a battle never asks Spotify for anything.
// albums: saved album snapshots. onCreate([idA, idB]) returns a promise.
export default function CreateBattle({ albums, onCreate, creating = false, error = '' }) {
  const [first, setFirst] = useState('')
  const [second, setSecond] = useState('')
  const id = useId()

  if (albums.length < 2) {
    return (
      <section className={s.panel} aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className={s.panelTitle}>
          Start a battle
        </h2>
        <p className={s.note}>Save at least two albums to your library to start a battle.</p>
      </section>
    )
  }

  const sorted = [...albums].sort((a, b) => a.name.localeCompare(b.name))
  const options = sorted.map((album) => (
    <option key={album.id} value={album.id}>
      {album.name}
      {artistNames(album) ? ` – ${artistNames(album)}` : ''}
    </option>
  ))
  const ready = first && second && first !== second

  function randomPair() {
    const [a, b] = pickRandomPair(albums.map((album) => album.id))
    setFirst(a)
    setSecond(b)
  }

  return (
    <section className={s.panel} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className={s.panelTitle}>
        Start a battle
      </h2>
      <form
        className={s.row}
        onSubmit={(event) => {
          event.preventDefault()
          if (ready) onCreate([first, second])
        }}
      >
        <label className={s.label}>
          First album
          <select className={s.select} value={first} onChange={(event) => setFirst(event.target.value)}>
            <option value="">Choose…</option>
            {options}
          </select>
        </label>
        <label className={s.label}>
          Second album
          <select className={s.select} value={second} onChange={(event) => setSecond(event.target.value)}>
            <option value="">Choose…</option>
            {options}
          </select>
        </label>
        <button type="button" className={c.buttonGhost} onClick={randomPair}>
          <Shuffle size={16} aria-hidden="true" />
          Random pair
        </button>
        <button type="submit" className={c.buttonAccent} disabled={!ready || creating}>
          {creating ? 'Starting…' : 'Start battle'}
        </button>
      </form>
      {first && first === second && <p className={s.error}>Pick two different albums.</p>}
      {error && (
        <p className={s.error} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
