// The 3D city: ground, streets, buildings and the three reach areas.
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Line, Html } from '@react-three/drei'
import { buildingsGeometry, paintBuildings, streetsGeometry, areaGeometry, outlineGeometry, footsteps } from './cityGeometry.js'
import {
  useColor,
  REACH_COLORS,
  AREA_TINTS,
  GROUND,
  STREET,
  SHOP,
  SHOP_SELECTED,
  ROUTE_COLORS,
  WALK_PALE,
  WALK_FILLS,
  WALK_EDGES,
  readColor,
  readOpacity,
  READ_UNKNOWN,
  READ_UNKNOWN_EDGE,
  WALK_OPACITY,
} from './palette.js'

// A click that ends a drag (orbiting or panning) is not a pick.
const isDrag = (e) => e.delta > 4

// While a walk is shown, `near` says for each building which routes pass within 25 m:
// 0 none, 1 the expected route, 2 the misrouted walk, 3 both (drawn as the misrouted walk).
const NEAR_COLORS = [WALK_PALE, WALK_FILLS.expected, WALK_FILLS.misrouted, WALK_FILLS.misrouted]

// `paint`, when given, is a colour for every building and wins over everything else; `fade` an opacity.
// With `ghost` (once A and B are set), the buildings are drawn at 70 % opacity, or at `fade`. A first,
// invisible pass writes only their depth, so only the nearest wall of each building is blended over what
// lies behind: this avoids the flickering of overlapping see-through walls. Buildings fainter than 40 %
// skip that pass, so the buildings behind them still show through.
function Buildings({ city, levels, near, paint, fade, ghost, onPick }) {
  const invalidate = useThree((s) => s.invalidate)
  const merged = useMemo(() => buildingsGeometry(city.buildings), [city])
  useEffect(() => () => merged.geometry.dispose(), [merged])
  useEffect(() => {
    paintBuildings(merged, (i) =>
      paint
        ? paint[i]
        : near
        ? NEAR_COLORS[near[i]]
        : levels && levels[i] >= 0
          ? REACH_COLORS[levels[i]]
          : useColor[city.buildings[i].use] ?? useColor.undefined,
      ghost ? (i) => (fade ? fade[i] : WALK_OPACITY) : null,
    )
    invalidate()
  }, [merged, levels, near, paint, fade, ghost, city, invalidate])

  return (
    <>
      {ghost && (
        <mesh geometry={merged.geometry} renderOrder={2} raycast={() => null}>
          <meshBasicMaterial
            vertexColors
            alphaTest={0.4}
            colorWrite={false}
            transparent
            polygonOffset
            polygonOffsetFactor={1}
            polygonOffsetUnits={1}
          />
        </mesh>
      )}
      <mesh
        geometry={merged.geometry}
        renderOrder={ghost ? 3 : 0}
        onClick={(e) => {
          // Clicking a building starts from the ground under the point you clicked.
          e.stopPropagation()
          if (!isDrag(e)) onPick([e.point.x, -e.point.z])
        }}
      >
        {/* Pushed back a little, so building outlines drawn on the walls stay visible. */}
        <meshLambertMaterial
          key={ghost ? 'ghost' : 'solid'}
          vertexColors
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
          transparent={ghost}
          depthWrite={!ghost}
        />
      </mesh>
    </>
  )
}

function Ground({ city, onPick }) {
  const { x0, y0, x1, y1 } = city.bounds
  const margin = 400
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[(x0 + x1) / 2, 0, -(y0 + y1) / 2]}
      onClick={(e) => !isDrag(e) && onPick([e.point.x, -e.point.z])}
    >
      <planeGeometry args={[x1 - x0 + 2 * margin, y1 - y0 + 2 * margin]} />
      <meshBasicMaterial color={GROUND} />
    </mesh>
  )
}

function Streets({ city }) {
  const geometry = useMemo(() => streetsGeometry(city.streets, 0.6), [city])
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={STREET} />
    </lineSegments>
  )
}

