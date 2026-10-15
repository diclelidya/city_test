// "How far can you walk from yourself?": guess who the city thinks is walking from A to B,
// route them the way that profile is expected to walk, then misroute them the other way,
// and measure how far each route is from the profile.
// All the weights below are assumptions, written to be read, not data.
import { nearestWalkableNode, MAX_SNAP_M, WALK_M_PER_MIN, bandAround, toPolygons } from './reach.js'

export const PROFILES = [
  ['visitor', 'visitor'],
  ['student', 'student'],
  ['local', 'local resident'],
  ['older', 'older resident'],
  ['commuter', 'commuter'],
]

export const NEAR_M = 100 // the surroundings of A and B
export const ROUTE_BAND_M = 25 // buildings this close to a street or route count for it
const EDGE_M = 150 // A this close to the edge of the kit counts as "arriving from outside"
const MAX_DETOUR = 2 // the misrouted walk is at most twice the shortest route
const AVOID = 2 // the streets of the shortest and expected routes cost this much more for the misrouted walk
const STRENGTHS = [3, 2, 1, 0.5] // how strongly affinity changes a street's cost, tried in turn
const SHARPEN = 3 // for routing and distance, each profile share is raised to this power, then scaled back to 100 %
const MIN_USE_M2 = 1000 // uses with less floor area in the whole kit are left out of "close to you" and "far from you"

// How much each profile is drawn to each use, from 0 (not at all) to 1 (strongly).
// `undefined` is left out on purpose: unknown floor area counts for nothing.
export const AFFINITY = {
  //                visitor student local older commuter
  residential:      [0.1, 0.5, 1.0, 0.9, 0.1],
  service:          [0.3, 0.3, 0.7, 0.6, 0.7],
  education:        [0.2, 1.0, 0.4, 0.1, 0.2],
  civic:            [0.5, 0.3, 0.6, 0.6, 0.5],
  entertainment:    [0.8, 0.7, 0.4, 0.2, 0.2],
  retail:           [0.7, 0.5, 0.8, 0.7, 0.4],
  food_and_drink:   [0.9, 0.8, 0.6, 0.5, 0.5],
  office:           [0.1, 0.2, 0.4, 0.2, 1.0],
  health:           [0.1, 0.2, 0.6, 1.0, 0.2],
  accommodation:    [1.0, 0.2, 0.1, 0.1, 0.2],
  culture:          [1.0, 0.6, 0.4, 0.6, 0.1],
  sport:            [0.3, 0.7, 0.5, 0.2, 0.1],
  transport:        [0.7, 0.5, 0.3, 0.4, 1.0],
  light_industrial: [0.0, 0.1, 0.2, 0.1, 0.5],
}
const KNOWN_USES = Object.keys(AFFINITY)

// How telling the destination is: a use near B pulls the profile towards one profile, this strongly.
// Retail and food barely say anything, because everyone goes there.
const DESTINATION_PULL = {
  education: ['student', 0.6],
  accommodation: ['visitor', 0.5],
  culture: ['visitor', 0.5],
  office: ['commuter', 0.4],
  health: ['older', 0.25],
  residential: ['local', 0.2],
  retail: [null, 0.05],
  food_and_drink: [null, 0.05],
}

// The time of the walk tilts the mix: each rule that applies multiplies some profiles' shares,
// then the shares are scaled back to 100 %. Local residents walk at every hour and are never shifted.
const isNight = (h) => h >= 22 || h < 6
export const TIME_RULES = [
  { label: 'weekday morning (6–9)', applies: (d, h) => d === 'weekday' && h >= 6 && h < 9, shift: { student: 1.5, commuter: 1.5 } },
  { label: 'weekday office hours (9–17)', applies: (d, h) => d === 'weekday' && h >= 9 && h < 17, shift: { commuter: 1.5, older: 1.25 } },
  { label: 'weekday evening (17–22)', applies: (d, h) => d === 'weekday' && h >= 17 && h < 22, shift: { visitor: 1.5, student: 1.5 } },
  { label: 'weekend daytime (10–18)', applies: (d, h) => d === 'weekend' && h >= 10 && h < 18, shift: { visitor: 1.75 } },
  { label: 'weekend evening (18–22)', applies: (d, h) => d === 'weekend' && h >= 18 && h < 22, shift: { visitor: 1.5, student: 1.5 } },
  { label: 'weekend, all day', applies: (d) => d === 'weekend', shift: { commuter: 0.5 } },
  { label: 'late night (22–6)', applies: (d, h) => isNight(h), shift: { student: 2, older: 0.5 } },
]

