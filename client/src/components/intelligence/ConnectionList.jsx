import { Link } from 'react-router'
import s from './intelligence.module.css'

// The graph as a nested list: each artist under the one it was reached from, with the release
// that links them. Works with a keyboard and a screen reader; the SVG beside it is only a picture.

const childrenOf = (search, id) => search.order.filter((other) => search.parent.get(other) === id)
const nameOf = (graph, id) => graph.nodes.get(id) ?? id

function Branch({ graph, search, id }) {
  const children = childrenOf(search, id)
  if (children.length === 0) return null
  return (
    <ul className={s.connectionList}>
      {children.map((child) => {
        const shared = graph.edges.get(id)?.get(child) ?? []
        return (
          <li key={child}>
            <Link className={s.inlineLink} to={`/discover/connections?artist=${encodeURIComponent(child)}`}>
              {nameOf(graph, child)}
            </Link>{' '}
            <span className={s.role}>
              via {shared[0]?.name ?? 'a shared release'}
              {shared.length > 1 && ` and ${shared.length - 1} more`}
            </span>
            <Branch graph={graph} search={search} id={child} />
          </li>
        )
      })}
    </ul>
  )
}

export default function ConnectionList({ graph, search, rootId }) {
  return (
    <div>
      <p>
        <Link className={s.inlineLink} to={`/artist/${encodeURIComponent(rootId)}`}>
          <strong>{nameOf(graph, rootId)}</strong>
        </Link>
      </p>
      {childrenOf(search, rootId).length === 0 ? (
        <p className={s.muted}>No connections found in the releases Albumly knows about yet.</p>
      ) : (
        <Branch graph={graph} search={search} id={rootId} />
      )}
    </div>
  )
}
