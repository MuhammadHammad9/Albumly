import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronDown, ChevronUp, GripVertical, X } from 'lucide-react'
import { Link } from 'react-router'
import Artwork from '../common/Artwork.jsx'
import s from './library.module.css'

// Albums in a collection, in the user's order. Three ways to reorder, so everyone has one that works:
// - drag the grip with a mouse or finger
// - focus the grip, press Space, move with the arrow keys, press Space again (dnd-kit's keyboard sensor)
// - the Move up / Move down buttons

function Row({ album, index, count, onMove, onRemove }) {
  // useSortable gives the row its drag position and the grip its event handlers and ARIA attributes
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: album.id })
  const artists = album.artists.map((artist) => artist.name).join(', ')

  return (
    <li
      ref={setNodeRef}
      className={s.sortRow}
      data-dragging={isDragging}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button ref={setActivatorNodeRef} type="button" className={s.handle} aria-label={`Reorder ${album.name}`} {...attributes} {...listeners}>
        <GripVertical size={18} aria-hidden="true" />
      </button>
      <span className={s.position}>{index + 1}</span>
      <Artwork src={album.coverUrl} name={album.name} alt="" />
      <span className={s.rowText}>
        <Link to={`/album/${album.id}`} className={s.rowTitle}>
          {album.name}
        </Link>
        <span className={s.rowMeta}>{[artists, album.year].filter(Boolean).join(' · ')}</span>
      </span>
      <span className={s.rowActions}>
        <button type="button" className={s.iconButton} aria-label={`Move ${album.name} up`} disabled={index === 0} onClick={() => onMove(index, index - 1)}>
          <ChevronUp size={18} aria-hidden="true" />
        </button>
        <button type="button" className={s.iconButton} aria-label={`Move ${album.name} down`} disabled={index === count - 1} onClick={() => onMove(index, index + 1)}>
          <ChevronDown size={18} aria-hidden="true" />
        </button>
        <button type="button" className={s.iconButton} aria-label={`Remove ${album.name} from this collection`} onClick={() => onRemove(album.id)}>
          <X size={18} aria-hidden="true" />
        </button>
      </span>
    </li>
  )
}

export default function SortableAlbumList({ albums, onMove, onRemove }) {
  const sensors = useSensors(
    // A few pixels of movement before a drag starts, so a plain click on the grip does nothing odd
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const ids = albums.map((album) => album.id)
  const nameOf = (id) => albums.find((album) => album.id === id)?.name ?? 'album'
  const positionOf = (id) => ids.indexOf(id) + 1

  function handleDragEnd({ active, over }) {
    if (over && active.id !== over.id) onMove(ids.indexOf(active.id), ids.indexOf(over.id))
  }

  // What screen readers hear while dragging, in words about albums rather than "draggable item 3"
  const accessibility = {
    screenReaderInstructions: {
      draggable: 'To reorder, press Space to pick up the album, use the up and down arrow keys to move it, then press Space again to drop it, or Escape to cancel.',
    },
    announcements: {
      onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}, position ${positionOf(active.id)} of ${ids.length}.`,
      onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} moved to position ${positionOf(over.id)} of ${ids.length}.` : undefined),
      onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} dropped at position ${positionOf(over.id)} of ${ids.length}.` : `${nameOf(active.id)} dropped.`),
      onDragCancel: ({ active }) => `Reordering cancelled. ${nameOf(active.id)} is back where it was.`,
    },
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} accessibility={accessibility}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <ol className={s.sortList} aria-label="Albums in this collection">
          {albums.map((album, index) => (
            <Row key={album.id} album={album} index={index} count={albums.length} onMove={onMove} onRemove={onRemove} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  )
}
