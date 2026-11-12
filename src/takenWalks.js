// "Take this walk": the misrouted walks taken between each A and B, as lists of street indices, under
// the key "<street node of A>-<street node of B>". Kept only in this browser (localStorage), never sent
// anywhere. If storage is blocked, they live in the page's memory until it is closed.
const KEY = 'misroute-taken-v1'

// Only lists of walks, each a list of street indices, are read back.
const isWalks = (walks) => Array.isArray(walks) && walks.every((w) => Array.isArray(w) && w.every(Number.isInteger))

export function loadTaken() {
  try {
    const map = JSON.parse(localStorage.getItem(KEY))
    if (!map || typeof map !== 'object' || Array.isArray(map)) return {}
    return Object.fromEntries(Object.entries(map).filter(([, walks]) => isWalks(walks)))
  } catch {
    return {}
  }
}

export function saveTaken(map) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // Storage blocked: the walks stay in the page's memory.
  }
}

export function clearTaken() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Storage blocked: nothing was kept.
  }
}
