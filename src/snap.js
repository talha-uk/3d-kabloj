export const GRID = 1
export const GRID_PULL = 0.16
export const ANGLE_STEP = Math.PI / 12
export const ANGLE_PULL = Math.PI / 45

export function softSnap(value, step = GRID, pull = GRID_PULL) {
  const nearest = Math.round(value / step) * step
  return Math.abs(value - nearest) <= pull ? nearest : value
}

export function softSnapAngle(value, step = ANGLE_STEP, pull = ANGLE_PULL) {
  const nearest = Math.round(value / step) * step
  const delta = Math.atan2(Math.sin(value - nearest), Math.cos(value - nearest))
  return Math.abs(delta) <= pull ? nearest : value
}

export function softSnapXZ(point) {
  return [softSnap(point[0]), point[1], softSnap(point[2] ?? point[1])]
}
