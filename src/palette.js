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

// "Walk from yourself": electric blue belongs only to the misrouted walk and is the strongest thing on
// the map. The expected route is grey, the shortest route a thin dashed near-black line.
export const ROUTE_COLORS = { shortest: '#1a1a1a', expected: '#6b6b6b', misrouted: '#1f3bff' }
// Dark grey for everything else in this mode that used to be blue: bars, slider, swatches.
export const UI_GREY = '#444444'

export const GROUND = '#f3f0ea'
export const STREET = '#8a857c'

// Mix a colour with another, as on screen: t = 0 keeps the first, t = 1 gives the second.
export function mix(a, b, t) {
  const ch = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16)
  return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t).toString(16).padStart(2, '0')).join('')
}

// The ground areas use a lighter tint of each shade, so the highlighted buildings stand out.
export const AREA_TINTS = REACH_COLORS.map((c) => mix(c, GROUND, 0.35))

// "Walk from yourself": buildings away from the routes fade to a pale grey. Buildings within 25 m of a
// route become line drawings: edges in the route's tone, with only a very light fill.
export const WALK_PALE = '#e2e1de'
export const WALK_FILLS = { expected: '#f4f4f3', misrouted: '#f1f3ff' }
export const WALK_EDGES = { expected: '#2b2b2b', misrouted: ROUTE_COLORS.misrouted }

// "Show how the city reads you": a greyscale, no blue. Very pale warm grey for close to you (rank 1),
// dark grey for far from you (rank 0). Buildings with no known use are white with a thin grey outline.
export const READ_CLOSE = '#f1ede6'
// Not darker than this: at 70 % opacity the darkest buildings must stay lighter than the grey
// expected-route line, so it remains readable over them.
export const READ_FAR = '#5c5c5c'
export const READ_MID = mix(READ_CLOSE, READ_FAR, 0.5)
export const READ_UNKNOWN = '#ffffff'
export const READ_UNKNOWN_EDGE = '#a9a9a9'
// The scale is prepared once as 101 steps, so recolouring the city every hour stays quick.
const READ_STEPS = Array.from({ length: 101 }, (_, k) => mix(READ_FAR, READ_CLOSE, k / 100))
// Opacity shows how awake a building is at this hour: 15 % when quiet, up to 70 % when fully active.
export const READ_QUIET_OPACITY = 0.15
export const WALK_OPACITY = 0.7
export const readOpacity = (activity) =>
  Number.isNaN(activity) ? WALK_OPACITY : READ_QUIET_OPACITY + (WALK_OPACITY - READ_QUIET_OPACITY) * activity
export const readColor = (rank) => (Number.isNaN(rank) ? READ_UNKNOWN : READ_STEPS[Math.round(rank * 100)])
