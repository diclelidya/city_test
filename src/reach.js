// Geometry for the walking reach: projection to metres, the walk along the street graph,
// the 25 m band around the reached streets, and what lies inside it.
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import Coordinate from 'jsts/org/locationtech/jts/geom/Coordinate.js'
import BufferOp from 'jsts/org/locationtech/jts/operation/buffer/BufferOp.js'
import BufferParameters from 'jsts/org/locationtech/jts/operation/buffer/BufferParameters.js'
import CascadedPolygonUnion from 'jsts/org/locationtech/jts/operation/union/CascadedPolygonUnion.js'
import ArrayList from 'jsts/java/util/ArrayList.js'
import { makeProjection } from './projection.js'

export const WALK_M_PER_MIN = 80 // 4.8 km/h
export const MINUTES = [5, 10, 15]
export const BAND_M = 25
export const MAX_SNAP_M = 100

const gf = new GeometryFactory()

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
// Average of a ring's corners: a simple centre point for a footprint.
function centreOf(ring) {
  const pts = ring.slice(0, -1)
  return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length]
}
const bboxesTouch = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3]

// Signed area of a ring (shoelace formula), positive when counter-clockwise.
function signedArea(r) {
  let s = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1])
  return s / 2
}

// Turn the raw files into projected, ready-to-query structures.
export function prepareData({ kit, buildings, graph, zensus }) {
  const project = makeProjection(kit.center)

  const bldgs = buildings.features.map((f) => {
    const rings = f.geometry.coordinates.map((r) => r.map(project))
    return {
      id: f.properties.id,
      height: f.properties.height,
      use: f.properties.use ?? 'undefined',
      floors: f.properties.floors,
      retail: f.properties.floor_area_m2?.retail ?? 0,
      centre: centreOf(rings[0]),
      rings,
      bbox: bboxOf(rings),
    }
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

  const cells = zensus.features.map((f) => {
    // Each cell is a single square: its outer ring is all we need.
    let square = f.geometry.coordinates[0].map(project)
    if (signedArea(square) < 0) square = square.reverse()
    return {
      id: f.properties.id,
      population: f.properties.population,
      square,
      bbox: bboxOf([square]),
      area: signedArea(square),
    }
  })

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

// Shortest walking distance in metres from the start node to every node (Dijkstra).
function walkDistances(data, start) {
  const dist = new Float64Array(data.nodes.length).fill(Infinity)
  dist[start] = 0
  const heap = [[0, start]]
  const push = (item) => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  while (heap.length) {
    const [d, u] = pop()
    if (d > dist[u]) continue
    for (const ei of data.adj[u]) {
      const e = data.edges[ei]
      const v = e.a === u ? e.b : e.a
      const nd = d + e.length
      if (nd < dist[v]) {
        dist[v] = nd
        push([nd, v])
      }
    }
  }
  return dist
}

// The part of an edge's line between two distances along it, measured in the edge's
// `length` metres (scaled onto the drawn line, which may differ slightly).
function subLine(pts, length, from, to) {
  const seg = []
  let total = 0
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    seg.push(l)
    total += l
  }
  const s0 = (from / length) * total
  const s1 = (to / length) * total
  const at = (s) => {
    let acc = 0
    for (let i = 0; i < seg.length; i++) {
      if (acc + seg[i] >= s || i === seg.length - 1) {
        const t = seg[i] ? Math.min(1, Math.max(0, (s - acc) / seg[i])) : 0
        return [pts[i][0] + t * (pts[i + 1][0] - pts[i][0]), pts[i][1] + t * (pts[i + 1][1] - pts[i][1])]
      }
      acc += seg[i]
    }
  }
  const out = [at(s0)]
  let acc = 0
  for (let i = 0; i < seg.length - 1; i++) {
    acc += seg[i]
    if (acc > s0 && acc < s1) out.push(pts[i + 1])
  }
  out.push(at(s1))
  return out
}

// Street pieces reachable within `budget` metres, including the reachable part of the last edge.
function reachedPieces(data, dist, budget) {
  const pieces = []
  for (const e of data.edges) {
    const ra = Math.max(0, budget - dist[e.a]) // metres left when standing at a
    const rb = Math.max(0, budget - dist[e.b])
    if (ra <= 0 && rb <= 0) continue
    if (ra + rb >= e.length) {
      pieces.push(e.pts)
      continue
    }
    if (ra > 0) pieces.push(subLine(e.pts, e.length, 0, ra))
    if (rb > 0) pieces.push(subLine(e.pts, e.length, e.length - rb, e.length))
  }
  return pieces
}

// The 25 m band: buffer every reached street piece, then merge them all into one shape.
function bandAround(pieces, startXY) {
  const params = new BufferParameters()
  params.setQuadrantSegments(8)
  const parts = new ArrayList()
  for (const p of pieces) {
    const line = gf.createLineString(p.map(([x, y]) => new Coordinate(x, y)))
    parts.add(BufferOp.bufferOp(line, BAND_M, params))
  }
  // The start node itself, so the band exists even when no street is reached yet.
  parts.add(BufferOp.bufferOp(gf.createPoint(new Coordinate(startXY[0], startXY[1])), BAND_M, params))
  return CascadedPolygonUnion.union(parts)
}

// A fast lookup over the outline of an area (all rings of all its polygons):
// horizontal strips for point-in-area, a grid for edge crossings.
const CELL = 20
function indexArea(polygons) {
  const segs = []
  for (const poly of polygons)
    for (const r of poly)
      for (let i = 1; i < r.length; i++) segs.push([r[i - 1][0], r[i - 1][1], r[i][0], r[i][1]])
  const strips = new Map()
  const grid = new Map()
  const add = (map, key, i) => (map.get(key) ?? map.set(key, []).get(key)).push(i)
  segs.forEach(([x1, y1, x2, y2], i) => {
    const gx0 = Math.floor(Math.min(x1, x2) / CELL)
    const gx1 = Math.floor(Math.max(x1, x2) / CELL)
    const gy0 = Math.floor(Math.min(y1, y2) / CELL)
    const gy1 = Math.floor(Math.max(y1, y2) / CELL)
    for (let gy = gy0; gy <= gy1; gy++) {
      add(strips, gy, i)
      for (let gx = gx0; gx <= gx1; gx++) add(grid, `${gx},${gy}`, i)
    }
  })
  return {
    bbox: bboxOf(polygons.flat()),
    // Even-odd rule: count outline crossings on a ray going east.
    contains(x, y) {
      let inside = false
      for (const i of strips.get(Math.floor(y / CELL)) ?? []) {
        const [x1, y1, x2, y2] = segs[i]
        if (y1 > y !== y2 > y && x < x1 + ((y - y1) * (x2 - x1)) / (y2 - y1)) inside = !inside
      }
      return inside
    },
    crosses(ax, ay, bx, by) {
      const gx0 = Math.floor(Math.min(ax, bx) / CELL)
      const gx1 = Math.floor(Math.max(ax, bx) / CELL)
      const gy0 = Math.floor(Math.min(ay, by) / CELL)
      const gy1 = Math.floor(Math.max(ay, by) / CELL)
      for (let gx = gx0; gx <= gx1; gx++)
        for (let gy = gy0; gy <= gy1; gy++)
          for (const i of grid.get(`${gx},${gy}`) ?? []) {
            const s = segs[i]
            if (segmentsCross(ax, ay, bx, by, s[0], s[1], s[2], s[3])) return true
          }
      return false
    },
  }
}

function segmentsCross(ax, ay, bx, by, cx, cy, dx, dy) {
  const o = (px, py, qx, qy, rx, ry) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px))
  const d1 = o(cx, cy, dx, dy, ax, ay)
  const d2 = o(cx, cy, dx, dy, bx, by)
  const d3 = o(ax, ay, bx, by, cx, cy)
  const d4 = o(ax, ay, bx, by, dx, dy)
  return d1 !== d2 && d3 !== d4
}

