// A quiet palette for building uses, and one accent colour in three shades for the reach.
export const USE_COLORS = [
  ['residential', 'residential', '#ddd0b6'],
  ['service', 'service', '#bdb7aa'],
  ['office', 'office', '#a3b5c4'],
  ['retail', 'retail', '#dcb98f'],
  ['food_and_drink', 'food and drink', '#cfa082'],
  ['accommodation', 'accommodation', '#d9c48f'],
  ['education', 'education', '#a5bba7'],
  ['health', 'health', '#bcd2cb'],
  ['civic', 'civic', '#c4ab8c'],
  ['culture', 'culture', '#b9a091'],
  ['entertainment', 'entertainment', '#d6aaa4'],
  ['sport', 'sport', '#adc293'],
  ['transport', 'transport', '#959fa7'],
  ['light_industrial', 'light industrial', '#a69887'],
  ['undefined', 'use not known', '#e6e3dc'],
]

export const useColor = Object.fromEntries(USE_COLORS.map(([key, , color]) => [key, color]))

// 5, 10 and 15 minutes: dark to light.
export const REACH_COLORS = ['#4b2a7b', '#8559bd', '#c4a6e8']

// Markers for buildings with shop space in the 5-minute area.
export const SHOP = '#e0912f'
export const SHOP_SELECTED = '#c2410c'

// "Walk from yourself" is drawn dark: a city in thin light lines, with the misrouted walk as the only
// bright, glowing thing. The expected route is a light grey dashed line, the shortest a fainter dotted one.
export const ROUTE_COLORS = { shortest: '#7d828b', expected: '#c3c7ce', misrouted: '#3d6bff' }
// The thin light core along the middle of the misrouted walk's glow.
export const WALK_CORE = '#e3e9ff'

export const GROUND = '#f3f0ea'
export const STREET = '#8a857c'

// Mix a colour with another, as on screen: t = 0 keeps the first, t = 1 gives the second.
export function mix(a, b, t) {
  const ch = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16)
  return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t).toString(16).padStart(2, '0')).join('')
}

// The ground areas use a lighter tint of each shade, so the highlighted buildings stand out.
export const AREA_TINTS = REACH_COLORS.map((c) => mix(c, GROUND, 0.35))

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