// The rules that apply at this time, and the mix after them.
function shiftByTime(mix, { day, hour }) {
  const rules = TIME_RULES.filter((r) => r.applies(day, hour))
  const shifted = { ...mix }
  for (const r of rules) for (const [k, factor] of Object.entries(r.shift)) shifted[k] *= factor
  return { rules: rules.map(({ label, shift }) => ({ label, shift })), mix: normalise(shifted) }
}

// The purpose of the trip, from the uses near B.
const PURPOSE_OF = {
  retail: 'shopping',
  office: 'work',
  service: 'work',
  civic: 'work',
  transport: 'work',
  light_industrial: 'work',
  education: 'study',
  culture: 'culture',
  entertainment: 'culture',
  accommodation: 'culture',
  health: 'health',
  food_and_drink: 'food',
}

const clamp01 = (v) => Math.min(1, Math.max(0, v))

// --- geometry helpers ---------------------------------------------------------------------

function pointSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))
  return Math.hypot(ax + t * dx - px, ay + t * dy - py)
}

function ringsContain(rings, x, y) {
  let inside = false
  for (const r of rings)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      if (r[i][1] > y !== r[j][1] > y && x < r[i][0] + ((y - r[i][1]) * (r[j][0] - r[i][0])) / (r[j][1] - r[i][1]))
        inside = !inside
  return inside
}

// Distance from a point to a building footprint (0 inside it).
function pointToFootprint(b, x, y) {
  if (ringsContain(b.rings, x, y)) return 0
  let d = Infinity
  for (const r of b.rings)
    for (let i = 1; i < r.length; i++) d = Math.min(d, pointSegDist(x, y, r[i - 1][0], r[i - 1][1], r[i][0], r[i][1]))
  return d
}

// Is a street line within `limit` metres of a building footprint?
function lineNearFootprint(pts, b, limit) {
  for (const [x, y] of pts) if (ringsContain(b.rings, x, y)) return true
  for (const r of b.rings)
    for (const [x, y] of r)
      for (let i = 1; i < pts.length; i++)
        if (pointSegDist(x, y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) <= limit) return true
  for (const [x, y] of pts)
    for (const r of b.rings)
      for (let i = 1; i < r.length; i++)
        if (pointSegDist(x, y, r[i - 1][0], r[i - 1][1], r[i][0], r[i][1]) <= limit) return true
  return false
}

// --- preparation (once) -------------------------------------------------------------------

// Adds what this mode needs to the data prepared for the walking reach:
// floor area per use for each building, the buildings near each street, and the census figures.
export function prepareMisroute(data, files) {
  const floorAreas = files.buildings.features.map((f) => f.properties.floor_area_m2 ?? {})
  const zensus = files.zensus.features.map((f) => f.properties)
  const [w, s, e, n] = files.kit.bbox
  const [x0, y0] = data.project([w, s])
  const [x1, y1] = data.project([e, n])

  const edgeBuildings = data.edges.map((edge) => {
    const xs = edge.pts.map((p) => p[0])
    const ys = edge.pts.map((p) => p[1])
    const box = [Math.min(...xs) - ROUTE_BAND_M, Math.min(...ys) - ROUTE_BAND_M, Math.max(...xs) + ROUTE_BAND_M, Math.max(...ys) + ROUTE_BAND_M]
    const near = []
    data.buildings.forEach((b, i) => {
      const bb = b.bbox
      if (bb[0] > box[2] || bb[2] < box[0] || bb[1] > box[3] || bb[3] < box[1]) return
      if (lineNearFootprint(edge.pts, b, ROUTE_BAND_M)) near.push(i)
    })
    return near
  })

  // Uses with enough floor area in the kit to name as "close to you" or "far from you".
  const total = {}
  for (const fa of floorAreas) for (const [u, m2] of Object.entries(fa)) total[u] = (total[u] ?? 0) + m2
  const namedUses = KNOWN_USES.filter((u) => (total[u] ?? 0) >= MIN_USE_M2)

  return { floorAreas, zensus, bounds: { x0, y0, x1, y1 }, edgeBuildings, namedUses }
}

