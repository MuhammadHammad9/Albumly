import { Bookmark, BookmarkCheck } from 'lucide-react'
import { libraryActions, useEntry, useLibrary } from '../../hooks/useLibrary.js'
import { countCollectionsWith, entryHasData, removalMessage } from '../../utils/library.js'
import ConfirmButton from './ConfirmButton.jsx'
import s from './library.module.css'

// A compact bookmark button for album cards. aria-pressed tells screen readers whether the album
// is saved; the label stays the same ("Save X") so the pressed state alone carries the meaning.
export default function SaveToggle({ album, className = '' }) {
  const entry = useEntry(album.id)
  const collectionCount = useLibrary((state) => countCollectionsWith(state.collections, album.id))
  const label = `Save ${album.name}`

  if (!entry) {
    return (
      <span className={className}>
        <button type="button" className={s.toggle} aria-pressed="false" aria-label={label} title="Save to library" onClick={() => libraryActions().saveAlbum(album)}>
          <Bookmark size={18} aria-hidden="true" />
        </button>
      </span>
    )
  }

  return (
    <span className={className}>
      {/* Removing an album with a rating, notes or collections asks first; a bare save does not */}
      <ConfirmButton
        popover
        needsConfirm={entryHasData(entry, collectionCount)}
        message={removalMessage(album.name, collectionCount)}
        confirmLabel="Remove"
        onConfirm={() => libraryActions().removeAlbum(album.id)}
        className={s.toggle}
        aria-pressed="true"
        aria-label={label}
        title="Saved. Click to remove from library"
      >
        <BookmarkCheck size={18} aria-hidden="true" />
      </ConfirmButton>
    </span>
  )
}
