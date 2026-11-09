import { CardGrid } from '../common/CardGrid.jsx'
import AlbumCard from './AlbumCard.jsx'
import Editions from './Editions.jsx'
import s from './explorer.module.css'

// The explorer's grid. `groups` come from groupEditions: a release with other editions is drawn
// as a small stack (the original on top) with an "editions" button underneath.
export default function ReleaseGrid({ groups, showArtist = false }) {
  return (
    <CardGrid>
      {groups.map(({ key, primary, editions }) =>
        editions.length === 0 ? (
          <AlbumCard key={key} release={primary} showArtist={showArtist} />
        ) : (
          <li key={key} className={s.stack}>
            {/* AlbumCard renders its own <li>, so it needs a list around it */}
            <ul className={s.stackCard}>
              <AlbumCard release={primary} showArtist={showArtist} />
            </ul>
            <Editions primary={primary} editions={editions} />
          </li>
        ),
      )}
    </CardGrid>
  )
}