function ReachArea({ polygons, level }) {
  const geometry = useMemo(() => areaGeometry(polygons), [polygons])
  useEffect(() => () => geometry.dispose(), [geometry])
  // Smaller areas sit slightly higher, so they are drawn on top.
  return (
    <mesh geometry={geometry} position-y={0.1 + (2 - level) * 0.15} raycast={() => null}>
      <meshBasicMaterial color={AREA_TINTS[level]} />
    </mesh>
  )
}

function StartMarker({ xy }) {
  return (
    <mesh position={[xy[0], 25, -xy[1]]} raycast={() => null}>
      <cylinderGeometry args={[10, 0.5, 50, 24]} />
      <meshLambertMaterial color="#ffffff" emissive="#555555" />
    </mesh>
  )
}

// "Walk from yourself": a labelled marker for A and B.
function WalkMarker({ xy, label, color }) {
  return (
    <group position={[xy[0], 0, -xy[1]]}>
      <mesh position-y={25} raycast={() => null}>
        <cylinderGeometry args={[10, 0.5, 50, 24]} />
        <meshLambertMaterial color={color} emissive={color} emissiveIntensity={0.3} />
      </mesh>
      <Html position={[0, 62, 0]} center className="marker-label" style={{ pointerEvents: 'none' }}>
        {label}
      </Html>
    </group>
  )
}

