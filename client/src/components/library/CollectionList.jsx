import { FolderPlus, ListMusic } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { libraryActions, useLibrary } from '../../hooks/useLibrary.js'
import { pluralize } from '../../utils/format.js'
import Artwork from '../common/Artwork.jsx'
import { EmptyState } from '../common/Feedback.jsx'
import s from './library.module.css'

// The Collections tab: a form to create one, then a card per collection
export default function CollectionList({ collections }) {
  const entries = useLibrary((state) => state.entries)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const inputId = useId()

  function create(event) {
    event.preventDefault()
    const result = libraryActions().createCollection(name)
    if (result.ok) {
      setName('')
      setError('')
    } else {
      setError(result.message)
    }
  }

  return (
    <>
      <form className={`${s.inlineForm} ${s.narrowForm}`} onSubmit={create}>
        <label htmlFor={inputId} className="sr-only">
          New collection name
        </label>
        <input
          id={inputId}
          className={s.input}
          value={name}
          placeholder="New collection name"
          maxLength={80}
          aria-invalid={Boolean(error)}
          aria-describedby={`${inputId}-error`}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className={s.smallButton}>
          <FolderPlus size={16} aria-hidden="true" />
          Create collection
        </button>
      </form>
      <p id={`${inputId}-error`} className={s.error} role="alert">
        {error}
      </p>

      {collections.length === 0 ? (
        <EmptyState icon={ListMusic} title="No collections yet" message="Collections group albums your way: a road trip, a decade, albums to lend a friend." />
      ) : (
        <ul className={s.collectionGrid}>
          {collections.map((collection) => {
            const first = entries[collection.albumIds[0]]?.album
            return (
              <li key={collection.id}>
                <Link to={`/library/collections/${collection.id}`} className={s.collectionCard}>
                  {first ? (
                    <Artwork src={first.coverUrl} name={first.name} alt="" />
                  ) : (
                    <span className={s.emptyCover}>
                      <ListMusic size={22} aria-hidden="true" />
                    </span>
                  )}
                  <span>
                    <span className={s.collectionName}>{collection.name}</span>
                    <br />
                    <span className={s.message}>{pluralize(collection.albumIds.length, 'album')}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
