// The 3D city: ground, streets, buildings and the three reach areas.
import { useEffect, useMemo } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { buildingsGeometry, paintBuildings, streetsGeometry, areaGeometry } from './cityGeometry.js'
import { useColor, REACH_COLORS, AREA_TINTS, GROUND, STREET, SHOP, SHOP_SELECTED } from './palette.js'

// A click that ends a drag (orbiting or panning) is not a pick.
const isDrag = (e) => e.delta > 4

function Buildings({ city, levels, onPick }) {
  const invalidate = useThree((s) => s.invalidate)
  const merged = useMemo(() => buildingsGeometry(city.buildings), [city])
  useEffect(() => () => merged.geometry.dispose(), [merged])
  useEffect(() => {
    paintBuildings(merged, (i) =>
      levels && levels[i] >= 0 ? REACH_COLORS[levels[i]] : useColor[city.buildings[i].use] ?? useColor.undefined,
    )
    invalidate()
  }, [merged, levels, city, invalidate])

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

export default function CityScene({ city, reach, onPick, selectedShop, onSelectShop }) {
  const { x0, y0, x1, y1 } = city.bounds
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
      <Buildings city={city} levels={reach?.buildingLevel} onPick={onPick} />
      {reach?.areas?.map((a, level) => (
        <ReachArea key={`${reach.id}-${level}`} polygons={a.polygons} level={level} />
      ))}
      {reach?.start && <StartMarker xy={reach.start} />}
      {reach?.shops && <ShopPins city={city} shops={reach.shops} selected={selectedShop} onSelect={onSelectShop} />}
      <OrbitControls makeDefault target={[cx, 0, cz]} maxPolarAngle={Math.PI / 2.15} minDistance={60} maxDistance={6000} />
    </Canvas>
  )
}
