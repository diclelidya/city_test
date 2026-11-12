import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import CityScene from './CityScene.jsx'
import { prepareCity } from './cityGeometry.js'
import { makeProjection } from './projection.js'
import { extraMinutes } from './extraMinutes.js'
import { loadTaken, saveTaken, clearTaken } from './takenWalks.js'
import {
  USE_LABELS,
  ROUTE_COLORS,
  WALK_EDGES,
  DARK,
  READ_FAR,
  READ_MID,
  READ_CLOSE,
  READ_UNKNOWN,
  READ_UNKNOWN_EDGE,
  READ_QUIET_OPACITY,
} from './palette.js'

// "Show how the city reads you": its checkbox can be hidden here.
const SHOW_READING_TOGGLE = true
import { PROFILES } from './misroute.js'

const FILES = { kit: 'kit.json', buildings: 'buildings.geojson', graph: 'streets.graph.json', zensus: 'zensus.geojson' }

const ATTRIBUTION =
  'Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).'

// The manifesto under the title, one paragraph per line. `light` lines are in the heading's tone.
const MANIFESTO = [
  { text: 'The city knows where you are going.' },
  { text: 'It reads you by where you start and where you end, and leads you along the streets expected of you.' },
  { text: 'Stray.', light: true, pause: true },
  { text: 'This app shows the walk expected of you, then hands you the one you would least take, hour by hour.' },
  {
    text: "The aim is not a better route: it is to make the city's quiet routing visible, and to measure how far you can stray from it.",
    light: true,
    aim: true,
  },
]

