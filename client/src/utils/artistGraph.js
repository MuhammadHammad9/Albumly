// The artist connection graph: two artists are connected when they are credited on the same
// release (including guest appearances). Built only from release lists Albumly already has.

// releasesByArtist: { artistId: releases[] | null } (the releases in that artist's discography)
// names: { artistId: name } for artists whose name is known from elsewhere
// Returns { nodes: Map(id -> name), edges: Map(id -> Map(neighbourId -> [{ id, name }] shared releases)) }
export function buildArtistGraph(releasesByArtist, names = {}) {
  const nodes = new Map()
  const edges = new Map()

  const addNode = (id, name) => {
    if (!nodes.has(id) || nodes.get(id) === id) nodes.set(id, name ?? id)
  }
  function link(a, b, release) {
    for (const [from, to] of [
      [a, b],
      [b, a],
    ]) {
      if (!edges.has(from)) edges.set(from, new Map())
      const shared = edges.get(from).get(to) ?? []
      if (!shared.some((r) => r.id === release.id)) shared.push({ id: release.id, name: release.name })
      edges.get(from).set(to, shared)
    }
  }

  for (const [owner, releases] of Object.entries(releasesByArtist)) {
    addNode(owner, names[owner])
    for (const release of releases ?? []) {
      const credited = release.artists ?? []
      credited.forEach((artist) => addNode(artist.id, artist.name))
      // Everyone on the release is connected to everyone else, including the discography's owner
      const ids = [...new Set([owner, ...credited.map((artist) => artist.id)])]
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) link(ids[i], ids[j], release)
    }
  }
  for (const [id, name] of Object.entries(names)) if (nodes.has(id)) nodes.set(id, name)
  return { nodes, edges }
}

// Neighbours with the most shared releases first, then by name: a fixed order, so BFS is repeatable
export function neighboursOf(graph, id) {
  const neighbours = graph.edges.get(id)
  if (!neighbours) return []
  return [...neighbours]
    .sort((a, b) => b[1].length - a[1].length || (graph.nodes.get(a[0]) ?? '').localeCompare(graph.nodes.get(b[0]) ?? ''))
    .map(([neighbour]) => neighbour)
}

// Breadth-first search from one or more starting artists.
// Visits everyone 1 step away, then everyone 2 steps away, and so on, so the first time an artist
// is reached is always by a shortest path. Stops at `maxDepth` steps and after `maxNodes` artists.
// Returns { order, depth: Map(id -> steps), parent: Map(id -> id | null), truncated }
export function bfs(graph, sources, { maxDepth = 2, maxNodes = 40 } = {}) {
  const depth = new Map()
  const parent = new Map()
  const order = []
  const queue = [] // read with a moving index instead of shift(), which would copy the array every time
  let truncated = false

  for (const source of sources) {
    if (depth.has(source)) continue
    if (order.length >= maxNodes) {
      truncated = true
      break
    }
    depth.set(source, 0)
    parent.set(source, null)
    order.push(source)
    queue.push(source)
  }

  for (let head = 0; head < queue.length && !truncated; head++) {
    const current = queue[head]
    if (depth.get(current) >= maxDepth) continue
    for (const neighbour of neighboursOf(graph, current)) {
      if (depth.has(neighbour)) continue // already reached by a path at least as short
      if (order.length >= maxNodes) {
        truncated = true
        break
      }
      depth.set(neighbour, depth.get(current) + 1)
      parent.set(neighbour, current)
      order.push(neighbour)
      queue.push(neighbour)
    }
  }
  return { order, depth, parent, truncated }
}

// The path from a starting artist to `id`, following parents back: ['a', 'b', 'id'], or null
export function pathTo(result, id) {
  if (!result.depth.has(id)) return null
  const path = []
  for (let current = id; current !== null; current = result.parent.get(current)) path.unshift(current)
  return path
}

// Every edge between two visited artists, each once: [{ from, to, releases }]
export function visitedEdges(graph, result) {
  const visited = new Set(result.order)
  const list = []
  for (const from of result.order) {
    for (const [to, releases] of graph.edges.get(from) ?? []) {
      if (visited.has(to) && from < to) list.push({ from, to, releases })
    }
  }
  return list
}

// Positions for drawing: the start in the middle, each further step on a wider ring. Artists on a
// ring are ordered by where their parent sits, so lines cross less. Returns Map(id -> { x, y }).
export function radialLayout(result, { size = 480, padding = 48 } = {}) {
  const centre = size / 2
  const maxDepth = Math.max(0, ...result.depth.values())
  const ringGap = maxDepth === 0 ? 0 : (centre - padding) / maxDepth
  const positions = new Map()
  const angles = new Map()

  for (let level = 0; level <= maxDepth; level++) {
    const ring = result.order.filter((id) => result.depth.get(id) === level)
    if (level > 0) ring.sort((a, b) => angles.get(result.parent.get(a)) - angles.get(result.parent.get(b)))
    // Several starting artists share a small inner ring instead of piling up in the centre
    const radius = level === 0 ? (ring.length > 1 ? Math.min(ringGap / 2, 60) || 60 : 0) : ringGap * level
    ring.forEach((id, index) => {
      const angle = (2 * Math.PI * index) / ring.length - Math.PI / 2
      angles.set(id, angle)
      positions.set(id, { x: Math.round(centre + radius * Math.cos(angle)), y: Math.round(centre + radius * Math.sin(angle)) })
    })
  }
  return positions
}

// Artists credited alongside the known ones that Albumly has no releases for yet, most frequent
// first. These are the next ones worth asking the server about.
export function unknownNeighbours(knownArtists, max = 40) {
  const known = new Set(knownArtists.map((a) => a.id))
  const counts = new Map()
  for (const { releases } of knownArtists) {
    for (const release of releases ?? []) {
      for (const artist of release.artists ?? []) {
        if (!known.has(artist.id)) counts.set(artist.id, (counts.get(artist.id) ?? 0) + 1)
      }
    }
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([id]) => id)
}
