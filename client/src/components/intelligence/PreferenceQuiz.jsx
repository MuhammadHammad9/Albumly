import { useState } from 'react'
import { useArtistSearch } from '../../hooks/catalog.js'
import { preferences } from '../../hooks/usePreferences.js'
import { useDebounce } from '../../hooks/useDebounce.js'
import { QUIZ_DECADES, STARTER_GENRES, decadeLabel } from '../../utils/preferences.js'
import s from './intelligence.module.css'

function Pill({ pressed, onClick, children }) {
  return (
    <button type="button" className={s.pill} aria-pressed={pressed} onClick={onClick}>
      {children}
    </button>
  )
}

// The discovery quiz: genres, decades and artists the user likes. Every choice is saved at once.
// artistOptions: artists to offer without searching (from the library and recently explored)
export default function PreferenceQuiz({ quiz, genreOptions = [], artistOptions = [] }) {
  const [query, setQuery] = useState('')
  const debounced = useDebounce(query.trim(), 400)
  const search = useArtistSearch(debounced) // the search endpoint, not the limited discography one
  const genres = [...new Set([...quiz.genres, ...genreOptions, ...STARTER_GENRES])].slice(0, 40)
  const picked = new Set(quiz.artists.map((a) => a.id))
  const offered = [...quiz.artists, ...artistOptions.filter((a) => !picked.has(a.id))].slice(0, 16)
  const found = (search.data?.items ?? []).filter((a) => !offered.some((o) => o.id === a.id)).slice(0, 6)

  return (
    <div className={s.panelBody}>
      <fieldset className={s.fieldset}>
        <legend className={s.legend}>Genres and moods you like</legend>
        <div className={s.pills}>
          {genres.map((genre) => (
            <Pill key={genre} pressed={quiz.genres.includes(genre)} onClick={() => preferences.toggleGenre(genre)}>
              {genre}
            </Pill>
          ))}
        </div>
      </fieldset>

      <fieldset className={s.fieldset}>
        <legend className={s.legend}>Decades</legend>
        <div className={s.pills}>
          {QUIZ_DECADES.map((decade) => (
            <Pill key={decade} pressed={quiz.decades.includes(decade)} onClick={() => preferences.toggleDecade(decade)}>
              {decadeLabel(decade)}
            </Pill>
          ))}
        </div>
      </fieldset>

      <fieldset className={s.fieldset}>
        <legend className={s.legend}>Artists</legend>
        <div className={s.pills}>
          {offered.map((artist) => (
            <Pill key={artist.id} pressed={picked.has(artist.id)} onClick={() => preferences.toggleArtist(artist)}>
              {artist.name}
            </Pill>
          ))}
        </div>
        <label className={s.muted} style={{ display: 'block', marginTop: 12 }}>
          Find another artist
          <br />
          <input className={s.input} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Artist name" />
        </label>
        {found.length > 0 && (
          <div className={s.pills} style={{ marginTop: 8 }} aria-label="Search results">
            {found.map((artist) => (
              <Pill key={artist.id} pressed={false} onClick={() => preferences.toggleArtist(artist)}>
                + {artist.name}
              </Pill>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  )
}