// --- the profile --------------------------------------------------------------------------

// Floor area per use of the buildings within 100 m of a point, and the `undefined` part apart.
function surroundings(data, prep, [x, y]) {
  const area = {}
  let unknown = 0
  data.buildings.forEach((b, i) => {
    const bb = b.bbox
    if (bb[0] > x + NEAR_M || bb[2] < x - NEAR_M || bb[1] > y + NEAR_M || bb[3] < y - NEAR_M) return
    if (pointToFootprint(b, x, y) > NEAR_M) return
    for (const [use, m2] of Object.entries(prep.floorAreas[i])) {
      if (use === 'undefined') unknown += m2
      else area[use] = (area[use] ?? 0) + m2
    }
  })
  const known = Object.values(area).reduce((a, b) => a + b, 0)
  const share = Object.fromEntries(KNOWN_USES.map((u) => [u, known ? (area[u] ?? 0) / known : 0]))
  return { area, known, unknown, share }
}

function censusAt(data, prep, [x, y]) {
  const i = data.cells.findIndex((c) => ringsContain([c.square], x, y))
  if (i < 0) return { age: null, rent: null }
  return { age: prep.zensus[i].avg_age ?? null, rent: prep.zensus[i].rent_eur_m2 ?? null }
}

const normalise = (points) => {
  const total = Object.values(points).reduce((a, b) => a + b, 0)
  return Object.fromEntries(Object.entries(points).map(([k, v]) => [k, v / total]))
}

// The profile from A alone: where someone lives or stays.
function profileFromStart(near, census, atEdge) {
  const s = near.share
  const ageUp = census.age == null ? 0 : clamp01((census.age - 38) / 15) // 0 at 38 years, 1 at 53
  const ageDown = census.age == null ? 0 : clamp01((38 - census.age) / 12) // 0 at 38 years, 1 at 26
  const cheap = census.rent != null && census.rent < 6.6 ? 0.5 : 0
  return normalise({
    visitor: 0.2 + 3 * (s.accommodation + s.culture + s.entertainment),
    student: 0.2 + 3 * s.education + ageDown + cheap,
    local: 0.2 + 2 * s.residential,
    older: 0.2 + 2 * s.residential * ageUp + s.health,
    commuter: 0.2 + 3 * (s.transport + s.office) + (atEdge ? 0.3 : 0),
  })
}

// B moves the profile towards what its uses point to, as far as they are telling.
function updateWithDestination(fromA, near) {
  const pull = Object.fromEntries(PROFILES.map(([k]) => [k, 0]))
  let moved = 0
  for (const [use, [target, strength]] of Object.entries(DESTINATION_PULL)) {
    if (!target) continue // retail and food: everyone goes there, so they say nothing about who you are
    const w = near.share[use] * strength
    pull[target] += w
    moved += w
  }
  return Object.fromEntries(PROFILES.map(([k]) => [k, (1 - moved) * fromA[k] + pull[k]]))
}

function purposeOf(near) {
  const total = near.known + near.unknown
  const flatsOrUnknown = (near.area.residential ?? 0) + near.unknown
  if (!total || flatsOrUnknown / total > 0.5) return 'home or a visit'
  const byPurpose = {}
  for (const [use, m2] of Object.entries(near.area))
    if (PURPOSE_OF[use]) byPurpose[PURPOSE_OF[use]] = (byPurpose[PURPOSE_OF[use]] ?? 0) + m2
  const best = Object.entries(byPurpose).sort((a, b) => b[1] - a[1])[0]
  return best ? best[0] : 'home or a visit'
}

// A mixed profile averages the affinities out, so "far from you" blurs: with 34 % student, education
// still ends near the middle. For routing and the distance from yourself, the mix is sharpened towards
// the profile the city reads the walk as: each share is raised to the power 3 and scaled back to 100 %.
function sharpen(mix) {
  return normalise(Object.fromEntries(Object.entries(mix).map(([k, v]) => [k, v ** SHARPEN])))
}

