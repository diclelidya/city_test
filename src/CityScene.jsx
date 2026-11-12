// The 3D city, drawn dark and in lines: ground, streets, buildings, and the routes from A to B, with the
// misrouted walk as its one bright thing.
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Line, Html } from '@react-three/drei'
import { buildingsGeometry, paintBuildings, streetsGeometry, outlineGeometry, footsteps } from './cityGeometry.js'
import {
  ROUTE_COLORS,
  WALK_CORE,
  WALK_EDGES,
  DARK,
  readColor,
  readOpacity,
  READ_UNKNOWN_EDGE,
  WALK_OPACITY,
} from './palette.js'
import { extraMinutes } from './extraMinutes.js'

// A click that ends a drag (orbiting or panning) is not a pick.
const isDrag = (e) => e.delta > 4

// `paint`, when given, is a colour for every building; without it, every building is the dark fill.
// `fade`, when given, is an opacity for every building: a first, invisible pass then writes only their depth, so only the nearest wall of each building is blended over what lies
// behind: this avoids the flickering of overlapping see-through walls. Buildings fainter than 40 % skip
// that pass, so the buildings behind them still show through.
function Buildings({ city, paint, fade, onPick }) {
  const invalidate = useThree((s) => s.invalidate)
  const merged = useMemo(() => buildingsGeometry(city.buildings), [city])
  const ghost = !!fade
  useEffect(() => () => merged.geometry.dispose(), [merged])
  useEffect(() => {
    paintBuildings(merged, (i) => (paint ? paint[i] : DARK.fill), ghost ? (i) => fade[i] : null)
    invalidate()
  }, [merged, paint, fade, ghost, invalidate])

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

// A and B as round blue pins with the letter inside, standing on their point. They
// are page elements, so buildings never cover them. Their shift goes in `style`: the 3D label library
// sets the transform there and would override one from the stylesheet. `place`, when given, is a small
// faint place name left of the pin.
const PIN_STYLE = { pointerEvents: 'none', transform: 'translate(-50%, -100%)' }
function WalkPin({ xy, label, place }) {
  return (
    <Html position={[xy[0], 0, -xy[1]]} className="walk-pin" zIndexRange={[6, 0]} style={PIN_STYLE}>
      {place && <span className="pin-place">{place}</span>}
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
// right of its pin. A label that would run off the right edge of the screen sits left of its point
// instead (`flip`), with its dot and leader on its right; it moves back when there is room again.
const LABEL_STYLE = { pointerEvents: 'none', transform: 'translate(-3px, -50%)' }
const LABEL_FLIP_STYLE = { pointerEvents: 'none', transform: 'translate(calc(-100% + 3px), -50%)' }
const LABEL_AT_B_STYLE = { pointerEvents: 'none', transform: 'translate(18px, -100%)' }
const LABEL_AT_B_FLIP_STYLE = { pointerEvents: 'none', transform: 'translate(calc(-100% - 18px), -100%)' }
const EDGE_PX = 8

// What straying costs, as the label at B says it: the minutes come from the same function as the panel card.
function minutesMore(routes) {
  const n = extraMinutes(routes)
  return n === 0 ? 'under a minute more' : n === 1 ? '1 minute more' : `${n} minutes more`
}

function RouteNotes({ notes, routes, place }) {
  const { camera, size, invalidate } = useThree()
  const refs = useRef([])
  const [flipped, setFlipped] = useState({})
  const key = (n, i) => `${i}-${n.text}`
  // Measure each label on every rendered frame: where would its right edge be, unflipped?
  useFrame(() => {
    let changed = false
    const next = { ...flipped }
    notes.forEach((n, i) => {
      const el = refs.current[i]
      if (!el || !el.offsetWidth) return
      camera.updateMatrixWorld()
      v.set(n.xy[0], 4, -n.xy[1]).project(camera)
      const x = ((v.x + 1) / 2) * size.width
      const right = x + (n.atB ? 18 : -3) + el.offsetWidth
      const flip = right > size.width - EDGE_PX
      if (!!next[key(n, i)] !== flip) {
        next[key(n, i)] = flip
        changed = true
      }
    })
    if (changed) setFlipped(next)
  })
  // The label text is drawn a moment after the label appears: render once more to measure it. After the
  // window is resized, render once more too, so a label cut at the new right edge flips at once.
  useEffect(() => {
    const id = requestAnimationFrame(() => invalidate())
    return () => cancelAnimationFrame(id)
  }, [notes, routes, place, invalidate, size.width, size.height])
  const { misrouted } = routes
  return notes.map((n, i) => {
    const flip = !!flipped[key(n, i)]
    const atB = n.atB && !misrouted.sameAsShortest
    return (
      <Html
        key={key(n, i)}
        ref={(el) => (refs.current[i] = el)}
        position={[n.xy[0], 4, -n.xy[1]]}
        className={`route-label ${n.tone}${n.atB ? ' at-b' : ''}${flip ? ' flip' : ''}`}
        calculatePosition={notePosition}
        zIndexRange={[5, 0]}
        style={n.atB ? (flip ? LABEL_AT_B_FLIP_STYLE : LABEL_AT_B_STYLE) : flip ? LABEL_FLIP_STYLE : LABEL_STYLE}
      >
        {!n.atB && <span className="label-dot" />}
        {!n.atB && <span className="label-leader" />}
        <span className="label-text">
          {n.atB && place && <span className="label-place">{place}</span>}
          {atB ? minutesMore(routes) : n.text}
          {atB && misrouted.distance != null && (
            <span className="label-sub small">{Math.round(misrouted.distance * 100)} % from yourself</span>
          )}
          {n.sub && <span className="label-sub">{n.sub}</span>}
        </span>
      </Html>
    )
  })
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

// Once A and B are set, the camera glides in about a second to frame the whole walk, keeping its angle.
// It frames the walk in the free part of the screen: right of the panel, below the legend and above the
// attribution line, with room for the pins, the label at B and the place names. Orbiting or zooming
// stops the glide.
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

// The part of the canvas not covered by the panel, the legend or the attribution line, in canvas pixels,
// measured on the page. Without room to frame in (a narrow window), the whole canvas.
function freeArea(canvas, size) {
  const box = canvas.getBoundingClientRect()
  const rect = (selector) => {
    const el = document.querySelector(selector)
    if (!el || getComputedStyle(el).display === 'none') return null
    const r = el.getBoundingClientRect()
    return r.width && r.height ? r : null
  }
  const panel = rect('.panel')
  const legend = rect('.legend')
  const attribution = rect('.attribution')
  const whole = { left: 16, top: 16, right: size.width - 16, bottom: size.height - 16 }
  const area = {
    left: panel ? panel.right - box.left + 16 : whole.left,
    top: legend ? legend.bottom - box.top + 8 : whole.top,
    right: whole.right,
    bottom: attribution ? attribution.top - box.top - 8 : whole.bottom,
  }
  return area.right - area.left < 200 || area.bottom - area.top < 150 ? whole : area
}

// Room on screen around A and B, in pixels left, up, right and down of their point: the pins, the place
// name left of A, and the label at B (with its place name) right of and above B.
const ROOM_A = [12, 45, 12, 0]
const ROOM_A_PLACE = [160, 45, 12, 0]
const ROOM_B = [12, 60, 200, 0]

function FrameWalk({ frame }) {
  const { camera, controls, invalidate, size, gl } = useThree()
  useEffect(() => {
    if (!frame || !controls) return
    const [x0, y0, x1, y1] = frame.box
    const area = freeArea(gl.domElement, size)
    const tan = Math.tan((camera.fov * Math.PI) / 360)
    const direction = camera.position.clone().sub(controls.target).normalize()
    const screenRight = new THREE.Vector3().crossVectors(camera.up, direction).normalize()
    const forward = new THREE.Vector3(-direction.x, 0, -direction.z).normalize()
    const lift = THREE.MathUtils.clamp(direction.y, 0.2, 1)
    // What must lie in the free area: the corners of the walk's box, and A and B with their room.
    const ground = (xy) => new THREE.Vector3(xy[0], 0, -xy[1])
    const items = [
      ...[[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map((xy) => ({ p: ground(xy), room: [0, 0, 0, 0] })),
      { p: ground(frame.a), room: frame.placeA ? ROOM_A_PLACE : ROOM_A },
      { p: ground(frame.b), room: ROOM_B },
    ]
    // A trial camera at the end position: where would everything land on screen?
    const trial = camera.clone()
    trial.aspect = size.width / size.height
    trial.updateProjectionMatrix()
    const measure = (target, distance) => {
      trial.position.copy(target).addScaledVector(direction, distance)
      trial.lookAt(target)
      trial.updateMatrixWorld()
      const walk = [Infinity, Infinity, -Infinity, -Infinity]
      const all = [Infinity, Infinity, -Infinity, -Infinity]
      for (const { p, room } of items) {
        v.copy(p).project(trial)
        const sx = ((v.x + 1) / 2) * size.width
        const sy = ((1 - v.y) / 2) * size.height
        walk[0] = Math.min(walk[0], sx)
        walk[1] = Math.min(walk[1], sy)
        walk[2] = Math.max(walk[2], sx)
        walk[3] = Math.max(walk[3], sy)
        all[0] = Math.min(all[0], sx - room[0])
        all[1] = Math.min(all[1], sy - room[1])
        all[2] = Math.max(all[2], sx + room[2])
        all[3] = Math.max(all[3], sy + room[3])
      }
      return { walk, all }
    }
    // A first guess from the walk's size, then three passes: zoom until the walk and its room fit the free
    // area (the room is in pixels, so it does not shrink with distance), then move the view so they sit
    // in its middle.
    const areaW = area.right - area.left
    const areaH = area.bottom - area.top
    const clamp = (d) => THREE.MathUtils.clamp(d, controls.minDistance, controls.maxDistance)
    const radius = Math.hypot(x1 - x0, y1 - y0) * 0.6 + 80
    let distance = clamp(radius / (tan * Math.min(1, areaW / areaH)))
    const target = new THREE.Vector3((x0 + x1) / 2, 0, -(y0 + y1) / 2)
    for (let pass = 0; pass < 3; pass++) {
      const { walk, all } = measure(target, distance)
      const walkW = walk[2] - walk[0]
      const walkH = walk[3] - walk[1]
      const fitW = Math.max(areaW * 0.3, (areaW - (all[2] - all[0] - walkW)) * 0.96)
      const fitH = Math.max(areaH * 0.3, (areaH - (all[3] - all[1] - walkH)) * 0.96)
      distance = clamp(distance * Math.max(walkW / fitW, walkH / fitH, 0.05))
      const placed = measure(target, distance).all
      const perPx = (2 * distance * tan) / size.height
      const dx = (area.left + area.right) / 2 - (placed[0] + placed[2]) / 2
      const dy = (area.top + area.bottom) / 2 - (placed[1] + placed[3]) / 2
      target.addScaledVector(screenRight, -dx * perPx).addScaledVector(forward, (dy * perPx) / lift)
    }
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

export default function CityScene({ city, walk, places, onPick }) {
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
    return {
      id: `${start}|${end}`,
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      a: start,
      b: end,
      placeA: !!places?.a,
    }
  }, [shown, start, end]) // eslint-disable-line react-hooks/exhaustive-deps
  const cx = (x0 + x1) / 2
  const cz = -(y0 + y1) / 2
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      camera={{ position: [cx + 500, 1300, cz + 1500], fov: 35, near: 5, far: 20000 }}
      style={{ cursor: 'crosshair' }}
    >
      <color attach="background" args={[DARK.background]} />
      <hemisphereLight args={['#ffffff', '#000000', 0.9]} />
      <directionalLight position={[-600, 1200, 400]} intensity={0.7} />
      <Ground city={city} color={DARK.ground} onPick={onPick} />
      <Streets city={city} color={DARK.street} />
      <Buildings city={city} paint={paint} fade={fade} onPick={onPick} />
      <CityEdges city={city} />
      {walk?.strands?.length > 0 && <Footsteps strands={walk.strands} />}
      {walk?.traces?.length > 0 && <TraceHover traces={walk.traces} />}
      {shown && <Routes city={city} routes={shown} unknown={unknown} />}
      {walk?.routes?.notes && <RouteNotes notes={walk.routes.notes} routes={shown} place={places?.b} />}
      {walk?.a && <WalkPin xy={walk.routes?.start ?? walk.a} label="A" place={places?.a} />}
      {walk?.b && <WalkPin xy={walk.routes?.end ?? walk.b} label="B" />}
      <FrameWalk frame={frame} />
      <OrbitControls makeDefault target={[cx, 0, cz]} maxPolarAngle={Math.PI / 2.15} minDistance={60} maxDistance={6000} />
    </Canvas>
  )
}
