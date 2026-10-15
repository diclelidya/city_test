// Turns the projected city data into three.js geometry.
// Map x (east) becomes scene x, map y (north) becomes scene -z, height is scene y.
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { makeProjection } from './projection.js'

const toVectors = (ring) => {
  const pts = ring.map(([x, y]) => new THREE.Vector2(x, y))
  if (pts.length > 1 && pts[0].equals(pts[pts.length - 1])) pts.pop()
  return pts
}

function shapeFromRings(rings) {
  const shape = new THREE.Shape(toVectors(rings[0]))
  shape.holes = rings.slice(1).map((r) => new THREE.Path(toVectors(r)))
  return shape
}

// Lay a shape drawn in map x/y flat on the ground.
const layFlat = (geometry) => geometry.rotateX(-Math.PI / 2)

export function prepareCity({ kit, buildings, graph }) {
  const project = makeProjection(kit.center)
  const [w, s, e, n] = kit.bbox
  const [x0, y0] = project([w, s])
  const [x1, y1] = project([e, n])
  return {
    project,
    bounds: { x0, y0, x1, y1 },
    buildings: buildings.features.map((f) => {
      const rings = f.geometry.coordinates.map((r) => r.map(project))
      const corners = rings[0].slice(0, -1)
      return {
        use: f.properties.use ?? 'undefined',
        height: f.properties.height,
        rings,
        centre: [0, 1].map((k) => corners.reduce((sum, c) => sum + c[k], 0) / corners.length),
      }
    }),
    streets: graph.edges.filter((e) => e.walkable).map((e) => e.coords.map(project)),
  }
}

// All buildings in one mesh. `ranges` remembers which vertices belong to which building,
// so each building can be recoloured without rebuilding anything.
export function buildingsGeometry(buildings) {
  const parts = []
  const ranges = []
  let offset = 0
  for (const b of buildings) {
    const g = new THREE.ExtrudeGeometry(shapeFromRings(b.rings), { depth: b.height, bevelEnabled: false })
    g.deleteAttribute('uv')
    const count = g.attributes.position.count
    ranges.push([offset, count])
    offset += count
    parts.push(g)
  }
  const geometry = mergeGeometries(parts, false)
  parts.forEach((g) => g.dispose())
  layFlat(geometry)
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(offset * 3), 3))
  return { geometry, ranges }
}

export function paintBuildings({ geometry, ranges }, colorOf) {
  const attr = geometry.attributes.color
  const out = attr.array
  // Each colour is read once and reused, and written straight into the array: quick enough to
  // recolour the whole city every hour while playing the day.
  const cache = new Map()
  ranges.forEach(([start, count], i) => {
    const key = colorOf(i)
    let c = cache.get(key)
    if (!c) cache.set(key, (c = new THREE.Color(key)))
    for (let v = start * 3, end = (start + count) * 3; v < end; v += 3) {
      out[v] = c.r
      out[v + 1] = c.g
      out[v + 2] = c.b
    }
  })
  attr.needsUpdate = true
}

export function streetsGeometry(streets, height) {
  const pos = []
  for (const line of streets)
    for (let i = 1; i < line.length; i++) pos.push(line[i - 1][0], height, -line[i - 1][1], line[i][0], height, -line[i][1])
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

// A flat area from a list of polygons (each a list of rings).
export function areaGeometry(polygons) {
  return layFlat(new THREE.ShapeGeometry(polygons.map(shapeFromRings), 1))
}

// "Walk from yourself": the outlines of some buildings as line segments, for a line drawing:
// the base, the roof edge, and the wall corners (only where the wall turns, so round buildings
// don't fill up with vertical lines).
export function outlineGeometry(buildings, indices) {
  const pos = []
  const add = (ax, ay, ah, bx, by, bh) => pos.push(ax, ah, -ay, bx, bh, -by)
  for (const i of indices) {
    const { rings, height: h } = buildings[i]
    for (const r of rings) {
      const n = r.length - 1 // closed ring
      for (let k = 0; k < n; k++) {
        const [ax, ay] = r[k]
        const [bx, by] = r[k + 1]
        add(ax, ay, 0.05, bx, by, 0.05)
        add(ax, ay, h, bx, by, h)
        const [px, py] = r[(k - 1 + n) % n]
        const turn = Math.abs(Math.atan2((ax - px) * (by - ay) - (ay - py) * (bx - ax), (ax - px) * (bx - ax) + (ay - py) * (by - ay)))
        if (turn > 0.35) add(ax, ay, 0, ax, ay, h)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  return g
}

// "Play the day": footsteps along a route, a small dot and a short dash every 14 m, shifted sideways
// by `offset` metres and started `phase` metres along, as [x, y, angle, length, width] marks.
const STEP_PERIOD = 14
const STEP_MARKS = [
  [0, 2.4, 2.4], // dot: start, length, width
  [6, 6, 1.6], // dash
]
export function footsteps(line, offset, phase) {
  const marks = []
  let walked = 0
  for (let i = 1; i < line.length; i++) {
    const [ax, ay] = line[i - 1]
    const [bx, by] = line[i]
    const len = Math.hypot(bx - ax, by - ay)
    if (!len) continue
    const dx = (bx - ax) / len
    const dy = (by - ay) / len
    const angle = Math.atan2(dy, dx)
    const first = Math.floor((walked - phase) / STEP_PERIOD) - 1
    for (let n = first; phase + n * STEP_PERIOD < walked + len; n++)
      for (const [start, l, w] of STEP_MARKS) {
        const c = phase + n * STEP_PERIOD + start + l / 2 // centre of the mark, metres along the route
        if (c < walked || c >= walked + len) continue
        const t = c - walked
        marks.push([ax + dx * t - dy * offset, ay + dy * t + dx * offset, angle, l, w])
      }
    walked += len
  }
  return marks
}
