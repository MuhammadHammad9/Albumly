import { Bookmark, BookmarkCheck } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { libraryActions, useEntries, useEntry, useLibrary } from '../../hooks/useLibrary.js'
import { LIMITS, countCollectionsWith, entryHasData, libraryFacets, removalMessage } from '../../utils/library.js'
import common from '../common/common.module.css'
import CollectionPicker from './CollectionPicker.jsx'
import ConfirmButton from './ConfirmButton.jsx'
import RatingPicker from './RatingPicker.jsx'
import StatusPicker from './StatusPicker.jsx'
import TagInput from './TagInput.jsx'
import s from './library.module.css'

// A text box that saves when you leave it (not on every keystroke), then says "Saved" briefly
function NoteField({ label, value, onSave, placeholder }) {
  const [text, setText] = useState(value)
  const [saved, setSaved] = useState(false)
  const id = useId()

  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 2000)
    return () => clearTimeout(timer)
  }, [saved])

  return (
    <div className={s.noteField}>
      <div className={s.noteHeader}>
        <label htmlFor={id} className={s.legend}>
          {label}
        </label>
        <span className={s.message} role="status">
          {saved ? 'Saved' : ''}
        </span>
      </div>
      <textarea
        id={id}
        className={s.textarea}
        value={text}
        maxLength={LIMITS.text}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          if (text === value) return
          onSave(text)
          setSaved(true)
        }}
      />
    </div>
  )
}

// "Your library" on the album page: save, status, rating, tags, review, notes and collections.
// Everything is stored in this browser through the library store.
export default function LibraryPanel({ album }) {
  const entry = useEntry(album.id)
  const collectionCount = useLibrary((state) => countCollectionsWith(state.collections, album.id))
  const allEntries = useEntries()
  const actions = libraryActions()
  const id = album.id

  return (
    <section className={s.panel} aria-labelledby="library-panel-title">
      <div className={s.panelHeader}>
        <h2 id="library-panel-title" className={s.panelTitle}>
          Your library
        </h2>
        {entry ? (
          <div className={s.titleRow}>
            <span className={s.savedBadge}>
              <BookmarkCheck size={18} aria-hidden="true" />
              Saved
            </span>
            <ConfirmButton
              needsConfirm={entryHasData(entry, collectionCount)}
              message={removalMessage(album.name, collectionCount)}
              confirmLabel="Remove"
              onConfirm={() => actions.removeAlbum(id)}
              className={s.subtle}
            >
              Remove from library
            </ConfirmButton>
          </div>
        ) : (
          <button type="button" className={common.buttonAccent} onClick={() => actions.saveAlbum(album)}>
            <Bookmark size={16} aria-hidden="true" />
            Save to library
          </button>
        )}
      </div>

      {entry ? (
        <div className={s.panelGrid}>
          <div className={s.column}>
            <StatusPicker name={`status-${id}`} value={entry.status} onChange={(status) => actions.setStatus(id, status)} />
            <RatingPicker name={`rating-${id}`} value={entry.rating} onChange={(rating) => actions.setRating(id, rating)} />
            <TagInput
              tags={entry.tags}
              suggestions={libraryFacets(allEntries).tags}
              onAdd={(tag) => actions.addTag(id, tag)}
              onRemove={(tag) => actions.removeTag(id, tag)}
            />
          </div>
          <div className={s.column}>
            <NoteField label="Review" value={entry.review} placeholder="What did you think?" onSave={(text) => actions.setReview(id, text)} />
            <NoteField label="Notes" value={entry.notes} placeholder="Private notes, e.g. favourite tracks" onSave={(text) => actions.setNotes(id, text)} />
            <CollectionPicker album={album} />
          </div>
        </div>
      ) : (
        <>
          <p className={s.message}>Save this album to give it a status, a rating, tags and notes. Adding it to a collection saves it too.</p>
          <CollectionPicker album={album} />
        </>
      )}
    </section>
  )
}
