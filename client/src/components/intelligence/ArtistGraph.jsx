import { useMemo } from 'react'
import { Link } from 'react-router'
import { radialLayout, visitedEdges } from '../../utils/artistGraph.js'
import s from './intelligence.module.css'

const SIZE = 480
const RING_COLOURS = ['#1db954', '#8b5cf6', '#a7a7a7'] // start, 1 step, 2 steps

// The connection graph drawn by hand in SVG: the chosen artist in the middle, each further step on
// a wider ring. It is decoration for sighted users; ConnectionList holds the same information.
export default function ArtistGraph({ graph, search, focusId }) {
  const positions = useMemo(() => radialLayout(search, { size: SIZE }), [search])
  const edges = useMemo(() => visitedEdges(graph, search), [graph, search])
  const maxDepth = Math.max(0, ...search.depth.values())

  return (
    <svg className={s.graph} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Connection map of ${search.order.length} artists`}>
      {Array.from({ length: maxDepth }, (_, i) => (
        <circle key={i} cx={SIZE / 2} cy={SIZE / 2} r={((SIZE / 2 - 48) / maxDepth) * (i + 1)} fill="none" stroke="#303030" strokeDasharray="4 6" />
      ))}
      {edges.map(({ from, to }) => {
        const a = positions.get(from)
        const b = positions.get(to)
        return <line key={`${from}-${to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#4a4a4a" strokeWidth="1.5" />
      })}
      {search.order.map((id) => {
        const { x, y } = positions.get(id)
        const depth = search.depth.get(id)
        const name = graph.nodes.get(id) ?? id
        return (
          <Link key={id} to={`/discover/connections?artist=${encodeURIComponent(id)}`} aria-label={name}>
            <circle cx={x} cy={y} r={id === focusId ? 12 : 8} fill={RING_COLOURS[Math.min(depth, 2)]} stroke="#181818" strokeWidth="2" />
            <text x={x} y={y + (id === focusId ? 28 : 22)} textAnchor="middle" fill="#ffffff" fontSize="12">
              {name.length > 18 ? `${name.slice(0, 17)}…` : name}
            </text>
          </Link>
        )
      })}
    </svg>
  )
}
