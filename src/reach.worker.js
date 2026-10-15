// Runs the reach calculation off the main thread, so the 3D view stays smooth while it works.
import { prepareData, computeReach } from './reach.js'
import { prepareMisroute, computeMisroute, computeMisrouteDay, waysOf } from './misroute.js'

let data = null
let misrouteData = null

self.onmessage = ({ data: msg }) => {
  if (msg.type === 'init') {
    data = prepareData(msg.files)
    misrouteData = prepareMisroute(data, msg.files)
    self.postMessage({ type: 'ready' })
  } else if (msg.type === 'reach' || msg.type === 'misroute' || msg.type === 'misrouteDay') {
    try {
      const result =
        msg.type === 'reach'
          ? computeReach(data, msg.xy)
          : msg.type === 'misroute'
            ? computeMisroute(data, misrouteData, msg.a, msg.b, msg.time)
            : playDay(msg)
      self.postMessage({ type: 'result', id: msg.id, result })
    } catch (e) {
      self.postMessage({ type: 'result', id: msg.id, result: { error: 'failed', message: String(e) } })
    }
  }
}

// "Play the day": all 24 hours, and with memory also the number of ways the day finds without it.
function playDay({ a, b, day, memory }) {
  const hours = computeMisrouteDay(data, misrouteData, a, b, day, { memory })
  const plainWays = memory ? waysOf(computeMisrouteDay(data, misrouteData, a, b, day)) : null
  return { hours, plainWays }
}
