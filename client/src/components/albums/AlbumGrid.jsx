import { CardGrid } from '../common/CardGrid.jsx'
import AlbumCard from './AlbumCard.jsx'

// `getNote(release)` optionally adds a line under each card (the library uses it for status and rating)
export default function AlbumGrid({ releases, showArtist = false, getNote }) {
  return (
    <CardGrid>
      {releases.map((release) => (
        <AlbumCard key={release.id} release={release} showArtist={showArtist} note={getNote?.(release)} />
      ))}
    </CardGrid>
  )
}