function ringsContain(rings, x, y) {
  let inside = false
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      if (r[i][1] > y !== r[j][1] > y && x < r[i][0] + ((y - r[i][1]) * (r[j][0] - r[i][0])) / (r[j][1] - r[i][1]))
        inside = !inside
  return inside
}

// Does a building footprint touch the area? A corner inside, an edge crossing the outline,
// or (for a huge footprint) the area lying inside the footprint.
function touches(idx, areaStart, rings, bbox) {
  if (!bboxesTouch(idx.bbox, bbox)) return false
  for (const r of rings) {
    for (const [x, y] of r) if (idx.contains(x, y)) return true
    for (let i = 1; i < r.length; i++) if (idx.crosses(r[i - 1][0], r[i - 1][1], r[i][0], r[i][1])) return true
  }
  return ringsContain(rings, areaStart[0], areaStart[1])
}

// Cut a ring to a convex window (Sutherland–Hodgman). The window is counter-clockwise.
function clipRing(ring, win) {
  let out = ring
  const n = win.length - 1 // the window ring is closed
  for (let k = 0; k < n && out.length; k++) {
    const [ax, ay] = win[k]
    const [bx, by] = win[k + 1]
    const side = ([x, y]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax)
    const input = out
    out = []
    for (let i = 0; i < input.length; i++) {
      const p = input[i]
      const q = input[(i + 1) % input.length]
      const sp = side(p)
      const sq = side(q)
      if (sp >= 0) out.push(p)
      if ((sp >= 0) !== (sq >= 0)) {
        const t = sp / (sp - sq)
        out.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])])
      }
    }
  }
  return out
}

