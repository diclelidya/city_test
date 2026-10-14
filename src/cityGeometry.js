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
  const c = new THREE.Color()
  ranges.forEach(([start, count], i) => {
    c.set(colorOf(i))
    for (let v = start; v < start + count; v++) attr.setXYZ(v, c.r, c.g, c.b)
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