// The mix's affinity for each use: the share-weighted average of the five profiles.
function mixAffinity(mix) {
  return Object.fromEntries(
    KNOWN_USES.map((u) => [u, PROFILES.reduce((sum, [k], p) => sum + mix[k] * AFFINITY[u][p], 0)]),
  )
}

// --- routes -------------------------------------------------------------------------------

// Floor-area-weighted affinity of a set of buildings, with what it covers. null when nothing is known.
function readBuildings(prep, indices, aff) {
  let weighted = 0
  let known = 0
  let unknown = 0
  const byUse = {}
  for (const i of indices)
    for (const [use, m2] of Object.entries(prep.floorAreas[i])) {
      if (use === 'undefined' || !(use in aff)) {
        unknown += m2
        continue
      }
      weighted += m2 * aff[use]
      known += m2
      byUse[use] = (byUse[use] ?? 0) + m2
    }
  return { affinity: known ? weighted / known : null, known, unknown, byUse }
}

// Cheapest path from a to b where each street costs cost(edgeIndex). Returns the edges in order.
function cheapestPath(data, a, b, cost) {
  const n = data.nodes.length
  const dist = new Float64Array(n).fill(Infinity)
  const via = new Int32Array(n).fill(-1)
  const done = new Uint8Array(n)
  dist[a] = 0
  const heap = [[0, a]]
  while (heap.length) {
    // A small binary heap, as in the walking reach.
    const [d, u] = heap[0]
    const last = heap.pop()
    if (heap.length) {
      heap[0] = last
      for (let i = 0; ; ) {
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
    if (done[u]) continue
    done[u] = 1
    if (u === b) break
    for (const ei of data.adj[u]) {
      const e = data.edges[ei]
      const v = e.a === u ? e.b : e.a
      const nd = d + cost(ei)
      if (nd < dist[v]) {
        dist[v] = nd
        via[v] = ei
        heap.push([nd, v])
        for (let i = heap.length - 1; i > 0; ) {
          const p = (i - 1) >> 1
          if (heap[p][0] <= heap[i][0]) break
          ;[heap[p], heap[i]] = [heap[i], heap[p]]
          i = p
        }
      }
    }
  }
  const path = []
  for (let v = b; v !== a; ) {
    const ei = via[v]
    if (ei < 0) return null
    path.push(ei)
    const e = data.edges[ei]
    v = e.a === v ? e.b : e.a
  }
  return path.reverse()
}

// The route as one line from A to B, its length, and what lies along it.
// With `shared` (the streets of the shortest route), only the streets not in it are measured,
// so the stretches all routes share at the start and end don't flatten the numbers.
function describeRoute(data, prep, startNode, path, aff, shared = null) {
  const line = [data.nodes[startNode].xy]
  let length = 0
  let measured = 0
  let at = startNode
  const near = new Set()
  const alongside = new Set() // buildings within 25 m of the whole route, for colouring the map
  for (const ei of path) {
    const e = data.edges[ei]
    const pts = e.a === at ? e.pts : [...e.pts].reverse()
    line.push(...pts.slice(1))
    at = e.a === at ? e.b : e.a
    length += e.length
    for (const i of prep.edgeBuildings[ei]) alongside.add(i)
    if (shared?.has(ei)) continue
    measured += e.length
    for (const i of prep.edgeBuildings[ei]) near.add(i)
  }
  const read = readBuildings(prep, near, aff)
  const mainUses = Object.entries(read.byUse)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([use, m2]) => ({ use, share: m2 / read.known }))
  const all = read.known + read.unknown
  return {
    key: path.join(','), // two routes are the same way when they use exactly the same streets
    line,
    alongside: [...alongside],
    length,
    measured, // metres of the route that are measured: all of it, or the part off the shortest route
    sameAsShortest: shared != null && measured === 0,
    minutes: length / WALK_M_PER_MIN,
    buildings: near.size,
    mainUses,
    // Distance from yourself: 1 minus the floor-area-weighted affinity of the buildings along the measured part.
    distance: read.affinity == null ? null : 1 - read.affinity,
    unknownShare: all ? read.unknown / all : 0,
  }
}

// Street scores for one mix sit close together, so each street gets its rank instead:
// 0 for the street least suited to the profile, 1 for the most suited.
// Streets with no known floor area nearby are neutral (0.5).
function rankStreets(scores) {
  const order = scores.map((a, i) => [a, i]).filter(([a]) => a != null).sort((x, y) => x[0] - y[0])
  const rank = scores.map(() => 0.5)
  order.forEach(([, i], r) => (rank[i] = order.length > 1 ? r / (order.length - 1) : 0.5))
  return rank
}

// "Show how the city reads you": every building's affinity for the mix, as a rank from 0 (the
// least suited building in the kit) to 1 (the most suited); equal values share a rank.
// Buildings with no known use get NaN.
function rankBuildings(prep, aff) {
  const values = prep.floorAreas.map((_, i) => readBuildings(prep, [i], aff).affinity)
  const order = values.map((a, i) => [a, i]).filter(([a]) => a != null).sort((x, y) => x[0] - y[0])
  const rank = new Float32Array(values.length).fill(NaN)
  const last = order.length - 1
  for (let start = 0; start <= last; ) {
    let end = start
    while (end < last && order[end + 1][0] === order[start][0]) end++
    const r = last > 0 ? (start + end) / 2 / last : 0.5
    for (let k = start; k <= end; k++) rank[order[k][1]] = r
    start = end + 1
  }
  return rank
}

// A few quiet notes along the misrouted walk: where it leaves the expected route, what it mainly
// passes on its longest own stretch, where it rejoins (if before B), and at B what straying cost.
function routeNotes(data, prep, startNode, misPath, expectedPath, misrouted, shortest) {
  const expected = new Set(expectedPath)
  // Runs of consecutive streets that are not on the expected route, with where each starts and ends.
  const runs = []
  let at = startNode
  for (const ei of misPath) {
    const e = data.edges[ei]
    const next = e.a === at ? e.b : e.a
    if (!expected.has(ei)) {
      const last = runs[runs.length - 1]
      if (last && last.to === at) {
        last.edges.push(ei)
        last.to = next
        last.length += e.length
      } else runs.push({ from: at, to: next, edges: [ei], length: e.length })
    }
    at = next
  }
  const notes = []
  const B = at
  if (runs.length && !misrouted.sameAsShortest) {
    notes.push({ xy: data.nodes[runs[0].from].xy, text: 'leaves the expected way', tone: 'blue' })
    // The longest own stretch: its two main uses, at its middle.
    const longest = runs.reduce((a, b) => (b.length > a.length ? b : a))
    const near = new Set(longest.edges.flatMap((ei) => prep.edgeBuildings[ei]))
    const byUse = {}
    for (const i of near)
      for (const [use, m2] of Object.entries(prep.floorAreas[i])) if (use !== 'undefined') byUse[use] = (byUse[use] ?? 0) + m2
    const uses = Object.entries(byUse)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([u]) => u.replace(/_/g, ' '))
    let walked = 0
    const mid = longest.edges.find((ei) => (walked += data.edges[ei].length) >= longest.length / 2)
    const pts = data.edges[mid].pts
    if (uses.length) notes.push({ xy: pts[Math.floor(pts.length / 2)], text: uses.join(' · '), tone: 'blue' })
    const lastRun = runs[runs.length - 1]
    if (lastRun.to !== B) notes.push({ xy: data.nodes[lastRun.to].xy, text: 'rejoins', tone: 'blue' })
  }
  const extra = Math.round((misrouted.length - shortest.length) / WALK_M_PER_MIN)
  const far = misrouted.distance == null ? '' : ` · ${Math.round(misrouted.distance * 100)} % from yourself`
  const atB = {
    xy: data.nodes[B].xy,
    text: misrouted.sameAsShortest ? 'does not stray' : `+${extra} min${far}`,
    tone: 'grey',
    atB: true,
  }
  // Keep the notes few and apart: leave out any that would sit within 100 m of B or of a note before it.
  const kept = []
  for (const n of notes)
    if ([atB, ...kept].every((o) => Math.hypot(o.xy[0] - n.xy[0], o.xy[1] - n.xy[1]) > 100)) kept.push(n)
  return [...kept, atB]
}

