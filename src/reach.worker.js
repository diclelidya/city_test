// Runs the reach calculation off the main thread, so the 3D view stays smooth while it works.
import { prepareData, computeReach } from './reach.js'

let data = null

self.onmessage = ({ data: msg }) => {
  if (msg.type === 'init') {
    data = prepareData(msg.files)
    self.postMessage({ type: 'ready' })
  } else if (msg.type === 'reach') {
    try {
      self.postMessage({ type: 'result', id: msg.id, result: computeReach(data, msg.xy) })
    } catch (e) {
      self.postMessage({ type: 'result', id: msg.id, result: { error: 'failed', message: String(e) } })
    }
  }
}
