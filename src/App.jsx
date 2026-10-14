import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CityScene from './CityScene.jsx'
import { prepareCity } from './cityGeometry.js'
import { USE_COLORS, REACH_COLORS, SHOP } from './palette.js'

const FILES = { kit: 'kit.json', buildings: 'buildings.geojson', graph: 'streets.graph.json', zensus: 'zensus.geojson' }

const ATTRIBUTION =
  'Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).'

const fmt = (n) => n.toLocaleString('en-GB')

// Load every data file through BASE_URL, so it works on localhost and on GitHub Pages.
async function loadFiles() {
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([key, name]) => {
      const r = await fetch(`${import.meta.env.BASE_URL}data/${name}`)
      if (!r.ok) throw new Error(`data/${name}: ${r.status}`)
      return [key, await r.json()]
    }),
  )
  return Object.fromEntries(entries)
}

export default function App() {
  const [files, setFiles] = useState(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reach, setReach] = useState(null)
  const [selectedShop, setSelectedShop] = useState(null)
  const worker = useRef(null)
  const lastId = useRef(0)

  useEffect(() => {
    loadFiles().then(setFiles).catch((e) => setError(e.message))
  }, [])

  const city = useMemo(() => files && prepareCity(files), [files])

  useEffect(() => {
    if (!files) return
    const w = new Worker(new URL('./reach.worker.js', import.meta.url), { type: 'module' })
    w.onmessage = ({ data: msg }) => {
      if (msg.type === 'ready') setReady(true)
      // Only show the answer to the latest click.
      if (msg.type === 'result' && msg.id === lastId.current) {
        setReach({ id: msg.id, ...msg.result })
        setSelectedShop(null)
        setBusy(false)
      }
    }
    w.postMessage({ type: 'init', files })
    worker.current = w
    return () => w.terminate()
  }, [files])

  const pick = useCallback(
    (xy) => {
      if (!ready) return
      lastId.current += 1
      setBusy(true)
      worker.current.postMessage({ type: 'reach', id: lastId.current, xy })
    },
    [ready],
  )

  return (
    <div className="app">
      {city ? (
        <CityScene
          city={city}
          reach={reach?.areas ? reach : null}
          onPick={pick}
          selectedShop={selectedShop}
          onSelectShop={setSelectedShop}
        />
      ) : (
        <div className="loading">{error ? `The city kit didn't load (${error}).` : 'Loading the city…'}</div>
      )}

      <aside className="panel">
        <h1>How far can you walk?</h1>
        <Status ready={ready} busy={busy} reach={reach} />
        {reach?.areas && (
          <table>
            <thead>
              <tr>
                <th>Walk</th>
                <th>Buildings</th>
                <th>Residents</th>
              </tr>
            </thead>
            <tbody>
              {reach.areas.map((a, i) => (
                <tr key={a.minutes}>
                  <td>
                    <span className="swatch" style={{ background: REACH_COLORS[i] }} />
                    {a.minutes} min
                  </td>
                  <td className="num">{fmt(a.buildings)}</td>
                  <td className="num">
                    about {fmt(a.residents)}
                    {a.unknownCells > 0 && (
                      <div className="unknown">
                        + {a.unknownCells} {a.unknownCells === 1 ? 'cell' : 'cells'} without a figure
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {reach?.shops && <ShopList shops={reach.shops} selected={selectedShop} onSelect={setSelectedShop} />}
        <div className="method">
          <p>
            Walking speed is 4.8 km/h, which is 80 m per minute, along the pedestrian network from the street node
            nearest to your click. Each area is the streets reached in that time, including part of the last street,
            with a band of 25 m on each side, joined into one shape. A building counts if it touches the area. The
            counts for 10 and 15 minutes include the shorter walks.
          </p>
          <p>
            Residents come from the 100 m cells of the Zensus 2022. For every cell that overlaps the area, we take its
            population times the share of the cell's area that lies inside, add these up and round to the nearest 10.
            Cells where the census published no figure are left out of the sum and counted separately.
          </p>
          <p>
            Shops: the data has no individual shops, only floor area per use for each building. The list shows every
            building with some retail floor area that the 5-minute area touches. Its walk is measured along the
            network to the nearest point of the street closest to the building.
          </p>
        </div>
      </aside>

      <aside className="legend">
        <h2>Main use of building</h2>
        <ul>
          {USE_COLORS.map(([key, label, color]) => (
            <li key={key}>
              <span className="swatch" style={{ background: color }} />
              {label}
            </li>
          ))}
        </ul>
      </aside>

      <footer className="attribution">{ATTRIBUTION}</footer>
    </div>
  )
}

function Status({ ready, busy, reach }) {
  let text
  if (!ready) text = 'Preparing the street network…'
  else if (busy) text = 'Walking…'
  else if (reach?.error === 'tooFar')
    text = 'No walkable street within 100 m of that point. Try clicking closer to a street.'
  else if (reach?.error) text = `Something went wrong: ${reach.message}`
  else if (reach) text = `Starting from the street node ${Math.round(reach.snapDistance)} m from your click.`
  else text = 'Click on the ground to see how far you can walk in 5, 10 and 15 minutes. Drag to orbit, right-drag to pan, scroll to zoom.'
  return <p className={`status${reach?.error && !busy ? ' warn' : ''}`}>{text}</p>
}

const USE_LABEL = Object.fromEntries(USE_COLORS.map(([key, label]) => [key, label]))

// Buildings with retail space within 5 minutes. Hovering or clicking a row marks its pin on the map.
function ShopList({ shops, selected, onSelect }) {
  const rows = useRef(new Map())
  useEffect(() => {
    rows.current.get(selected)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])
  return (
    <section className="shops">
      <h2>
        <span className="swatch" style={{ background: SHOP }} />
        Shops within 5 minutes
      </h2>
      {shops.length === 0 ? (
        <p className="empty">No building with retail space in the 5-minute area.</p>
      ) : (
        <>
          <p className="hint">
            {shops.length} {shops.length === 1 ? 'building has' : 'buildings have'} retail space, largest first.
          </p>
          <ol>
            {shops.map((shop) => (
              <li
                key={shop.index}
                ref={(el) => (el ? rows.current.set(shop.index, el) : rows.current.delete(shop.index))}
                className={shop.index === selected ? 'selected' : ''}
                onMouseEnter={() => onSelect(shop.index)}
                onClick={() => onSelect(shop.index)}
              >
                <div>
                  <strong>{fmt(Math.round(shop.retail))} m² retail</strong>
                  <div className="sub">
                    building {shop.id} · {shop.floors} {shop.floors === 1 ? 'floor' : 'floors'} · mainly{' '}
                    {USE_LABEL[shop.use] ?? shop.use}
                  </div>
                </div>
                <div className="walk">
                  ≈ {Math.max(1, Math.round(shop.walk / 80))} min
                  <div className="sub">{fmt(Math.round(shop.walk / 10) * 10)} m</div>
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
