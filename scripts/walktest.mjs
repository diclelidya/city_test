// 200-walk test: the same 200 random walks (fixed seed) on a weekday at 12:00, plus 5 played days with memory.
// Usage, from the project folder: node scripts/walktest.mjs (or give the project folder as an argument)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'

const root = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), '..')
const imp = (f) => import(pathToFileURL(join(root, 'src', f)).href)
const { prepareData } = await imp('reach.js')
const { prepareMisroute, computeMisroute, computeMisrouteDay, waysOf, PROFILES } = await imp('misroute.js')

const read = (n) => JSON.parse(readFileSync(join(root, 'public', 'data', n), 'utf8'))
const files = { kit: read('kit.json'), buildings: read('buildings.geojson'), graph: read('streets.graph.json'), zensus: read('zensus.geojson') }
const data = prepareData(files)
const prep = prepareMisroute(data, files)

let s = 42
const rand = () => {
  s |= 0
  s = (s + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const node = () => data.nodes[data.walkableNodes[Math.floor(rand() * data.walkableNodes.length)]].xy

const plain = (v) => (ArrayBuffer.isView(v) ? Array.from(v, (x) => (Number.isNaN(x) ? 'NaN' : x)) : v)
const hash = createHash('sha256')
const add = (r) => hash.update(JSON.stringify(r, (k, v) => plain(v)))

const walks = []
while (walks.length < 200) {
  const a = node()
  const b = node()
  const r = computeMisroute(data, prep, a, b, { day: 'weekday', hour: 12 })
  if (r.error) continue
  add(r)
  walks.push(r)
}

const avg = (xs) => xs.reduce((p, q) => p + q, 0) / xs.length
const median = (xs) => {
  const o = [...xs].sort((p, q) => p - q)
  return o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2
}
const pct = (v) => `${(v * 100).toFixed(1)} %`
const R = walks.map((r) => r.routes)
const expSame = R.filter((r) => r.expected.sameAsShortest)
const misSame = R.filter((r) => r.misrouted.sameAsShortest)
const allSame = R.filter((r) => r.expected.sameAsShortest && r.misrouted.sameAsShortest)
const expD = R.filter((r) => !r.expected.sameAsShortest && r.expected.distance != null).map((r) => r.expected.distance)
const misD = R.filter((r) => !r.misrouted.sameAsShortest && r.misrouted.distance != null).map((r) => r.misrouted.distance)
const shoD = R.filter((r) => r.shortest.distance != null).map((r) => r.shortest.distance)
const gaps = R.filter((r) => !r.expected.sameAsShortest && !r.misrouted.sameAsShortest && r.expected.distance != null && r.misrouted.distance != null).map(
  (r) => r.misrouted.distance - r.expected.distance,
)
const ratios = R.map((r) => r.misrouted.length / r.shortest.length)
const top = (r) => [...PROFILES].sort((x, y) => r.mix[y[0]] - r.mix[x[0]])[0][0]
const passes = (r, use) => r.routes.misrouted.mainUses.slice(0, 2).some((u) => u.use === use)
const students = walks.filter((r) => top(r) === 'student')
const locals = walks.filter((r) => top(r) === 'local')

console.log('200 walks, weekday 12:00')
console.log(`  expected = shortest           ${expSame.length} (longest ${Math.round(Math.max(...expSame.map((r) => r.shortest.length)))} m)`)
console.log(`  misrouted = shortest          ${misSame.length} (longest ${Math.round(Math.max(...misSame.map((r) => r.shortest.length)))} m)`)
console.log(`  all three the same            ${allSame.length}`)
console.log(`  expected, average distance    ${pct(avg(expD))}`)
console.log(`  misrouted, average distance   ${pct(avg(misD))}`)
console.log(`  shortest, average distance    ${pct(avg(shoD))}`)
console.log(`  median gap misrouted-expected ${pct(median(gaps))}`)
console.log(`  detour, median / max          ${median(ratios).toFixed(2)} / ${Math.max(...ratios).toFixed(2)}`)
console.log(`  softened / fell back          ${walks.filter((r) => r.strength < 3).length} / ${walks.filter((r) => r.fellBack).length}`)
console.log(`  student walks, education      ${students.filter((r) => passes(r, 'education')).length} of ${students.length}`)
console.log(`  local walks, residential      ${locals.filter((r) => passes(r, 'residential')).length} of ${locals.length}`)

console.log('5 played days, weekday, with memory (walks of at least 500 m)')
let days = 0
while (days < 5) {
  const a = node()
  const b = node()
  if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 500) continue
  const withMemory = computeMisrouteDay(data, prep, a, b, 'weekday', { memory: true })
  if (withMemory[0].error) continue
  const without = computeMisrouteDay(data, prep, a, b, 'weekday')
  withMemory.forEach(add)
  without.forEach(add)
  days++
  console.log(`  day ${days}: ${waysOf(withMemory)} ways with memory, ${waysOf(without)} without`)
}
console.log(`checksum of every result: ${hash.digest('hex').slice(0, 16)}`)
