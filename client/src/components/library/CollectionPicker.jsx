import { FolderPlus } from 'lucide-react'
import { useId, useState } from 'react'
import { libraryActions, useCollections } from '../../hooks/useLibrary.js'
import s from './library.module.css'

// Tick the collections this album belongs to, or create a new one and add it straight away.
// Adding saves the album too. Messages (duplicates, possible other editions) are announced politely.
export default function CollectionPicker({ album }) {
  const collections = useCollections()
  const [name, setName] = useState('')
  const [message, setMessage] = useState({ tone: 'message', text: '' })
  const inputId = useId()

  function report(result, collectionName) {
    if (!result.ok) setMessage({ tone: 'error', text: result.message })
    else if (result.similar) {
      setMessage({ tone: 'warning', text: `Added to “${collectionName}”. Heads up: “${result.similar.name}” is already there and may be another edition of this album.` })
    } else setMessage({ tone: 'message', text: `Added to “${collectionName}”.` })
  }

  function toggle(collection, checked) {
    const actions = libraryActions()
    if (checked) report(actions.addToCollection(collection.id, album), collection.name)
    else {
      actions.removeFromCollection(collection.id, album.id)
      setMessage({ tone: 'message', text: `Removed from “${collection.name}”.` })
    }
  }

  function create(event) {
    event.preventDefault()
    const actions = libraryActions()
    const created = actions.createCollection(name)
    if (!created.ok) {
      setMessage({ tone: 'error', text: created.message })
      return
    }
    report(actions.addToCollection(created.id, album), name.trim().replace(/\s+/g, ' '))
    setName('')
  }

  return (
    <fieldset className={s.fieldset}>
      <legend className={s.legend}>Collections</legend>
      {collections.length > 0 ? (
        <div className={s.checkList}>
          {collections.map((collection) => (
            <label key={collection.id} className={s.check}>
              <input type="checkbox" checked={collection.albumIds.includes(album.id)} onChange={(event) => toggle(collection, event.target.checked)} />
              {collection.name}
            </label>
          ))}
        </div>
      ) : (
        <p className={s.message}>No collections yet. Create one to group albums your way.</p>
      )}

      <form className={s.inlineForm} onSubmit={create}>
        <label htmlFor={inputId} className="sr-only">
          New collection name
        </label>
        <input id={inputId} className={s.input} value={name} placeholder="New collection" maxLength={80} onChange={(event) => setName(event.target.value)} />
        <button type="submit" className={s.smallButton}>
          <FolderPlus size={16} aria-hidden="true" />
          Create and add
        </button>
      </form>

      <p className={s[message.tone]} role="status">
        {message.text}
      </p>
    </fieldset>
  )
}
