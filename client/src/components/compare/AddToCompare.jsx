import { GitCompareArrows } from 'lucide-react'
import { Link } from 'react-router'
import { useStore } from 'zustand'
import { compareLink, compareStore } from '../../stores/compareStore.js'
import common from '../common/common.module.css'

// On an album page: start a comparison with this album, or finish one that is waiting for a second album
export default function AddToCompare({ album }) {
  const waiting = useStore(compareStore, (state) => state.waiting)
  const completes = waiting && waiting.id !== album.id

  return (
    <Link to={compareLink(album, waiting)} className={common.buttonGhost}>
      <GitCompareArrows size={16} aria-hidden="true" />
      {completes ? `Compare with ${waiting.name}` : 'Add to compare'}
    </Link>
  )
}
