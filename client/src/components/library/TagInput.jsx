import { Plus, X } from 'lucide-react'
import { useId, useState } from 'react'
import s from './library.module.css'

// Tags as removable chips plus a box to add more. Suggestions come from tags used on other albums.
// `onAdd` returns { ok, message } from the store, so errors (duplicate, too long) show here.
export default function TagInput({ tags, suggestions, onAdd, onRemove }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const listId = useId()
  const inputId = useId()

  function submit(event) {
    event.preventDefault()
    const result = onAdd(text)
    if (result.ok) {
      setText('')
      setError('')
    } else {
      setError(result.message ?? 'That tag could not be added.')
    }
  }

  return (
    <div className={s.fieldset}>
      <label htmlFor={inputId} className={s.legend}>
        Tags
      </label>
      {tags.length > 0 && (
        <ul className={s.chips} aria-label="Tags">
          {tags.map((tag) => (
            <li key={tag} className={s.chip}>
              {tag}
              <button type="button" className={s.chipRemove} aria-label={`Remove tag ${tag}`} onClick={() => onRemove(tag)}>
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className={s.inlineForm} onSubmit={submit}>
        <input
          id={inputId}
          className={s.input}
          list={listId}
          value={text}
          placeholder="Add a tag, e.g. late night"
          maxLength={60}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          onChange={(event) => setText(event.target.value)}
        />
        <datalist id={listId}>
          {suggestions
            .filter((tag) => !tags.includes(tag))
            .map((tag) => (
              <option key={tag} value={tag} />
            ))}
        </datalist>
        <button type="submit" className={s.smallButton}>
          <Plus size={16} aria-hidden="true" />
          Add
        </button>
      </form>
      <p id={`${inputId}-error`} className={s.error} role="alert">
        {error}
      </p>
    </div>
  )
}
