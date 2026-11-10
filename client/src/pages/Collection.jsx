import { ListMusic, Pencil } from 'lucide-react'
import { useId, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { EmptyState } from '../components/common/Feedback.jsx'
import SharePanel from '../components/community/SharePanel.jsx'
import ConfirmButton from '../components/library/ConfirmButton.jsx'
import SortableAlbumList from '../components/library/SortableAlbumList.jsx'
import lib from '../components/library/library.module.css'
import { libraryActions, useLibrary } from '../hooks/useLibrary.js'
import { usePageTitle } from '../hooks/usePageTitle.js'
import { pluralize } from '../utils/format.js'
import NotFound from './NotFound.jsx'
import s from './pages.module.css'

// Rename in place: a heading with a pencil button that turns into a small form
function CollectionTitle({ collection }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(collection.name)
  const [error, setError] = useState('')
  const inputId = useId()

  function save(event) {
    event.preventDefault()
    const result = libraryActions().renameCollection(collection.id, name)
    if (result.ok) {
      setEditing(false)
      setError('')
    } else setError(result.message)
  }

  if (!editing) {
    return (
      <div className={lib.titleRow}>
        <h1 className={s.pageTitle}>{collection.name}</h1>
        <button
          type="button"
          className={lib.iconButton}
          aria-label={`Rename ${collection.name}`}
          onClick={() => {
            setName(collection.name)
            setEditing(true)
          }}
        >
          <Pencil size={18} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <form className={lib.inlineForm} onSubmit={save} onKeyDown={(event) => event.key === 'Escape' && setEditing(false)}>
      <label htmlFor={inputId} className="sr-only">
        Collection name
      </label>
      {/* autoFocus: the user just asked to edit this field */}
      <input
        id={inputId}
        className={lib.input}
        value={name}
        maxLength={80}
        autoFocus
        aria-invalid={Boolean(error)}
        aria-describedby={`${inputId}-error`}
        onChange={(event) => setName(event.target.value)}
      />
      <button type="submit" className={lib.smallButton}>
        Save
      </button>
      <button type="button" className={lib.subtle} onClick={() => setEditing(false)}>
        Cancel
      </button>
      <p id={`${inputId}-error`} className={lib.error} role="alert">
        {error}
      </p>
    </form>
  )
}

export default function Collection() {
  const { id } = useParams()
  const navigate = useNavigate()
  const collection = useLibrary((state) => state.collections.find((c) => c.id === id))
  const entries = useLibrary((state) => state.entries)
  usePageTitle(collection?.name ?? 'Collection')

  if (!collection) return <NotFound title="Collection not found" message="It may have been deleted, or it was made in another browser." />

  const albums = collection.albumIds.map((albumId) => entries[albumId].album)
  const actions = libraryActions()

  return (
    <>
      <p className={s.eyebrow}>
        <Link to="/library?view=collections" className={s.inlineLink}>
          Library
        </Link>{' '}
        / Collection
      </p>
      {/* key: a rename elsewhere (another tab) resets the edit form */}
      <CollectionTitle key={collection.name} collection={collection} />
      <div className={lib.resultLine}>
        <span>{pluralize(albums.length, 'album')}</span>
        <ConfirmButton
          message={`Delete the collection “${collection.name}”? The albums stay in your library.`}
          confirmLabel="Delete collection"
          onConfirm={() => {
            actions.deleteCollection(collection.id)
            navigate('/library?view=collections')
          }}
          className={lib.subtle}
        >
          Delete collection
        </ConfirmButton>
      </div>

      {/* Public link settings; renders nothing when accounts aren't set up */}
      <SharePanel collectionId={collection.id} />

      {albums.length === 0 ? (
        <EmptyState icon={ListMusic} title="This collection is empty" message="Open any album and tick this collection under “Your library” to add it." />
      ) : (
        <>
          <p className={s.note}>Drag the grip, use the arrow buttons, or focus the grip and press Space to reorder.</p>
          <SortableAlbumList
            albums={albums}
            onMove={(from, to) => actions.moveInCollection(collection.id, from, to)}
            onRemove={(albumId) => actions.removeFromCollection(collection.id, albumId)}
          />
        </>
      )}
    </>
  )
}