// The expected route and the misrouted walk as light 25 m bands on the ground, like the reach areas,
// with their line along the street centre on top. The dashed near-black shortest route lies on top.
// Each band and line is keyed by its route, so it is only rebuilt when the route really changes,
// not every hour while playing the day.
function RouteBand({ polygons, color, opacity, y }) {
  const geometry = useMemo(() => areaGeometry(polygons), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position-y={y} renderOrder={1} raycast={() => null}>
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}

// Route lines are drawn last and without depth test, so a building can never cover them;
// `order` sets which line lies on top of which. With `outline`, a white line under a route keeps it
// readable on a coloured city.
function RouteLine({ line, color, y, width, order, outline, ...style }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const [points, under] = useMemo(() => [y, y - 0.2].map((h) => line.map(([x, z]) => [x, h, -z])), [])
  const onTop = { depthTest: false, depthWrite: false, transparent: true, raycast: () => null }
  return (
    <>
      {outline && <Line points={under} color="#ffffff" lineWidth={width + 3} renderOrder={order - 0.5} {...onTop} />}
      <Line points={points} color={color} lineWidth={width} renderOrder={order} {...onTop} {...style} />
    </>
  )
}

// Buildings within 25 m of a route as line drawings: their edges in the route's tone.
function BuildingOutlines({ city, indices, color }) {
  const geometry = useMemo(() => outlineGeometry(city.buildings, indices), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  )
}

function Routes({ city, routes, outline, unknown }) {
  const { expected, misrouted, shortest } = routes
  // A building near both routes is drawn in the misrouted walk's blue.
  const expectedOnly = useMemo(() => {
    const m = new Set(misrouted.alongside)
    return expected.alongside.filter((i) => !m.has(i))
  }, [expected, misrouted])
  return (
    <>
      <BuildingOutlines key={`eo${expected.key}|${misrouted.key}`} city={city} indices={expectedOnly} color={WALK_EDGES.expected} />
      <BuildingOutlines key={`mo${misrouted.key}`} city={city} indices={misrouted.alongside} color={WALK_EDGES.misrouted} />
      {unknown && (
        <BuildingOutlines key={`uo${expected.key}|${misrouted.key}`} city={city} indices={unknown} color={READ_UNKNOWN_EDGE} />
      )}
      <RouteBand key={`eb${expected.key}`} polygons={expected.band} color={ROUTE_COLORS.expected} opacity={0.2} y={0.3} />
      <RouteBand key={`mb${misrouted.key}`} polygons={misrouted.band} color={ROUTE_COLORS.misrouted} opacity={0.14} y={0.5} />
      <RouteLine key={`el${expected.key}`} line={expected.line} color={ROUTE_COLORS.expected} width={3} y={1.8} order={10} outline={outline} />
      <RouteLine key={`ml${misrouted.key}`} line={misrouted.line} color={ROUTE_COLORS.misrouted} width={4.5} y={2.2} order={11} outline={outline} />
      <RouteLine
        key={`sl${shortest.key}`}
        line={shortest.line}
        color={ROUTE_COLORS.shortest}
        width={1.8}
        y={2.8}
        order={12}
        outline={outline}
        dashed
        dashSize={7}
        gapSize={6}
      />
    </>
  )
}

// Where a note sits on screen. A note whose place on the map is behind the attribution line at the
// bottom is moved out of sight, instead of overlapping that line; it comes back when its place does.
const KEEP_ABOVE_PX = 44
const v = new THREE.Vector3()
function notePosition(el, camera, size) {
  v.setFromMatrixPosition(el.matrixWorld).project(camera)
  const y = ((1 - v.y) / 2) * size.height
  return [((v.x + 1) / 2) * size.width, y > size.height - KEEP_ABOVE_PX ? -1000 : y]
}

// A few quiet notes along the misrouted walk, in a typewriter font. They are page labels, so the
// buildings never cover them.
function RouteNotes({ notes }) {
  return notes.map((n, i) => (
    <Html
      key={`${i}-${n.text}`}
      position={[n.xy[0], 4, -n.xy[1]]}
      className={`route-note ${n.tone}${n.atB ? ' at-b' : ''}`}
      calculatePosition={notePosition}
      zIndexRange={[5, 0]}
      style={{ pointerEvents: 'none' }}
    >
      {n.text}
    </Html>
  ))
}

// "Play the day" as a density map: each played hour's misrouted walk is its own strand of footsteps,
// translucent electric blue, shifted sideways by its hour. Where many hours take the same streets the
// strands pile up and the trace gets darker and denser by itself.
const STEP = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
function Footsteps({ strands }) {
  const invalidate = useThree((s) => s.invalidate)
  const mesh = useMemo(() => {
    const marks = strands.flatMap(({ hour, line }) => footsteps(line, (hour - 11.5) * 0.15, (hour * 5.3) % 14))
    const material = new THREE.MeshBasicMaterial({
      color: ROUTE_COLORS.misrouted,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    })
    const m = new THREE.InstancedMesh(STEP, material, Math.max(1, marks.length))
    m.count = marks.length
    const matrix = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    marks.forEach(([x, y, angle, l, w], i) => {
      q.setFromAxisAngle(up, angle)
      matrix.compose(new THREE.Vector3(x, 1.0, -y), q, new THREE.Vector3(l, 1, w))
      m.setMatrixAt(i, matrix)
    })
    m.raycast = () => null
    return m
  }, [strands])
  useEffect(() => {
    invalidate()
    return () => {
      mesh.material.dispose()
      mesh.dispose()
    }
  }, [mesh, invalidate])
  return <primitive object={mesh} />
}

// An invisible, wider line along each way the walk strayed, to show its hours when pointed at.
const tracePointCache = new WeakMap()
const tracePoints = (t) => {
  if (!tracePointCache.has(t.line)) tracePointCache.set(t.line, t.line.map(([x, z]) => [x, 1.2, -z]))
  return tracePointCache.get(t.line)
}

function TraceHover({ traces }) {
  const [hover, setHover] = useState(null)
  return (
    <>
      {traces.map((t) => {
        const show = (e) => {
          e.stopPropagation()
          setHover({ label: t.label, point: e.point.toArray() })
        }
        return (
          <Line
            key={t.key}
            points={tracePoints(t)}
            lineWidth={14}
            transparent
            opacity={0}
            depthWrite={false}
            onPointerOver={show}
            onPointerMove={show}
            onPointerOut={() => setHover(null)}
          />
        )
      })}
      {hover && (
        <Html position={hover.point} className="trace-label" style={{ pointerEvents: 'none' }}>
          {hover.label}
        </Html>
      )}
    </>
  )
}

// A pin above each building with shop space. Clicking a pin selects it in the list.
function ShopPins({ city, shops, selected, onSelect }) {
  return shops.map((shop) => {
    const b = city.buildings[shop.index]
    const on = shop.index === selected
    const size = on ? 1.8 : 1
    return (
      <group key={shop.index} position={[b.centre[0], b.height, -b.centre[1]]}>
        <mesh position-y={12 * size} onClick={(e) => (e.stopPropagation(), onSelect(shop.index))}>
          <sphereGeometry args={[5 * size, 16, 12]} />
          <meshLambertMaterial color={on ? SHOP_SELECTED : SHOP} emissive={on ? SHOP_SELECTED : SHOP} emissiveIntensity={0.35} />
        </mesh>
        <mesh position-y={6 * size} raycast={() => null}>
          <cylinderGeometry args={[0.6, 0.6, 12 * size, 6]} />
          <meshBasicMaterial color={on ? SHOP_SELECTED : SHOP} />
        </mesh>
      </group>
    )
  })
}

export default function CityScene({ city, reach, walk, onPick, selectedShop, onSelectShop }) {
  const { x0, y0, x1, y1 } = city.bounds
  const shown = walk?.routes?.routes
  const near = useMemo(() => {
    if (!shown) return null
    const n = new Uint8Array(city.buildings.length)
    for (const i of shown.expected.alongside) n[i] |= 1
    for (const i of shown.misrouted.alongside) n[i] |= 2
    return n
  }, [shown, city])
  // "Show how the city reads you": every building away from the routes by its rank for the current mix
  // (greys) and its activity at this hour (opacity); the line-drawn route buildings stay as they are.
  const ranks = walk?.reading ? walk?.routes?.buildingRank : null
  const awake = walk?.reading ? walk?.routes?.buildingActivity : null
  const paint = useMemo(
    () =>
      ranks &&
      Array.from(ranks, (rank, i) =>
        near[i] ? NEAR_COLORS[near[i]] : Number.isNaN(rank) ? READ_UNKNOWN : readColor(rank),
      ),
    [ranks, near],
  )
  const fade = useMemo(
    () => awake && Float32Array.from(awake, (a, i) => (near[i] ? WALK_OPACITY : readOpacity(a))),
    [awake, near],
  )
  // Buildings with no known use and no route outline get a thin grey outline.
  const unknown = useMemo(
    () => ranks && Array.from(ranks.keys()).filter((i) => Number.isNaN(ranks[i]) && !near[i]),
    [ranks, near],
  )
  const cx = (x0 + x1) / 2
  const cz = -(y0 + y1) / 2
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [cx + 500, 1300, cz + 1500], fov: 35, near: 5, far: 20000 }}
      style={{ cursor: 'crosshair' }}
    >
      <color attach="background" args={['#e7e3da']} />
      <hemisphereLight args={['#ffffff', '#cfc8bb', 1.6]} />
      <directionalLight position={[-600, 1200, 400]} intensity={1.6} />
      <Ground city={city} onPick={onPick} />
      <Streets city={city} />
      <Buildings city={city} levels={reach?.buildingLevel} near={near} paint={paint} fade={fade} ghost={!!shown} onPick={onPick} />
      {reach?.areas?.map((a, level) => (
        <ReachArea key={`${reach.id}-${level}`} polygons={a.polygons} level={level} />
      ))}
      {reach?.start && <StartMarker xy={reach.start} />}
      {walk?.strands?.length > 0 && <Footsteps strands={walk.strands} />}
      {walk?.traces?.length > 0 && <TraceHover traces={walk.traces} />}
      {walk?.routes && <Routes city={city} routes={walk.routes.routes} outline={!!paint} unknown={unknown} />}
      {walk?.routes?.notes && <RouteNotes notes={walk.routes.notes} />}
      {walk?.a && <WalkMarker xy={walk.routes?.start ?? walk.a} label="A" color="#ffffff" />}
      {walk?.b && <WalkMarker xy={walk.routes?.end ?? walk.b} label="B" color="#1c1c1c" />}
      {reach?.shops && <ShopPins city={city} shops={reach.shops} selected={selectedShop} onSelect={onSelectShop} />}
      <OrbitControls makeDefault target={[cx, 0, cz]} maxPolarAngle={Math.PI / 2.15} minDistance={60} maxDistance={6000} />
    </Canvas>
  )
}
