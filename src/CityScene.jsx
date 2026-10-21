// The 3D city: ground, streets, buildings and the three reach areas.
// "Walk from yourself" draws the same city dark, in lines, with the misrouted walk as its one bright thing.
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
  WALK_CORE,
  WALK_EDGES,
  DARK,
  readColor,
  readOpacity,
  READ_UNKNOWN_EDGE,
  WALK_OPACITY,
} from './palette.js'

// A click that ends a drag (orbiting or panning) is not a pick.
const isDrag = (e) => e.delta > 4

// `paint`, when given, is a colour for every building and wins over everything else. With `dark`, every
// building is the dark fill. `fade`, when given, is an opacity for every building: a first, invisible pass
// then writes only their depth, so only the nearest wall of each building is blended over what lies
// behind: this avoids the flickering of overlapping see-through walls. Buildings fainter than 40 % skip
// that pass, so the buildings behind them still show through.
function Buildings({ city, levels, paint, fade, dark, onPick }) {
  const invalidate = useThree((s) => s.invalidate)
  const merged = useMemo(() => buildingsGeometry(city.buildings), [city])
  const ghost = !!fade
  useEffect(() => () => merged.geometry.dispose(), [merged])
  useEffect(() => {
    paintBuildings(
      merged,
      (i) =>
        paint
          ? paint[i]
          : dark
            ? DARK.fill
            : levels && levels[i] >= 0
              ? REACH_COLORS[levels[i]]
              : useColor[city.buildings[i].use] ?? useColor.undefined,
      ghost ? (i) => fade[i] : null,
    )
    invalidate()
  }, [merged, levels, paint, fade, ghost, dark, city, invalidate])

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

function Ground({ city, color, onPick }) {
  const { x0, y0, x1, y1 } = city.bounds
  const margin = 400
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[(x0 + x1) / 2, 0, -(y0 + y1) / 2]}
      onClick={(e) => !isDrag(e) && onPick([e.point.x, -e.point.z])}
    >
      <planeGeometry args={[x1 - x0 + 2 * margin, y1 - y0 + 2 * margin]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

function Streets({ city, color }) {
  const geometry = useMemo(() => streetsGeometry(city.streets, 0.6), [city])
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={color} />
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

// "Walk from yourself": A and B as round blue pins with the letter inside, standing on their point. They
// are page elements, so buildings never cover them. Their shift goes in `style`: the 3D label library
// sets the transform there and would override one from the stylesheet.
const PIN_STYLE = { pointerEvents: 'none', transform: 'translate(-50%, -100%)' }
function WalkPin({ xy, label }) {
  return (
    <Html position={[xy[0], 0, -xy[1]]} className="walk-pin" zIndexRange={[6, 0]} style={PIN_STYLE}>
      <span className="pin-head">{label}</span>
      <span className="pin-dot" />
    </Html>
  )
}

// Every building's edges as thin light-grey lines: the dark city is drawn in lines. Roof edges and
// corners only; the outline on the ground would add a third more lines and slow down orbiting.
function CityEdges({ city }) {
  const geometry = useMemo(() => outlineGeometry(city.buildings, city.buildings.keys(), { base: false }), [city])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial color={DARK.edge} />
    </lineSegments>
  )
}

// Buildings within 25 m of a route: their edges again, brighter, in the route's tone. Drawn after the
// plain edges, on the same lines, so they replace them.
function BuildingOutlines({ city, indices, color }) {
  const geometry = useMemo(() => outlineGeometry(city.buildings, indices), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <lineSegments geometry={geometry} renderOrder={1} raycast={() => null}>
      <lineBasicMaterial color={color} />
    </lineSegments>
  )
}

// Route lines are drawn last and without depth test, so a building can never cover them;
// `order` sets which line lies on top of which. Each line is keyed by its route, so it is only
// rebuilt when the route really changes, not every hour while playing the day.
const ON_TOP = { depthTest: false, depthWrite: false, transparent: true, raycast: () => null }
function RouteLine({ line, y, ...style }) {
  const points = useMemo(() => line.map(([x, z]) => [x, y, -z]), []) // eslint-disable-line react-hooks/exhaustive-deps
  return <Line points={points} {...ON_TOP} {...style} />
}

// The misrouted walk: the only glowing thing. A wide soft halo, the electric-blue line and a thin light
// core. Its width follows how far each street lies from the profile: thicker on streets far from it,
// thinner on close ones, in five steps. Neighbouring streets of the same step are drawn as one line.
const WIDTH_STEPS = 4
function MisroutedGlow({ segments }) {
  const runs = useMemo(() => {
    const out = []
    for (const { line, far } of segments) {
      const step = Math.round(far * WIDTH_STEPS)
      const pts = line.map(([x, z]) => [x, 2.2, -z])
      const last = out[out.length - 1]
      if (last && last.step === step) last.points.push(...pts.slice(1))
      else out.push({ step, points: last ? [last.points[last.points.length - 1], ...pts.slice(1)] : pts })
    }
    return out
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return runs.map(({ step, points }, i) => {
    const width = 2.5 + 2 * step // 2.5 to 10.5 pixels
    return (
      <group key={i}>
        <Line points={points} color={ROUTE_COLORS.misrouted} lineWidth={width * 2.6 + 6} opacity={0.18} renderOrder={21} {...ON_TOP} />
        <Line points={points} color={ROUTE_COLORS.misrouted} lineWidth={width} renderOrder={22} {...ON_TOP} />
        <Line points={points} color={WALK_CORE} lineWidth={Math.max(1, width * 0.22)} renderOrder={23} {...ON_TOP} />
      </group>
    )
  })
}

function Routes({ city, routes, unknown }) {
  const { expected, misrouted, shortest } = routes
  // A building near both routes is drawn in the misrouted walk's tone.
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
      <RouteLine
        key={`sl${shortest.key}`}
        line={shortest.line}
        y={1.4}
        color={ROUTE_COLORS.shortest}
        lineWidth={1.2}
        opacity={0.7}
        renderOrder={10}
        dashed
        dashSize={1.2}
        gapSize={5}
      />
      <RouteLine
        key={`el${expected.key}`}
        line={expected.line}
        y={1.8}
        color={ROUTE_COLORS.expected}
        lineWidth={1.6}
        opacity={0.9}
        renderOrder={11}
        dashed
        dashSize={8}
        gapSize={6}
      />
      <MisroutedGlow key={`ml${misrouted.key}`} segments={misrouted.segments} />
    </>
  )
}

// Where a label sits on screen. A label whose place on the map is behind the attribution line at the
// bottom is moved out of sight, instead of overlapping that line; it comes back when its place does.
const KEEP_ABOVE_PX = 44
const v = new THREE.Vector3()
function notePosition(el, camera, size) {
  v.setFromMatrixPosition(el.matrixWorld).project(camera)
  const y = ((1 - v.y) / 2) * size.height
  return [((v.x + 1) / 2) * size.width, y > size.height - KEEP_ABOVE_PX ? -1000 : y]
}

// A few labels along the routes: small, uppercase, with a short leader line from a dot on the route and
// a dark backing. They are page labels, so the buildings never cover them. The label at B sits to the
// right of its pin.
const LABEL_STYLE = { pointerEvents: 'none', transform: 'translate(-3px, -50%)' }
const LABEL_AT_B_STYLE = { pointerEvents: 'none', transform: 'translate(18px, -100%)' }
function RouteNotes({ notes }) {
  return notes.map((n, i) => (
    <Html
      key={`${i}-${n.text}`}
      position={[n.xy[0], 4, -n.xy[1]]}
      className={`route-label ${n.tone}${n.atB ? ' at-b' : ''}`}
      calculatePosition={notePosition}
      zIndexRange={[5, 0]}
      style={n.atB ? LABEL_AT_B_STYLE : LABEL_STYLE}
    >
      {!n.atB && <span className="label-dot" />}
      {!n.atB && <span className="label-leader" />}
      <span className="label-text">
        {n.text}
        {n.sub && <span className="label-sub">{n.sub}</span>}
      </span>
    </Html>
  ))
}

// "Play the day" as a density map: each played hour's misrouted walk is its own strand of footsteps,
// faint electric blue, shifted sideways by its hour. Where many hours take the same streets the
// strands pile up and the trace gets brighter and denser by itself.
const STEP = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
function Footsteps({ strands }) {
  const invalidate = useThree((s) => s.invalidate)
  const mesh = useMemo(() => {
    const marks = strands.flatMap(({ hour, line }) => footsteps(line, (hour - 11.5) * 0.15, (hour * 5.3) % 14))
    const material = new THREE.MeshBasicMaterial({
      color: ROUTE_COLORS.misrouted,
      transparent: true,
      opacity: 0.24,
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

// Once A and B are set, the camera glides in about a second to frame the whole walk, keeping its angle.
// The panel on the left is left out of the frame. Orbiting or zooming stops the glide.
const PANEL_PX = 352
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
function FrameWalk({ frame }) {
  const { camera, controls, invalidate, size } = useThree()
  useEffect(() => {
    if (!frame || !controls) return
    const [x0, y0, x1, y1] = frame.box
    const centre = new THREE.Vector3((x0 + x1) / 2, 0, -(y0 + y1) / 2)
    const panel = size.width > 700 ? PANEL_PX : 0
    const aspect = (size.width - panel) / size.height
    const tan = Math.tan((camera.fov * Math.PI) / 360)
    // Some room around the walk, also for the labels beside A and B.
    const radius = Math.hypot(x1 - x0, y1 - y0) * 0.6 + 80
    const distance = THREE.MathUtils.clamp(radius / (tan * Math.min(1, aspect)), controls.minDistance, controls.maxDistance)
    const direction = camera.position.clone().sub(controls.target).normalize()
    // Move the view so the walk sits in the middle of the part of the screen not covered by the panel.
    const right = new THREE.Vector3().crossVectors(direction, camera.up).normalize()
    const shift = ((panel / 2) / size.width) * 2 * distance * tan * camera.aspect
    const target = centre.clone().addScaledVector(right, shift)
    const endPosition = target.clone().addScaledVector(direction, distance)
    const startPosition = camera.position.clone()
    const startTarget = controls.target.clone()
    const t0 = performance.now()
    let raf = 0
    const stop = () => cancelAnimationFrame(raf)
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 1000)
      camera.position.lerpVectors(startPosition, endPosition, ease(k))
      controls.target.lerpVectors(startTarget, target, ease(k))
      controls.update()
      invalidate()
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    controls.addEventListener('start', stop)
    return () => {
      stop()
      controls.removeEventListener('start', stop)
    }
  }, [frame?.id, controls]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

export default function CityScene({ city, reach, walk, onPick, selectedShop, onSelectShop }) {
  const { x0, y0, x1, y1 } = city.bounds
  const dark = !!walk
  const shown = walk?.routes?.routes
  const near = useMemo(() => {
    if (!shown) return null
    const n = new Uint8Array(city.buildings.length)
    for (const i of shown.expected.alongside) n[i] |= 1
    for (const i of shown.misrouted.alongside) n[i] |= 2
    return n
  }, [shown, city])
  // "Show how the city reads you": every building away from the routes by its rank for the current mix
  // (close to you dark, far from you lighter) and its activity at this hour (opacity); the buildings
  // along the routes keep the plain dark fill and their brighter edges.
  const ranks = walk?.reading ? walk?.routes?.buildingRank : null
  const awake = walk?.reading ? walk?.routes?.buildingActivity : null
  const paint = useMemo(
    () => ranks && Array.from(ranks, (rank, i) => (near[i] ? DARK.fill : readColor(rank))),
    [ranks, near],
  )
  const fade = useMemo(
    () => awake && Float32Array.from(awake, (a, i) => (near[i] ? WALK_OPACITY : readOpacity(a))),
    [awake, near],
  )
  // Buildings with no known use and no route outline get a lighter grey outline.
  const unknown = useMemo(
    () => ranks && Array.from(ranks.keys()).filter((i) => Number.isNaN(ranks[i]) && !near[i]),
    [ranks, near],
  )
  // What the camera frames once A and B are set: all three routes. A new frame only for a new A or B,
  // not for every hour while playing the day.
  const start = walk?.routes?.start
  const end = walk?.routes?.end
  const frame = useMemo(() => {
    if (!shown) return null
    const pts = [shown.shortest, shown.expected, shown.misrouted].flatMap((r) => r.line)
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    return { id: `${start}|${end}`, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
  }, [shown, start, end])
  const cx = (x0 + x1) / 2
  const cz = -(y0 + y1) / 2
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [cx + 500, 1300, cz + 1500], fov: 35, near: 5, far: 20000 }}
      style={{ cursor: 'crosshair' }}
    >
      <color attach="background" args={[dark ? DARK.background : '#e7e3da']} />
      <hemisphereLight args={dark ? ['#ffffff', '#000000', 0.9] : ['#ffffff', '#cfc8bb', 1.6]} />
      <directionalLight position={[-600, 1200, 400]} intensity={dark ? 0.7 : 1.6} />
      <Ground city={city} color={dark ? DARK.ground : GROUND} onPick={onPick} />
      <Streets city={city} color={dark ? DARK.street : STREET} />
      <Buildings city={city} levels={reach?.buildingLevel} paint={paint} fade={fade} dark={dark} onPick={onPick} />
      {dark && <CityEdges city={city} />}
      {reach?.areas?.map((a, level) => (
        <ReachArea key={`${reach.id}-${level}`} polygons={a.polygons} level={level} />
      ))}
      {reach?.start && <StartMarker xy={reach.start} />}
      {walk?.strands?.length > 0 && <Footsteps strands={walk.strands} />}
      {walk?.traces?.length > 0 && <TraceHover traces={walk.traces} />}
      {shown && <Routes city={city} routes={shown} unknown={unknown} />}
      {walk?.routes?.notes && <RouteNotes notes={walk.routes.notes} />}
      {walk?.a && <WalkPin xy={walk.routes?.start ?? walk.a} label="A" />}
      {walk?.b && <WalkPin xy={walk.routes?.end ?? walk.b} label="B" />}
      {reach?.shops && <ShopPins city={city} shops={reach.shops} selected={selectedShop} onSelect={onSelectShop} />}
      <FrameWalk frame={frame} />
      <OrbitControls makeDefault target={[cx, 0, cz]} maxPolarAngle={Math.PI / 2.15} minDistance={60} maxDistance={6000} />
    </Canvas>
  )
}