// --- everything for one pair of clicks ----------------------------------------------------

export function snap(data, xy) {
  const { node, distance } = nearestWalkableNode(data, xy)
  if (node < 0 || distance > MAX_SNAP_M) return { error: 'tooFar', distance }
  return { node, xy: data.nodes[node].xy, snapDistance: distance }
}

export function computeMisroute(data, prep, xyA, xyB, time = { day: 'weekday', hour: 12 }) {
  const A = snap(data, xyA)
  const B = snap(data, xyB)
  if (A.error || B.error) return { error: 'tooFar', which: A.error ? 'A' : 'B' }
  if (A.node === B.node) return { error: 'same', start: A.xy }

  // Who the city reads in this walk.
  const nearA = surroundings(data, prep, A.xy)
  const nearB = surroundings(data, prep, B.xy)
  const census = censusAt(data, prep, A.xy)
  const { x0, y0, x1, y1 } = prep.bounds
  const [ax, ay] = A.xy
  const atEdge = Math.min(ax - x0, x1 - ax, ay - y0, y1 - ay) < EDGE_M
  const fromA = profileFromStart(nearA, census, atEdge)
  const fromAB = updateWithDestination(fromA, nearB)
  const { mix, rules: timeRules } = shiftByTime(fromAB, time)
  const sharp = sharpen(mix)
  const aff = mixAffinity(sharp)
  const byAffinity = [...prep.namedUses].sort((a, b) => aff[b] - aff[a])

  // How suited each street is to the mix, as a rank from 0 to 1.
  const streetAff = rankStreets(prep.edgeBuildings.map((idx) => readBuildings(prep, idx, aff).affinity))
  const len = (ei) => data.edges[ei].length

  const shortestPath = cheapestPath(data, A.node, B.node, len)
  const expectedPath = cheapestPath(data, A.node, B.node, (ei) => len(ei) * (1 + 3 * (1 - streetAff[ei])))
  const shortest = describeRoute(data, prep, A.node, shortestPath, aff)
  const shared = new Set(shortestPath)

  // The misrouted walk: prefer streets the profile is least drawn to, and leave the shortest and expected
  // routes where it can, but no more than twice as long.
  const avoid = new Set([...shortestPath, ...expectedPath])
  let misrouted = null
  let misPath = shortestPath
  let strength = null
  for (const k of STRENGTHS) {
    const path = cheapestPath(data, A.node, B.node, (ei) => len(ei) * (1 + k * streetAff[ei]) * (avoid.has(ei) ? AVOID : 1))
    const route = describeRoute(data, prep, A.node, path, aff, shared)
    if (route.length <= MAX_DETOUR * shortest.length + 0.01) {
      misrouted = route
      misPath = path
      strength = k
      break
    }
  }
  const fellBack = !misrouted
  if (fellBack) misrouted = describeRoute(data, prep, A.node, shortestPath, aff, shared)
  const expected = describeRoute(data, prep, A.node, expectedPath, aff, shared)

  // The 25 m bands on the ground, as for the walking reach.
  for (const route of [expected, misrouted]) route.band = toPolygons(bandAround([route.line], A.xy))

  return {
    start: A.xy,
    end: B.xy,
    snapA: A.snapDistance,
    snapB: B.snapDistance,
    census,
    atEdge,
    fromA,
    fromAB,
    time,
    timeRules,
    mix,
    sharp,
    closeUses: byAffinity.slice(0, 3),
    farUses: byAffinity.slice(-3).reverse(),
    purpose: purposeOf(nearB),
    buildingRank: rankBuildings(prep, aff),
    notes: routeNotes(data, prep, A.node, misPath, expectedPath, misrouted, shortest),
    routes: {
      shortest,
      expected,
      misrouted,
    },
    strength,
    fellBack,
  }
}

// "Play the day": the same walk at every hour from 0 to 23, on a weekday or at the weekend.
export function computeMisrouteDay(data, prep, xyA, xyB, day) {
  return Array.from({ length: 24 }, (_, hour) => computeMisroute(data, prep, xyA, xyB, { day, hour }))
}
