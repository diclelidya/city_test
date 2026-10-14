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

// "Walk from yourself": the shortest route dashed near-black, the expected route a strong blue, the misrouted walk pink.
export const ROUTE_COLORS = { shortest: '#1a1a1a', expected: '#1f5fd6', misrouted: '#e0245e' }

export const GROUND = '#f3f0ea'
export const STREET = '#8a857c'

// Mix a colour with another, as on screen: t = 0 keeps the first, t = 1 gives the second.
export function mix(a, b, t) {
  const ch = (hex, i) => parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16)
  return '#' + [0, 1, 2].map((i) => Math.round(ch(a, i) * (1 - t) + ch(b, i) * t).toString(16).padStart(2, '0')).join('')
}

// The ground areas use a lighter tint of each shade, so the highlighted buildings stand out.
export const AREA_TINTS = REACH_COLORS.map((c) => mix(c, GROUND, 0.35))

// "Walk from yourself": all other buildings fade to a pale grey; buildings within 25 m of a route
// take its colour, slightly lightened, and a mix of the two where both routes pass.
export const WALK_PALE = '#e3e1dc'
export const WALK_TINTS = {
  expected: mix(ROUTE_COLORS.expected, '#ffffff', 0.15),
  misrouted: mix(ROUTE_COLORS.misrouted, '#ffffff', 0.15),
  both: mix(ROUTE_COLORS.expected, ROUTE_COLORS.misrouted, 0.5),
}
