// Runs the walk calculation off the main thread, so the 3D view stays smooth while it works.
import { prepareData } from './reach.js'
import { prepareMisroute, computeMisroute, computeMisrouteDay, waysOf, snap } from './misroute.js'

let data = null
let misrouteData = null

self.onmessage = ({ data: msg }) => {
  if (msg.type === 'init') {
    data = prepareData(msg.files)
    misrouteData = prepareMisroute(data, msg.files)
    self.postMessage({ type: 'ready' })
  } else if (msg.type === 'misroute' || msg.type === 'misrouteDay') {
    try {
      const { pair, list } = takenFor(msg)
      const result =
        msg.type === 'misroute' ? computeMisroute(data, misrouteData, msg.a, msg.b, msg.time, null, list) : playDay(msg, list)
      self.postMessage({ type: 'result', id: msg.id, result: { ...result, pair, takenCount: list ? list.length : 0 } })
    } catch (e) {
      self.postMessage({ type: 'result', id: msg.id, result: { error: 'failed', message: String(e) } })
    }
  }
}

// The walks taken earlier between the same A and B ("Take this walk"), from the map sent by the page:
// keyed by the snapped street nodes, A to B in this direction. null when there are none.
function takenFor({ a, b, taken }) {
  const A = snap(data, a)
  const B = snap(data, b)
  if (A.error || B.error) return { pair: null, list: null }
  const pair = `${A.node}-${B.node}`
  const list = taken?.[pair]
  return { pair, list: list?.length ? list : null }
}

// "Play the day": all 24 hours, and with memory also the number of ways the day finds without it.
function playDay({ a, b, day, memory }, taken) {
  const hours = computeMisrouteDay(data, misrouteData, a, b, day, { memory, taken })
  const plainWays = memory ? waysOf(computeMisrouteDay(data, misrouteData, a, b, day, { taken })) : null
  return { hours, plainWays }
}