// The walk the app opens with: from the Bauhaus-Universität main building (A, longitude and latitude) to
// the street node about 90 m west of the Markt (B, in the app's metres), on a weekday at 12:00.
const EXAMPLE_A_LONLAT = [11.32935, 50.97445]
const EXAMPLE_B = [253, -314]
const EXAMPLE_TIME = { day: 'weekday', hour: 12 }
const EXAMPLE_PLACES = { a: 'Bauhaus-Universität', b: 'near the Markt' }
// The panel line names the time actually shown, so it stays true when the hour or day is changed.
const exampleText = (t) =>
  `Example: from the Bauhaus-Universität to near the Markt, ${t.day} ${String(t.hour).padStart(2, '0')}:00. Click the map to set your own A, then B.`

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
  // Start A, destination B, and the routes between them.
  const [walk, setWalk] = useState({ a: null, b: null, result: null })
  const [time, setTime] = useState({ day: 'weekday', hour: 12 })
  // "Play the day": all 24 hours of the current walk, which hours have been played, and where playback is.
  const [play, setPlay] = useState(null)
  // "Show how the city reads you": colour every building by its affinity for the current mix.
  const [reading, setReading] = useState(false)
  // "Remember earlier hours": while playing the day, each hour avoids the streets earlier hours strayed along.
  const [memory, setMemory] = useState(false)
  // The example walk is shown until the first click on the map.
  const [example, setExample] = useState(true)
  const exampleStarted = useRef(false)
  // "Take this walk": the walks taken between each A and B, kept only in this browser, and the shown
  // result that was just taken.
  const [taken, setTaken] = useState(loadTaken)
  const [takenId, setTakenId] = useState(null)
  const changeMemory = (m) => {
    setMemory(m)
    if (play) setPlay(null) // the played day was computed with the other setting
  }
  const worker = useRef(null)
  const lastId = useRef(0)
  const lastKind = useRef('misroute')

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
        if (lastKind.current === 'misrouteDay') {
          // All 24 hours are ready: start playing them.
          if (msg.result.error) setPlay(null)
          else
            setPlay(
              (p) =>
                p && {
                  ...p,
                  status: 'playing',
                  plainWays: msg.result.plainWays,
                  takenCount: msg.result.takenCount,
                  results: msg.result.hours.map((r, h) => ({
                    id: `${msg.id}-${h}`,
                    pair: msg.result.pair,
                    takenCount: msg.result.takenCount,
                    ...r,
                  })),
                },
            )
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
      setExample(false) // the first click removes the example walk
      // First click: A. Second click: B, then the routes. A third click starts over.
      setPlay(null) // a new A or B clears the day and its traces
      if (!walk.a || walk.b) {
        lastId.current += 1 // forget any answer still on its way
        setBusy(false)
        setWalk({ a: xy, b: null, result: null })
        return
      }
      setWalk({ ...walk, b: xy })
      requestWalk(walk.a, xy, time, taken)
    },
    [ready, walk, time, taken],
  )

  // `takenMap`: the taken walks to avoid, or null (the example walk never reads them).
  const requestWalk = (a, b, t, takenMap) => {
    lastId.current += 1
    lastKind.current = 'misroute'
    setBusy(true)
    worker.current.postMessage({ type: 'misroute', id: lastId.current, a, b, time: t, taken: takenMap })
  }

  // Show the example walk: weekday 12:00, A at the Bauhaus-Universität, B near the Markt.
  const showExample = () => {
    const a = makeProjection(files.kit.center)(EXAMPLE_A_LONLAT)
    setExample(true)
    setTime(EXAMPLE_TIME)
    setPlay(null)
    setWalk({ a, b: EXAMPLE_B, result: null })
    requestWalk(a, EXAMPLE_B, EXAMPLE_TIME, null)
  }

  // Once the street network is ready, open with the example walk (only once, and only if no walk is set).
  useEffect(() => {
    if (!ready || exampleStarted.current || walk.a) return
    exampleStarted.current = true
    showExample()
  }, [ready]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (walk.a && walk.b) requestWalk(walk.a, walk.b, t, example ? null : taken)
  }

  const playDay = () => {
    if (play?.status === 'playing') return setPlay({ ...play, status: 'paused' })
    if (play?.status === 'paused') return setPlay({ ...play, status: 'playing' })
    if (play?.status === 'done') return setPlay({ ...play, status: 'playing', next: 0, played: [], savedHour: time.hour })
    // First compute all 24 hours in the background, then play them.
    lastId.current += 1
    lastKind.current = 'misrouteDay'
    setBusy(false)
    setPlay({ status: 'preparing', day: time.day, memory, next: 0, played: [], savedHour: time.hour, results: null })
    worker.current.postMessage({
      type: 'misrouteDay',
      id: lastId.current,
      a: walk.a,
      b: walk.b,
      day: time.day,
      memory,
      taken: example ? null : taken,
    })
  }

  // "Take this walk": keep the streets of the misrouted walk on screen under this A and B, in this browser
  // only. The walk on screen stays; every later walk between them avoids its streets.
  const takeWalk = () => {
    const r = walk.result
    const next = { ...taken, [r.pair]: [...(taken[r.pair] ?? []), [...r.misPath]] }
    saveTaken(next)
    setTaken(next)
    setTakenId(r.id)
    if (play) setPlay(null) // the played day was computed without this walk
  }

  // "Forget my walks": clear every taken walk, and read the current walk again without them.
  const forgetWalks = () => {
    clearTaken()
    setTaken({})
    setTakenId(null)
    setPlay(null)
    if (walk.a && walk.b && !example) requestWalk(walk.a, walk.b, time, null)
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

  // The ways the played hours strayed (walks sharing at least 80 % of their length are one way), and
  // one trace per exact walk for pointing at on the map, labelled with the hours of its way.
  const [ways, traces] = useMemo(() => {
    if (!play?.results) return [[], []]
    const byWay = new Map()
    const byKey = new Map()
    for (const h of play.played) {
      const r = play.results[h]
      if (r.way == null) continue
      if (!byWay.has(r.way)) byWay.set(r.way, { way: r.way, hours: [] })
      byWay.get(r.way).hours.push(h)
      const m = r.routes.misrouted
      if (!byKey.has(m.key)) byKey.set(m.key, { key: m.key, line: m.line, way: r.way })
    }
    const label = (way) => hourRanges(byWay.get(way).hours)
    return [[...byWay.values()], [...byKey.values()].map((t) => ({ ...t, label: label(t.way) }))]
  }, [play])

  // The same walks as strands, one per hour played, for the footsteps on the map.
  const strands = useMemo(() => {
    if (!play?.results) return []
    return play.played
      .map((hour) => ({ hour, route: play.results[hour].routes.misrouted }))
      .filter(({ route }) => !route.sameAsShortest)
      .map(({ hour, route }) => ({ hour, line: route.line }))
  }, [play])

  // With no new way to stray, the map shows only the shortest and the expected route: no blue line, no
  // blue building edges and no label at B.
  const routes = useMemo(() => {
    const r = walk.result
    if (!r?.routes) return null
    if (!r.noNewWalk) return r
    const misrouted = { ...r.routes.misrouted, key: 'none', alongside: [], segments: [] }
    return { ...r, notes: r.notes.filter((n) => !n.atB), routes: { ...r.routes, misrouted } }
  }, [walk.result])

  return (
    <div className="app">
      {city ? (
        <CityScene
          city={city}
          walk={{ a: walk.a, b: walk.b, routes, traces, strands, reading }}
          places={example ? EXAMPLE_PLACES : null}
          onPick={pick}
        />
      ) : (
        <div className="loading">{error ? `The city kit didn't load (${error}).` : 'Loading the city…'}</div>
      )}

      <aside className="panel">
        <MisroutePanel
          ready={ready}
          busy={busy}
          walk={walk}
          time={time}
          onTime={changeTime}
          play={play}
          traces={traces}
          ways={ways}
          onPlay={playDay}
          memory={memory}
          onMemory={changeMemory}
          reading={reading}
          onReading={setReading}
          example={example}
          onExample={showExample}
          takenNow={!!walk.result && walk.result.id === takenId}
          anyTaken={Object.keys(taken).length > 0}
          onTake={takeWalk}
          onForget={forgetWalks}
        />
      </aside>

      <aside className="legend">
        <WalkLegend routes={routes} reading={reading} traces={traces} />
      </aside>

      <footer className="attribution">{ATTRIBUTION}</footer>
    </div>
  )
}

