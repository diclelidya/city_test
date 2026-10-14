// Local flat projection around the kit centre: x metres east, y metres north.
// Over 2 km the error is far below a metre.
export function makeProjection([lon0, lat0]) {
  const p = (lat0 * Math.PI) / 180
  const kx = 111412.84 * Math.cos(p) - 93.5 * Math.cos(3 * p) + 0.118 * Math.cos(5 * p)
  const ky = 111132.92 - 559.82 * Math.cos(2 * p) + 1.175 * Math.cos(4 * p)
  return ([lon, lat]) => [(lon - lon0) * kx, (lat - lat0) * ky]
}
