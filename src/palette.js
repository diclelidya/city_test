// The labels of the building uses, as the panel names them.
export const USE_LABELS = {
  residential: 'residential',
  service: 'service',
  office: 'office',
  retail: 'retail',
  food_and_drink: 'food and drink',
  accommodation: 'accommodation',
  education: 'education',
  health: 'health',
  civic: 'civic',
  culture: 'culture',
  entertainment: 'entertainment',
  sport: 'sport',
  transport: 'transport',
  light_industrial: 'light industrial',
  undefined: 'use not known',
}

// "Walk from yourself" is drawn dark: a city in thin light lines, with the misrouted walk as the only
// bright, glowing thing. The expected route is a light grey dashed line, the shortest a fainter dotted one.
export const ROUTE_COLORS = { shortest: '#7d828b', expected: '#c3c7ce', misrouted: '#3d6bff' }
// The thin light core along the middle of the misrouted walk's glow.
export const WALK_CORE = '#e3e9ff'

// Mix a colour with another, as on screen: t = 0 keeps the first, t = 1 gives the second.
export function mix(a, b, t) {
  const ch = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16)
  return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t).toString(16).padStart(2, '0')).join('')
}

// "Walk from yourself", dark: near-black ground, streets a slightly lighter line, every building a dark
// fill with thin light-grey edges. Buildings within 25 m of a route get brighter edges: light grey along
// the expected route, blue-tinted along the misrouted walk.
export const DARK = {
  background: '#08090b',
  ground: '#0b0c0f',
  street: '#2b2f36',
  fill: '#16181d',
  edge: '#4d525a',
}
export const WALK_EDGES = { expected: '#a3a8b0', misrouted: '#7f9bff' }

// "Show how the city reads you", inverted for the dark city: close to you (rank 1) blends into the dark,
// far from you (rank 0) is a lighter grey. No blue: electric blue stays with the misrouted walk.
export const READ_CLOSE = '#121418'
export const READ_FAR = '#7b8089'
export const READ_MID = mix(READ_CLOSE, READ_FAR, 0.5)
// Buildings with no known use keep the plain dark fill and a lighter grey outline.
export const READ_UNKNOWN = DARK.fill
export const READ_UNKNOWN_EDGE = '#9a9ea6'
// The scale is prepared once as 101 steps, so recolouring the city every hour stays quick.
const READ_STEPS = Array.from({ length: 101 }, (_, k) => mix(READ_FAR, READ_CLOSE, k / 100))
// Opacity shows how awake a building is at this hour: 15 % when quiet, fully opaque when fully active.
// Faded buildings sink into the dark ground; their edges stay.
export const READ_QUIET_OPACITY = 0.15
export const WALK_OPACITY = 1
export const readOpacity = (activity) =>
  Number.isNaN(activity) ? WALK_OPACITY : READ_QUIET_OPACITY + (WALK_OPACITY - READ_QUIET_OPACITY) * activity
export const readColor = (rank) => (Number.isNaN(rank) ? READ_UNKNOWN : READ_STEPS[Math.round(rank * 100)])
