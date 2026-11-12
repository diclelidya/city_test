// The street graph for the walk: projection to metres, the walkable network, and snapping a click
// to the nearest walkable node.
import { makeProjection } from './projection.js'

export const WALK_M_PER_MIN = 80 // 4.8 km/h
export const MAX_SNAP_M = 100

function bboxOf(rings) {
  const b = [Infinity, Infinity, -Infinity, -Infinity]
  for (const r of rings)
    for (const [x, y] of r) {
      if (x < b[0]) b[0] = x
      if (y < b[1]) b[1] = y
      if (x > b[2]) b[2] = x
      if (y > b[3]) b[3] = y
    }
  return b
}

// Turn the raw files into projected, ready-to-query structures.
export function prepareData({ kit, buildings, graph, zensus }) {
  const project = makeProjection(kit.center)

  const bldgs = buildings.features.map((f) => {
    const rings = f.geometry.coordinates.map((r) => r.map(project))
    return { rings, bbox: bboxOf(rings) }
  })

  const nodes = graph.nodes.map((n) => ({ id: n.id, xy: project([n.lon, n.lat]) }))
  const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]))
  const edges = graph.edges
    .filter((e) => e.walkable)
    .map((e) => ({
      a: nodeIndex.get(e.from),
      b: nodeIndex.get(e.to),
      length: e.length,
      pts: e.coords.map(project),
    }))
  const adj = nodes.map(() => [])
  edges.forEach((e, i) => {
    adj[e.a].push(i)
    adj[e.b].push(i)
  })
  // Only nodes that touch a walkable edge can be a start.
  const walkableNodes = nodes.map((_, i) => i).filter((i) => adj[i].length > 0)

  // Each census cell is a single square: its outer ring is all we need to find the cell of A.
  const cells = zensus.features.map((f) => ({ square: f.geometry.coordinates[0].map(project) }))

  return { project, buildings: bldgs, nodes, edges, adj, walkableNodes, cells }
}

export function nearestWalkableNode(data, [x, y]) {
  let best = -1
  let bestD = Infinity
  for (const i of data.walkableNodes) {
    const [nx, ny] = data.nodes[i].xy
    const d = Math.hypot(nx - x, ny - y)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return { node: best, distance: bestD }
}
