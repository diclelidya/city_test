// Round 16 test: take walk after walk between the same A and B until no new walk fits.
// 60 seeded random walks of at least 500 m (straight line), weekday 12:00, at most 30 walks each.
// Usage, from the project folder: node scripts/takentest.mjs (or give the project folder as an argument)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const imp = (f) => import(pathToFileURL(join(root, 'src', f)).href)
const { prepareData } = await imp('reach.js')
const { prepareMisroute, computeMisroute } = await imp('misroute.js')
const read = (n) => JSON.parse(readFileSync(join(root, 'public', 'data', n), 'utf8'))
const files = { kit: read('kit.json'), buildings: read('buildings.geojson'), graph: read('streets.graph.json'), zensus: read('zensus.geojson') }
const data = prepareData(files)
const prep = prepareMisroute(data, files)

let s = 16
const rand = () => {
  s |= 0
  s = (s + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const node = () => data.nodes[data.walkableNodes[Math.floor(rand() * data.walkableNodes.length)]].xy
const avg = (xs) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : NaN)
const median = (xs) => {
  const o = [...xs].sort((p, q) => p - q)
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2
}
const pct = (v) => (Number.isNaN(v) ? '-' : `${(v * 100).toFixed(1)} %`)

const time = { day: 'weekday', hour: 12 }
const CAP = 30
const counts = []
const byIndex = []
const lastD = []
const below = [] // walks after the first that are closer than the first
const stops = { cap: 0, shares: 0, nothingFits: 0 } // why the taking stopped
let pairs = 0
while (pairs < 60) {
  const a = node()
  const b = node()
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 500) continue
  const first = computeMisroute(data, prep, a, b, time)
  if (first.error || first.routes.misrouted.sameAsShortest) continue
  pairs++
  const taken = []
  const dists = []
  let r = first
  while (true) {
    dists.push(r.routes.misrouted.distance)
    taken.push(Array.from(r.misPath))
    if (taken.length >= CAP) { stops.cap++; break }
    r = computeMisroute(data, prep, a, b, time, null, taken)
    if (r.noNewWalk) {
      if (r.fellBack) stops.nothingFits++
      else stops.shares++
      break
    }
  }
  counts.push(taken.length)
  dists.forEach((d, i) => d != null && (byIndex[i] ??= []).push(d))
  if (dists.at(-1) != null) lastD.push(dists.at(-1))
  for (const d of dists.slice(1)) if (d != null && first.routes.misrouted.distance != null) below.push(d < first.routes.misrouted.distance)
}

console.log(`${pairs} walks of at least 500 m, weekday 12:00, taken until no new walk fits (cap ${CAP})`)
console.log(`  walks per A and B, mean / median / min / max   ${avg(counts).toFixed(1)} / ${median(counts)} / ${Math.min(...counts)} / ${Math.max(...counts)}`)
console.log(`  stopped: cap ${stops.cap}, no new way ${stops.shares + stops.nothingFits} (nothing fits ${stops.nothingFits})`)
for (const i of [0, 1, 2, 4, 9, 19]) if (byIndex[i]) console.log(`  walk ${String(i + 1).padEnd(2)} distance, mean (n)   ${pct(avg(byIndex[i]))} (${byIndex[i].length})`)
console.log(`  last walk taken, mean distance   ${pct(avg(lastD))}`)
console.log(`  later walks closer than the first   ${below.filter(Boolean).length} of ${below.length}`)
