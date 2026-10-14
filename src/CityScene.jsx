// The 3D city: ground, streets, buildings and the three reach areas.
import { useEffect, useMemo, useState } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Line, Html } from '@react-three/drei'
import { buildingsGeometry, paintBuildings, streetsGeometry, areaGeometry } from './cityGeometry.js'
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
  WALK_TINTS,
} from './palette.js'

// A click that ends a drag (orbiting or panning) is not a pick.
const isDrag = (e) => e.delta > 4

// While a walk is shown, `near` says for each building which routes pass within 25 m:
// 0 none, 1 the expected route, 2 the misrouted walk, 3 both.
const NEAR_COLORS = [WALK_PALE, WALK_TINTS.expected, WALK_TINTS.misrouted, WALK_TINTS.both]

function Buildings({ city, levels, near, onPick }) {
  const invalidate = useThree((s) => s.invalidate)
  const merged = useMemo(() => buildingsGeometry(city.buildings), [city])
  useEffect(() => () => merged.geometry.dispose(), [merged])
  useEffect(() => {
    paintBuildings(merged, (i) =>
      near
        ? NEAR_COLORS[near[i]]
        : levels && levels[i] >= 0
          ? REACH_COLORS[levels[i]]
          : useColor[city.buildings[i].use] ?? useColor.undefined,
    )
    invalidate()
  }, [merged, levels, near, city, invalidate])

  return (
    <mesh
      geometry={merged.geometry}
      onClick={(e) => {
        // Clicking a building starts from the ground under the point you clicked.
        e.stopPropagation()
        if (!isDrag(e)) onPick([e.point.x, -e.point.z])
      }}
    >
      <meshLambertMaterial vertexColors />
    </mesh>
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

// The expected route and the misrouted walk as translucent 25 m bands on the ground, like the reach
// areas; where they overlap the colours mix. The dashed near-black shortest route lies on top.
function RouteBand({ polygons, color, y }) {
  const geometry = useMemo(() => areaGeometry(polygons), [polygons])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position-y={y} raycast={() => null}>
      <meshBasicMaterial color={color} transparent opacity={0.32} depthWrite={false} />
    </mesh>
  )
}

function Routes({ routes }) {
  return (
    <>
      <RouteBand polygons={routes.expected.band} color={ROUTE_COLORS.expected} y={0.3} />
      <RouteBand polygons={routes.misrouted.band} color={ROUTE_COLORS.misrouted} y={0.5} />
      {/* The exact way along the street centre, on top of each band. */}
      <Line
        points={routes.expected.line.map(([x, z]) => [x, 1.8, -z])}
        color={ROUTE_COLORS.expected}
        lineWidth={4}
        raycast={() => null}
      />
      <Line
        points={routes.misrouted.line.map(([x, z]) => [x, 2.2, -z])}
        color={ROUTE_COLORS.misrouted}
        lineWidth={4}
        raycast={() => null}
      />
      <Line
        points={routes.shortest.line.map(([x, z]) => [x, 2.8, -z])}
        color={ROUTE_COLORS.shortest}
        lineWidth={2.5}
        dashed
        dashSize={8}
        gapSize={6}
        raycast={() => null}
      />
    </>
  )
}

// "Play the day": the misrouted walks of the other hours played, as dotted pink traces, so they don't
// look like the current route. The more hours share a trace, the thicker and less faint it is.
// Hovering a trace shows its hours.
function Traces({ traces }) {
  const [hover, setHover] = useState(null)
  return (
    <>
      {traces.map((t) => {
        const share = (t.hours.length - 1) / 23 // 0 for one hour, 1 for all 24
        const points = t.line.map(([x, z]) => [x, 1.2, -z])
        const show = (e) => {
          e.stopPropagation()
          setHover({ label: t.label, point: e.point.toArray() })
        }
        return (
          <group key={t.key}>
            <Line
              points={points}
              color={ROUTE_COLORS.misrouted}
              lineWidth={1.5 + 5.5 * share}
              dashed
              dashSize={3 + 8 * share}
              gapSize={6 + 6 * share}
              transparent
              opacity={0.3 + 0.6 * share}
              depthWrite={false}
              raycast={() => null}
            />
            {/* A wider, invisible copy of the trace, so it is easy to point at. */}
            <Line
              points={points}
              lineWidth={14}
              transparent
              opacity={0}
              depthWrite={false}
              onPointerOver={show}
              onPointerMove={show}
              onPointerOut={() => setHover(null)}
            />
          </group>
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
      <Buildings city={city} levels={reach?.buildingLevel} near={near} onPick={onPick} />
      {reach?.areas?.map((a, level) => (
        <ReachArea key={`${reach.id}-${level}`} polygons={a.polygons} level={level} />
      ))}
      {reach?.start && <StartMarker xy={reach.start} />}
      {walk?.traces?.length > 0 && <Traces traces={walk.traces} />}
      {walk?.routes && <Routes key={walk.routes.id} routes={walk.routes.routes} />}
      {walk?.a && <WalkMarker xy={walk.routes?.start ?? walk.a} label="A" color="#ffffff" />}
      {walk?.b && <WalkMarker xy={walk.routes?.end ?? walk.b} label="B" color="#1c1c1c" />}
      {reach?.shops && <ShopPins city={city} shops={reach.shops} selected={selectedShop} onSelect={onSelectShop} />}
      <OrbitControls makeDefault target={[cx, 0, cz]} maxPolarAngle={Math.PI / 2.15} minDistance={60} maxDistance={6000} />
    </Canvas>
  )
}
