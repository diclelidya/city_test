import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CityScene from './CityScene.jsx'
import { prepareCity } from './cityGeometry.js'
import { USE_COLORS, REACH_COLORS, SHOP, ROUTE_COLORS, WALK_TINTS, WALK_PALE } from './palette.js'
import { PROFILES } from './misroute.js'

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
  const [mode, setMode] = useState('reach')
  // The second mode: start A, destination B, and the routes between them.
  const [walk, setWalk] = useState({ a: null, b: null, result: null })
  const [time, setTime] = useState({ day: 'weekday', hour: 12 })
  // "Play the day": all 24 hours of the current walk, which hours have been played, and where playback is.
  const [play, setPlay] = useState(null)
  const worker = useRef(null)
  const lastId = useRef(0)
  const lastKind = useRef('reach')

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
        if (lastKind.current === 'reach') {
          setReach({ id: msg.id, ...msg.result })
          setSelectedShop(null)
        } else if (lastKind.current === 'misrouteDay') {
          // All 24 hours are ready: start playing them.
          if (msg.result.error) setPlay(null)
          else setPlay((p) => p && { ...p, status: 'playing', results: msg.result.map((r, h) => ({ id: `${msg.id}-${h}`, ...r })) })
        } else setWalk((w) => ({ ...w, result: { id: msg.id, ...msg.result } }))
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
      if (mode === 'reach') {
        lastId.current += 1
        lastKind.current = 'reach'
        setBusy(true)
        worker.current.postMessage({ type: 'reach', id: lastId.current, xy })
        return
      }
      // First click: A. Second click: B, then the routes. A third click starts over.
      setPlay(null) // a new A or B clears the day and its traces
      if (!walk.a || walk.b) {
        lastId.current += 1 // forget any answer still on its way
        setBusy(false)
        setWalk({ a: xy, b: null, result: null })
        return
      }
      setWalk({ ...walk, b: xy })
      requestWalk(walk.a, xy, time)
    },
    [ready, mode, walk, time],
  )

  const requestWalk = (a, b, t) => {
    lastId.current += 1
    lastKind.current = 'misroute'
    setBusy(true)
    worker.current.postMessage({ type: 'misroute', id: lastId.current, a, b, time: t })
  }

  // A new time reads the same walk again. Moving the slider pauses playback; within a day already
  // computed the hour is taken from it. A new weekday or weekend clears the day and its traces.
  const changeTime = (t) => {
    setTime(t)
    if (play?.results && t.day === play.day) {
      setPlay({ ...play, status: play.status === 'playing' ? 'paused' : play.status })
      setWalk((w) => ({ ...w, result: play.results[t.hour] }))
      return
    }
    setPlay(null)
    if (walk.a && walk.b) requestWalk(walk.a, walk.b, t)
  }

  const playDay = () => {
    if (play?.status === 'playing') return setPlay({ ...play, status: 'paused' })
    if (play?.status === 'paused') return setPlay({ ...play, status: 'playing' })
    if (play?.status === 'done') return setPlay({ ...play, status: 'playing', next: 0, played: [], savedHour: time.hour })
    // First compute all 24 hours in the background, then play them.
    lastId.current += 1
    lastKind.current = 'misrouteDay'
    setBusy(false)
    setPlay({ status: 'preparing', day: time.day, next: 0, played: [], savedHour: time.hour, results: null })
    worker.current.postMessage({ type: 'misrouteDay', id: lastId.current, a: walk.a, b: walk.b, day: time.day })
  }

  // One hour per second. After hour 23, go back to the hour that was set before playing.
  useEffect(() => {
    if (play?.status !== 'playing') return
    const timer = setTimeout(
      () => {
        const h = play.next
        if (h > 23) {
          setTime((t) => ({ ...t, hour: play.savedHour }))
          setWalk((w) => ({ ...w, result: play.results[play.savedHour] }))
          setPlay({ ...play, status: 'done' })
          return
        }
        setTime((t) => ({ ...t, hour: h }))
        setWalk((w) => ({ ...w, result: play.results[h] }))
        setPlay({ ...play, next: h + 1, played: [...play.played, h] })
      },
      play.played.length ? 1000 : 0,
    )
    return () => clearTimeout(timer)
  }, [play])

  // The misrouted walks of the hours played, one trace per distinct way, with the hours that share it.
  const traces = useMemo(() => {
    if (!play?.results) return []
    const byKey = new Map()
    for (const h of play.played) {
      const m = play.results[h].routes.misrouted
      if (m.sameAsShortest) continue
      if (!byKey.has(m.key)) byKey.set(m.key, { key: m.key, line: m.line, hours: [] })
      byKey.get(m.key).hours.push(h)
    }
    return [...byKey.values()].map((t) => ({ ...t, label: hourRanges(t.hours) }))
  }, [play])

  const switchMode = (m) => {
    if (m === mode) return
    lastId.current += 1 // an answer for the other mode is no longer wanted
    setBusy(false)
    if (play?.status === 'preparing') setPlay(null)
    else if (play?.status === 'playing') setPlay({ ...play, status: 'paused' })
    setMode(m)
  }

  const routes = walk.result?.routes ? walk.result : null

  return (
    <div className="app">
      {city ? (
        <CityScene
          city={city}
          reach={mode === 'reach' && reach?.areas ? reach : null}
          walk={mode === 'misroute' ? { a: walk.a, b: walk.b, routes, traces } : null}
          onPick={pick}
          selectedShop={selectedShop}
          onSelectShop={setSelectedShop}
        />
      ) : (
        <div className="loading">{error ? `The city kit didn't load (${error}).` : 'Loading the city…'}</div>
      )}

      <aside className="panel">
        <div className="modes" role="tablist">
          <button role="tab" aria-selected={mode === 'reach'} className={mode === 'reach' ? 'on' : ''} onClick={() => switchMode('reach')}>
            Walking reach
          </button>
          <button role="tab" aria-selected={mode === 'misroute'} className={mode === 'misroute' ? 'on' : ''} onClick={() => switchMode('misroute')}>
            Walk from yourself
          </button>
        </div>
        {mode === 'misroute' ? (
          <MisroutePanel
            ready={ready}
            busy={busy}
            walk={walk}
            time={time}
            onTime={changeTime}
            play={play}
            traces={traces}
            onPlay={playDay}
          />
        ) : (
          <>
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
          </>
        )}
      </aside>

      <aside className="legend">
        {mode === 'misroute' && routes ? (
          <>
            <h2>Buildings within 25 m of</h2>
            <ul>
              {[
                [WALK_TINTS.expected, 'the expected route'],
                [WALK_TINTS.misrouted, 'the misrouted walk'],
                [WALK_TINTS.both, 'both'],
                [WALK_PALE, 'neither'],
              ].map(([color, label]) => (
                <li key={label}>
                  <span className="swatch" style={{ background: color }} />
                  {label}
                </li>
              ))}
            </ul>
            {traces.length > 0 && (
              <ul className="legend-lines">
                <li>
                  <span className="line-swatch dotted" style={{ '--c': ROUTE_COLORS.misrouted }} />
                  Misrouted walks at other hours
                </li>
              </ul>
            )}
          </>
        ) : (
          <>
            <h2>Main use of building</h2>
            <ul>
              {USE_COLORS.map(([key, label, color]) => (
                <li key={key}>
                  <span className="swatch" style={{ background: color }} />
                  {label}
                </li>
              ))}
            </ul>
          </>
        )}
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

const ROUTES = [
  ['shortest', 'Shortest route', 'the shortest way along the network'],
  ['expected', 'Expected route', 'along streets the profile is drawn to'],
  ['misrouted', 'Misrouted walk', 'along streets the profile is least drawn to'],
]
const pct = (v) => `${Math.round(v * 100)} %`

// "How far can you walk from yourself?": the profile the city reads, and three routes from A to B.
function MisroutePanel({ ready, busy, walk, time, onTime, play, traces, onPlay }) {
  const r = walk.result
  const show = r?.routes && !busy
  let text
  if (!ready) text = 'Preparing the street network…'
  else if (busy) text = 'Reading the walk…'
  else if (!walk.a) text = 'Click on the ground to set the start (A).'
  else if (!walk.b) text = 'Now click to set the destination (B).'
  else if (r?.error === 'tooFar')
    text = `No walkable street within 100 m of ${r.which}. Click again to start over, closer to a street.`
  else if (r?.error === 'same') text = 'A and B snap to the same street node. Click again to start over.'
  else if (r?.error) text = `Something went wrong: ${r.message}`
  else text = `A and B snapped to the street nodes ${Math.round(r.snapA)} m and ${Math.round(r.snapB)} m from your clicks. Click again to start over.`

  const top = show && [...PROFILES].sort((x, y) => r.mix[y[0]] - r.mix[x[0]])[0]
  return (
    <>
      <h1>How far can you walk from yourself?</h1>
      <p className={`status${r?.error && !busy ? ' warn' : ''}`}>{text}</p>
      <TimeControl time={time} onTime={onTime} play={play} canPlay={!!r?.routes && !busy} onPlay={onPlay} />
      {play?.status === 'done' && <DaySummary play={play} traces={traces} />}
      {show && (
        <>
          <section className="reading">
            <h2>
              The city reads this walk as {article(top[1])} {top[1]} ({pct(r.mix[top[0]])}) {TRIP[r.purpose]}
            </h2>
            <ul className="bars">
              {PROFILES.map(([key, label]) => (
                <li key={key}>
                  <span className="bar-label">{label}</span>
                  <span className="bar">
                    <span style={{ width: `${r.mix[key] * 100}%` }} />
                  </span>
                  <span className="num">{pct(r.mix[key])}</span>
                </li>
              ))}
            </ul>
            <p className="sub">
              Purpose: {r.purpose}.{r.atEdge && ' A lies near the edge of the kit, which leans a little towards commuter.'}{' '}
              {r.timeRules.length
                ? `Time: ${r.timeRules.map((t) => `${t.label}, ${shiftText(t.shift)}`).join('; ')}.`
                : 'Time: no shift at this hour.'}
            </p>
          </section>
          <ol className="routes">
            {ROUTES.map(([key, name, how]) => {
              const route = r.routes[key]
              return (
                <li key={key}>
                  <div className="route-head">
                    <span className={`line-swatch ${key}`} style={{ '--c': ROUTE_COLORS[key] }} />
                    <strong>{name}</strong>
                    <span className="distance">
                      {route.sameAsShortest ? (
                        <span className="sub">same as the shortest route</span>
                      ) : (
                        <>
                          {route.distance == null ? 'no reading' : pct(route.distance)}
                          <span className="sub"> from yourself</span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="sub">
                    {fmt(Math.round(route.length / 10) * 10)} m · {Math.max(1, Math.round(route.minutes))} min · {how}
                  </div>
                  {key !== 'shortest' && !route.sameAsShortest && (
                    <div className="sub">measured on the {fmt(Math.round(route.measured / 10) * 10)} m that leave the shortest route</div>
                  )}
                  {!route.sameAsShortest && (
                    <div className="sub">
                      passes mainly{' '}
                      {route.mainUses.length
                        ? route.mainUses.map((u) => `${USE_LABEL[u.use] ?? u.use} ${pct(u.share)}`).join(', ')
                        : 'no buildings with a known use'}
                      {route.unknownShare > 0 && ` · use not known for ${pct(route.unknownShare)} of the floor area`}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
          {r.routes.expected.sameAsShortest && r.routes.misrouted.sameAsShortest && (
            <p className="sub warn">Walk further to stray: try two points at least 500 m apart.</p>
          )}
          {r.fellBack ? (
            <p className="sub warn">
              Every misrouting was more than twice as long as the shortest route, so the misrouted walk is the shortest
              route here.
            </p>
          ) : (
            r.strength < 3 && (
              <p className="sub">The misrouting was softened to stay within twice the shortest route.</p>
            )
          )}
        </>
      )}
      <div className="method">
        <p>
          <strong>How the profile is guessed.</strong> The app looks at the floor area per use of the buildings within
          100 m of A, and at the census cell of A (average age, rent). Flats point to local residents, and to older
          residents where the average age is high; education, a young average age and low rent point to students;
          accommodation, culture and entertainment to visitors; offices and transport to commuters, and a little the
          edge of the kit, as a rough stand-in for arriving from outside. Every profile starts with the same small base.
          B then moves the guess as far as it is telling: education strongly towards students, accommodation and culture
          towards visitors, offices towards commuters, health a little towards older residents. Shops and food barely
          move it, because everyone goes there.
        </p>
        <p>
          <strong>The time of the walk</strong> tilts the guess: each share is multiplied, then all are scaled back to
          100 %. Weekday mornings (6–9): students and commuters ×1.5. Weekday office hours (9–17): commuters ×1.5, older
          residents ×1.25. Weekday evenings (17–22): visitors and students ×1.5. Weekend daytime (10–18): visitors
          ×1.75. Weekend evenings (18–22): visitors and students ×1.5. All weekend: commuters ×0.5. Late night (22–6):
          students ×2, older residents ×0.5. Local residents are never shifted.
        </p>
        <p>
          <strong>It is a guess, not a fact about anyone.</strong> It shows how a city that sorts people by where they
          come from and where they go would read this walk. The weights and affinities are assumptions written into the
          app, not data. The misrouted walk is chosen by the app too, not by the walker.
        </p>
        <p>
          <strong>Distance from yourself.</strong> Each profile has an affinity from 0 to 1 for each building use; the
          mix uses the share-weighted average. For each route, the buildings within 25 m of it are weighted by floor
          area, and the distance is 1 minus their average affinity. For the expected route and the misrouted walk, only
          the streets that leave the shortest route are measured, so the stretches they share don't flatten the
          numbers; the shortest route is measured whole. The expected route prefers streets that rank high
          for the mix, the misrouted walk streets that rank low. The misrouted walk also counts the streets of the
          shortest and expected routes twice, so it leaves them where it can, and stays within twice the shortest route. Floor area
          of unknown use is left out, and streets without buildings count as neutral. Most streets here are lined with
          mixed uses, so the routes often differ by only a few points, and for short walks often not at all.
        </p>
        <p>
          <strong>Play the day</strong> computes the walk for every hour from 0 to 23 on the chosen weekday or weekend,
          then plays one hour per second. Each misrouted walk leaves a faint pink trace; walks that use exactly the same
          streets share one trace, which gets stronger the more hours share it. A new A, B or day clears the traces.
        </p>
        <p>Walking time at 80 m per minute.</p>
      </div>
    </>
  )
}

const PROFILE_LABEL = Object.fromEntries(PROFILES)
const shiftText = (shift) => Object.entries(shift).map(([k, f]) => `${PROFILE_LABEL[k]} ×${f}`).join(', ')

// Weekday or weekend, and the hour of the walk.
function TimeControl({ time, onTime, play, canPlay, onPlay }) {
  const status = play?.status
  const label =
    status === 'preparing'
      ? 'Preparing the day…'
      : status === 'playing'
        ? '❚❚ Pause'
        : status === 'paused'
          ? '▶ Continue'
          : status === 'done'
            ? '▶ Play again'
            : '▶ Play the day'
  return (
    <div className="time">
      <div className="modes small">
        {['weekday', 'weekend'].map((d) => (
          <button key={d} className={time.day === d ? 'on' : ''} onClick={() => onTime({ ...time, day: d })}>
            {d === 'weekday' ? 'Weekday' : 'Weekend'}
          </button>
        ))}
      </div>
      <button className="play" disabled={!canPlay && !play?.results || status === 'preparing'} onClick={onPlay}>
        {label}
      </button>
      <label>
        <span>{String(time.hour).padStart(2, '0')}:00</span>
        <input
          type="range"
          min="0"
          max="23"
          step="1"
          value={time.hour}
          onChange={(e) => onTime({ ...time, hour: Number(e.target.value) })}
          aria-label="Hour of the walk"
        />
      </label>
    </div>
  )
}

// Hours as short ranges: [0, 1, 2, 5, 22, 23] -> "0–2, 5 and 22–23".
function hourRanges(hours) {
  const runs = []
  for (const h of [...hours].sort((a, b) => a - b)) {
    const last = runs[runs.length - 1]
    if (last && h === last[1] + 1) last[1] = h
    else runs.push([h, h])
  }
  const parts = runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
}

// After playing the day: how many different ways the walk strays, and at which hours.
function DaySummary({ play, traces }) {
  const ways = [...traces].sort((a, b) => b.hours.length - a.hours.length)
  const straying = new Set(ways.flatMap((w) => w.hours))
  const never = play.played.filter((h) => !straying.has(h))
  const dayName = play.day === 'weekday' ? 'weekday' : 'weekend day'
  let text
  if (!ways.length) text = `Across the ${dayName}, this walk never strays from the shortest route.`
  else if (ways.length === 1)
    text = `Across the ${dayName}, this walk strays in one way, at ${never.length ? `hours ${hourRanges(ways[0].hours)}` : 'every hour'}.`
  else
    text = `Across the ${dayName}, this walk strays in ${ways.length} different ways: ${ways
      .map((w) => `${hourRanges(w.hours)} (${w.hours.length} ${w.hours.length === 1 ? 'hour' : 'hours'})`)
      .join(' · ')}.`
  return (
    <p className="day-summary">
      {text}
      {ways.length > 0 && never.length > 0 && ` At ${hourRanges(never)} it does not stray from the shortest route.`}
      <span className="sub"> The stronger a trace on the map, the more hours share it.</span>
    </p>
  )
}

const TRIP = {
  shopping: 'on a shopping trip',
  work: 'on the way to work',
  study: 'on the way to study',
  culture: 'out for culture',
  health: 'on the way to a health visit',
  food: 'out to eat',
  'home or a visit': 'going home or visiting someone',
}

const article = (word) => (/^[aeiou]/.test(word) ? 'an' : 'a')