const ROUTES = [
  ['shortest', 'Shortest route', 'the shortest way along the network'],
  ['expected', 'Expected route', 'along streets the profile is drawn to'],
  ['misrouted', 'Misrouted walk', 'along streets the profile is least drawn to'],
]
const pct = (v) => `${Math.round(v * 100)} %`

// "How far can you walk from yourself?": the profile the city reads, and three routes from A to B.
function MisroutePanel({
  ready,
  busy,
  walk,
  time,
  onTime,
  play,
  traces,
  ways,
  onPlay,
  reading,
  onReading,
  memory,
  onMemory,
  example,
  onExample,
  takenNow,
  anyTaken,
  onTake,
  onForget,
}) {
  const r = walk.result
  const show = r?.routes && !busy
  let text
  if (!ready) text = 'Preparing the street network…'
  else if (busy) text = 'Reading the walk…'
  else if (!walk.a)
    text = 'Click twice on the map: first where you start (A), then where you go (B). Drag to orbit, right-drag to pan, scroll to zoom.'
  else if (!walk.b) text = 'Now click to set the destination (B).'
  else if (r?.error === 'tooFar')
    text = `No walkable street within 100 m of ${r.which}. Click again to start over, closer to a street.`
  else if (r?.error === 'same') text = 'A and B snap to the same street node. Click again to start over.'
  else if (r?.error) text = `Something went wrong: ${r.message}`
  else if (r?.noNewWalk)
    text = 'No new way to stray between these points within twice the shortest route. Forget my walks to start again.'
  else if (example) text = exampleText(time)
  else text = `A and B snapped to the street nodes ${Math.round(r.snapA)} m and ${Math.round(r.snapB)} m from your clicks. Click again to start over.`

  const top = show && [...PROFILES].sort((x, y) => r.mix[y[0]] - r.mix[x[0]])[0]
  return (
    <>
      <h1>How far can you walk from yourself?</h1>
      {MANIFESTO.map(({ text, light, pause, aim }) => (
        <p key={text} className={`intro${light ? ' light' : ''}${pause ? ' pause' : ''}${aim ? ' aim' : ''}`}>
          {text}
        </p>
      ))}
      {show && (
        <WalkStats routes={r.routes} noNewWalk={r.noNewWalk} firstDistance={r.firstDistance} takenCount={r.takenCount} />
      )}
      {show && !example && !r.routes.misrouted.sameAsShortest && !r.noNewWalk && (
        <button
          className="take-walk"
          disabled={takenNow || play?.status === 'preparing' || play?.status === 'playing'}
          onClick={onTake}
        >
          {takenNow ? 'Taken · kept only in this browser' : 'Take this walk'}
        </button>
      )}
      <p className={`status${r?.error && !busy ? ' warn' : ''}`}>{text}</p>
      {ready && !example && (
        <button className="example-link" onClick={onExample}>
          Show the example walk again
        </button>
      )}
      {anyTaken && (
        <p className="forget">
          <button className="example-link" onClick={onForget}>
            Forget my walks
          </button>
          <span className="sub"> Taken walks stay only in this browser and are never sent anywhere.</span>
        </p>
      )}
      <TimeControl
        time={time}
        onTime={onTime}
        play={play}
        canPlay={!!r?.routes && !busy}
        onPlay={onPlay}
        memory={memory}
        onMemory={onMemory}
      />
      {SHOW_READING_TOGGLE && (
        <label className={`reading-toggle${r?.routes ? '' : ' off'}`}>
          <input type="checkbox" checked={reading} disabled={!r?.routes} onChange={(e) => onReading(e.target.checked)} />
          Show how the city reads you
          {!r?.routes && <span className="sub"> · Set A and B first</span>}
        </label>
      )}
      {play?.status === 'done' && <DaySummary play={play} ways={ways} />}
      {show && (
        <>
          <section className="reading">
            <h2>
              The city reads this walk as {article(top[1])} {top[1]} ({pct(r.mix[top[0]])}) {TRIP[r.purpose]}
            </h2>
            <ul className="bars">
              <li className="bars-head">
                <span />
                <span />
                <span className="num">read</span>
                <span className="num sharp" title="The sharpened mix used for routing and the distance from yourself">
                  weighs
                </span>
              </li>
              {PROFILES.map(([key, label]) => (
                <li key={key}>
                  <span className="bar-label">{label}</span>
                  <span className="bar">
                    <span style={{ width: `${r.mix[key] * 100}%` }} />
                  </span>
                  <span className="num">{pct(r.mix[key])}</span>
                  <span className="num sharp">{pct(r.sharp[key])}</span>
                </li>
              ))}
            </ul>
            <p className="close-far">
              <span>Close to you: {r.closeUses.map((u) => USE_LABELS[u] ?? u).join(', ')}</span>
              <span>Far from you: {r.farUses.map((u) => USE_LABELS[u] ?? u).join(', ')}</span>
            </p>
            <p className="sub">
              Purpose: {r.purpose}.{r.atEdge && ' A lies near the edge of the kit, which leans a little towards commuter.'}{' '}
              {r.timeRules.length
                ? `Time: ${r.timeRules.map((t) => `${t.label}, ${shiftText(t.shift)}`).join('; ')}.`
                : 'Time: no shift at this hour.'}
            </p>
            <p className="sub">
              Rhythm: {r.timeBand}.{' '}
              {r.quietUses.length ? `Quiet now: ${r.quietUses.join('; ')}.` : 'Nothing is quiet now.'}
            </p>
          </section>
          <ol className="routes">
            {ROUTES.filter(([key]) => !(key === 'misrouted' && r.noNewWalk)).map(([key, name, how]) => {
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
                        ? route.mainUses.map((u) => `${USE_LABELS[u.use] ?? u.use} ${pct(u.share)}`).join(', ')
                        : 'no buildings with a known use'}
                      {route.unknownShare > 0 && ` · use not known for ${pct(route.unknownShare)} of the floor area`}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
          {!r.noNewWalk && r.routes.expected.sameAsShortest && r.routes.misrouted.sameAsShortest && (
            <p className="sub warn">Walk further to stray: try two points at least 500 m apart.</p>
          )}
          {r.noNewWalk ? null : r.fellBack ? (
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
      <details className="method">
        <summary>How it works</summary>
        <p>
          <strong>The example walk.</strong> The walk the app opens with, from the Bauhaus-Universität to near the
          Markt, was chosen to be typical. Moving B about 90 m to the Markt itself makes the expected route the same
          as the shortest route: the city's reading of a walk is fragile, and a few steps can change it. Click the map
          to set your own A and B.
        </p>
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
          app, not data. The misrouted walk is chosen by the app too; the visitor walks it.
        </p>
        <p>
          <strong>Sharpening.</strong> A mixed profile averages the affinities out: read as 34 % student, a walk
          still has education near the middle, so "far from you" blurs. For routing and for the distance from
          yourself, each share is therefore raised to the power 3 and scaled back to 100 %, so the profile the city
          reads the walk as weighs much more. The bars show the shares as read; the small grey numbers show what
          each profile weighs after sharpening. "Close to you" and "Far from you" name the three uses the sharpened
          mix is most and least drawn to, leaving out uses with under 1,000 m² in the whole kit.
        </p>
        <p>
          <strong>Distance from yourself.</strong> Each profile has an affinity from 0 to 1 for each building use; the
          sharpened mix uses the share-weighted average. For each route, the buildings within 25 m of it are weighted by floor
          area, and the distance is 1 minus their average affinity. For the expected route and the misrouted walk, only
          the streets that leave the shortest route are measured, so the stretches they share don't flatten the
          numbers; the shortest route is measured whole. The expected route prefers streets that rank high
          for the mix, the misrouted walk streets that rank low. The misrouted walk also counts the streets of the
          shortest and expected routes twice, so it leaves them where it can, and stays within twice the shortest route. Floor area
          of unknown use is left out, and streets without buildings count as neutral. Most streets here are lined with
          mixed uses, so the routes often differ by only a few points, and for short walks often not at all.
        </p>
        <p>
          <strong>The city's rhythm.</strong> Each use has an activity from 0 to 1 for six time bands, on a weekday
          and at the weekend: shops and services busy in the day, offices and education on weekday working hours,
          food and drink at lunch and in the evening, entertainment in the evening and at night, homes and
          accommodation at every hour. In a street's score, a use's floor area counts only as much as it is active,
          so the streets, and with them the routes, change with the hour. The rhythm changes which streets are
          chosen, not how they are measured: the distance from yourself and "passes mainly" use plain floor area.
          The activity table is an assumption, like the affinities.
        </p>
        <p>
          <strong>Remember earlier hours.</strong> With this on, Play the day walks the hours in order, and each hour's
          misrouted walk avoids the streets the earlier hours' misrouted walks took: a street costs once more for each
          earlier hour that strayed along it. Straying that repeats becomes a routine, so the next hour strays somewhere
          else; the routes then change because of the past, not only because of the hour. The limit of twice the
          shortest route still holds; where nothing fits, memory is dropped for that hour and the summary says so.
        </p>
        <p>
          <strong>Take this walk.</strong> The misrouted walk is meant to be walked: in the street, with your own
          body, followed from the map or a screenshot. "Take this walk" keeps its streets in this browser only; they
          are never sent anywhere. The next misrouted walk between the same A and B, at every hour and on both days,
          avoids them: a street costs once more for each taken walk on it. The limit of twice the shortest route still
          holds, and a walk that shares 80 % or more of its length with a taken one does not count as new; when nothing
          new fits, the map shows no misrouted walk. The first walk is the same for everyone. Each time you stray from
          the same place, you can usually stray a little less far: the panel shows the first walk's number next to yours.
          "Forget my walks" clears them. The example walk never changes.
        </p>
        <p>
          <strong>Play the day</strong> computes the walk for every hour from 0 to 23 on the chosen weekday or weekend,
          then plays one hour per second. Each hour's misrouted walk leaves a strand of faint blue footsteps, shifted a
          little sideways; where many hours take the same streets the strands pile up into a darker, denser trace.
          Pointing at a trace shows its hours. A new A, B or day clears the traces.
        </p>
        <p>
          <strong>The 25 m rule.</strong> A building belongs to a street, and so to a route, when it lies within
          25 m of it. Those buildings give each street its score and each route its distance from yourself, and on
          the map they get brighter edges: light grey along the expected route, blue along the misrouted walk.
        </p>
        <p>
          <strong>The width of the misrouted walk</strong> follows each street's distance from yourself: all streets
          in the kit are ranked by the plain affinity of their buildings within 25 m, and the line is thicker on
          streets far from the profile and thinner on close ones, in five steps. Streets without buildings of known
          use sit in the middle.
        </p>
        <p>
          <strong>Show how the city reads you</strong> shades every building away from the routes by its affinity
          for the sharpened mix, ranked across all buildings: close to you blends into the dark, far from you is
          lighter, relative to the rest of the kit. Its opacity shows how active it is at this hour from the rhythm
          table: faint means quiet. This is only shown; the routes and the distance from yourself are measured as
          before.
        </p>
        <p>Walking time at 80 m per minute.</p>
      </details>
    </>
  )
}

// The stat card at the top of the panel: how far the misrouted walk takes you from yourself, against the
// expected route, and what straying costs in minutes over the shortest route.
// With taken walks between this A and B, a line under it says which walk this is and how far the first went.
function WalkStats({ routes, noNewWalk, firstDistance, takenCount }) {
  const { misrouted, expected } = routes
  const reading = (route) => (route.sameAsShortest ? 'same as shortest' : route.distance == null ? 'no reading' : pct(route.distance))
  const extra = extraMinutes(routes)
  return (
    <section className="stat-card">
      <div className="stat-title">Misrouted walk</div>
      <div className="stats">
        <div className={`stat${noNewWalk ? '' : ' main'}`}>
          <span className="stat-value">{noNewWalk ? '—' : reading(misrouted)}</span>
          <span className="stat-label">from yourself</span>
        </div>
        <div className="stat">
          <span className="stat-value">{reading(expected)}</span>
          <span className="stat-label">expected route</span>
        </div>
        <div className="stat">
          <span className="stat-value">{noNewWalk ? '—' : `${misrouted.sameAsShortest ? '±0' : `+${extra}`} min`}</span>
          <span className="stat-label">over the shortest</span>
        </div>
      </div>
      {firstDistance !== undefined && (
        <div className="stat-note">
          {noNewWalk
            ? `${takenCount} ${takenCount === 1 ? 'walk' : 'walks'} taken here`
            : `walk ${takenCount + 1} here`}{' '}
          · first walk {firstDistance == null ? 'same as shortest' : pct(firstDistance)}
        </div>
      )}
    </section>
  )
}

// The small legend at the top right.
function WalkLegend({ routes, reading, traces }) {
  return (
    <>
      <ul className="legend-lines">
        <li>
          <span className="line-swatch misrouted" style={{ '--c': ROUTE_COLORS.misrouted }} />
          Misrouted walk
        </li>
        <li className="legend-note">
          <span className="width-swatch" style={{ '--c': ROUTE_COLORS.misrouted }} />
          thicker = further from yourself
        </li>
        <li>
          <span className="line-swatch expected" style={{ '--c': ROUTE_COLORS.expected }} />
          Expected route
        </li>
        <li>
          <span className="line-swatch shortest" style={{ '--c': ROUTE_COLORS.shortest }} />
          Shortest route
        </li>
        {traces.length > 0 && (
          <li>
            <span className="line-swatch footsteps" style={{ '--c': ROUTE_COLORS.misrouted }} />
            Misrouted walks at other hours
          </li>
        )}
      </ul>
      {routes && (
        <ul className="legend-lines">
          <li>
            <span className="swatch" style={{ background: DARK.fill, borderColor: WALK_EDGES.misrouted }} />
            within 25 m of the misrouted walk
          </li>
          <li>
            <span className="swatch" style={{ background: DARK.fill, borderColor: WALK_EDGES.expected }} />
            within 25 m of the expected route
          </li>
        </ul>
      )}
      {routes && reading && (
        <div className="legend-lines">
          <div
            className="read-scale"
            style={{ background: `linear-gradient(90deg, ${READ_CLOSE}, ${READ_MID}, ${READ_FAR})` }}
          />
          <div className="read-labels">
            <span>close to you</span>
            <span>far from you</span>
          </div>
          <ul>
            <li>
              <span className="swatch" style={{ background: READ_MID, opacity: READ_QUIET_OPACITY + 0.15 }} />
              quiet at this hour
            </li>
            <li>
              <span className="swatch" style={{ background: READ_UNKNOWN, borderColor: READ_UNKNOWN_EDGE }} />
              use not known
            </li>
          </ul>
        </div>
      )}
    </>
  )
}

const PROFILE_LABEL = Object.fromEntries(PROFILES)
const shiftText = (shift) => Object.entries(shift).map(([k, f]) => `${PROFILE_LABEL[k]} ×${f}`).join(', ')

// Weekday or weekend, and the hour of the walk.
function TimeControl({ time, onTime, play, canPlay, onPlay, memory, onMemory }) {
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
      <button className="play" disabled={(!canPlay && !play?.results) || status === 'preparing'} onClick={onPlay}>
        {label}
      </button>
      <label className="memory">
        <input type="checkbox" checked={memory} onChange={(e) => onMemory(e.target.checked)} disabled={status === 'preparing'} />
        Remember earlier hours
      </label>
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
function DaySummary({ play, ways: found }) {
  const ways = [...found].sort((a, b) => b.hours.length - a.hours.length)
  const straying = new Set(ways.flatMap((w) => w.hours))
  // Hours with no new way to stray (after taken walks) are named apart from hours that do not stray.
  const noNew = play.played.filter((h) => play.results[h].noNewWalk)
  const never = play.played.filter((h) => !straying.has(h) && !play.results[h].noNewWalk)
  const dayName = play.day === 'weekday' ? 'weekday' : 'weekend day'
  const n = play.takenCount
  const across = n ? `Across the ${dayName}, after ${n} ${n === 1 ? 'walk' : 'walks'} you took here,` : `Across the ${dayName},`
  const withMemory = play.memory ? ` with memory (${play.plainWays} without)` : ''
  // The four ways taken most often by name, the rest counted.
  const named = ways.slice(0, 4)
  const rest = ways.length - named.length
  let text
  if (!ways.length)
    text = noNew.length ? `${across} this walk finds no new way to stray.` : `${across} this walk never strays from the shortest route.`
  else if (ways.length === 1)
    text = `${across} this walk strays in one way${withMemory}, at ${never.length || noNew.length ? `hours ${hourRanges(ways[0].hours)}` : 'every hour'}.`
  else
    text = `${across} this walk strays in ${ways.length} different ways${withMemory}: ${named
      .map((w) => `${hourRanges(w.hours)} (${w.hours.length} ${w.hours.length === 1 ? 'hour' : 'hours'})`)
      .join(' · ')}${rest ? ` · and ${rest} more` : ''}.`
  const dropped = play.memory ? play.played.filter((h) => play.results[h].memoryDropped) : []
  return (
    <p className="day-summary">
      {text}
      {(ways.length > 0 || noNew.length > 0) && never.length > 0 && ` At ${hourRanges(never)} it does not stray from the shortest route.`}
      {noNew.length > 0 && (ways.length > 0 || never.length > 0) && ` At ${hourRanges(noNew)} there is no new way to stray.`}
      {dropped.length > 0 && ` At ${hourRanges(dropped)} memory was dropped to stay within twice the shortest route.`}
      <span className="sub">
        {' '}
        Walks that share at least 80 % of their length count as one way. The denser a trace of footsteps on the map,
        the more hours walk it.
      </span>
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
