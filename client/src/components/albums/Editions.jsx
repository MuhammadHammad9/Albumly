import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router'
import { pluralize } from '../../utils/format.js'
import s from './explorer.module.css'

// "+2 editions" under a release: expands to list the other editions of the same record.
// Open or closed is local state, not URL state: it is a momentary glance, like hovering.
export default function Editions({ primary, editions }) {
  const [open, setOpen] = useState(false)
  const listId = useId()
  if (editions.length === 0) return null

  return (
    <div className={s.editions}>
      <button type="button" className={s.editionsToggle} aria-expanded={open} aria-controls={listId} onClick={() => setOpen(!open)}>
        <ChevronDown size={14} aria-hidden="true" className={open ? s.chevronOpen : undefined} />+{pluralize(editions.length, 'edition')}{' '}
        <span className="sr-only">of {primary.name}</span>
      </button>
      <ul id={listId} className={s.editionsList} hidden={!open}>
        {editions.map((edition) => (
          <li key={edition.id}>
            <Link to={`/album/${edition.id}`} className={s.editionLink}>
              <span className={s.rowName}>{edition.name}</span>
              <span className={s.rowSub}>
                {edition.year} · {pluralize(edition.totalTracks, 'track')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