// Area of the reach shape that lies inside one census square, in m².
function areaInside(polygons, square) {
  let total = 0
  for (const poly of polygons) {
    const orient = Math.sign(signedArea(poly[0])) // holes run the other way round
    for (const r of poly) {
      const clipped = clipRing(r, square)
      if (clipped.length >= 3) total += orient * signedArea(clipped)
    }
  }
  return total
}

function countResidents(data, polygons, bbox) {
  let sum = 0
  let unknownCells = 0
  for (const c of data.cells) {
    if (!bboxesTouch(bbox, c.bbox)) continue
    const inside = areaInside(polygons, c.square)
    if (inside < 0.01) continue
    if (c.population == null) unknownCells++
    else sum += (c.population * Math.min(inside, c.area)) / c.area
  }
  return { residents: Math.round(sum / 10) * 10, unknownCells }
}

// Everything for one click: three nested areas, the buildings they touch, and residents.
export function computeReach(data, xy) {
  const { node, distance } = nearestWalkableNode(data, xy)
  if (node < 0 || distance > MAX_SNAP_M) return { error: 'tooFar', distance }

  const dist = walkDistances(data, node)
  const startXY = data.nodes[node].xy
  // For each building: index of the smallest area it touches (0 = 5 min), or -1.
  const buildingLevel = new Int8Array(data.buildings.length).fill(-1)

  const areas = MINUTES.map((min, level) => {
    const budget = min * WALK_M_PER_MIN
    const polygons = toPolygons(bandAround(reachedPieces(data, dist, budget), startXY))
    const idx = indexArea(polygons)
    let buildings = 0
    data.buildings.forEach((b, i) => {
      if (!touches(idx, startXY, b.rings, b.bbox)) return
      buildings++
      if (buildingLevel[i] < 0) buildingLevel[i] = level
    })
    return { minutes: min, budget, polygons, buildings, ...countResidents(data, polygons, idx.bbox) }
  })

  // Buildings with any retail floor area that the 5-minute area touches, biggest first.
  const shops = []
  data.buildings.forEach((b, i) => {
    if (buildingLevel[i] !== 0 || b.retail <= 0) return
    shops.push({ index: i, id: b.id, retail: b.retail, use: b.use, floors: b.floors, walk: walkTo(data, dist, b.centre) })
  })
  shops.sort((a, b) => b.retail - a.retail)

  return { start: startXY, snapDistance: distance, areas, buildingLevel, shops }
}

// Rough walking distance to a building, in metres: along the network to the nearest point of
// the street closest to the building. When several streets are about as close (within 10 m),
// the one with the shortest walk counts.
function walkTo(data, dist, [cx, cy]) {
  const options = []
  let nearest = Infinity
  for (const e of data.edges) {
    if (dist[e.a] === Infinity && dist[e.b] === Infinity) continue
    const [ax, ay] = e.pts[0]
    const [bx, by] = e.pts[e.pts.length - 1]
    const dx = bx - ax
    const dy = by - ay
    const t = Math.min(1, Math.max(0, ((cx - ax) * dx + (cy - ay) * dy) / (dx * dx + dy * dy || 1)))
    const step = Math.hypot(ax + t * dx - cx, ay + t * dy - cy)
    const walk = Math.min(dist[e.a] + t * e.length, dist[e.b] + (1 - t) * e.length)
    options.push([step, walk])
    nearest = Math.min(nearest, step)
  }
  return Math.min(...options.filter(([step]) => step <= nearest + 10).map(([, walk]) => walk))
}

// jsts geometry -> list of polygons, each a list of rings of [x, y].
function toPolygons(geom) {
  const out = []
  for (let i = 0; i < geom.getNumGeometries(); i++) {
    const p = geom.getGeometryN(i)
    if (p.getGeometryType() !== 'Polygon' || p.isEmpty()) continue
    const rings = [p.getExteriorRing()]
    for (let h = 0; h < p.getNumInteriorRing(); h++) rings.push(p.getInteriorRingN(h))
    out.push(rings.map((r) => r.getCoordinates().map((c) => [c.x, c.y])))
  }
  return out
}
