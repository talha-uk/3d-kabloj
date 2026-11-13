function hypot(x, y, z = 0) {
  return Math.hypot(x, y, z)
}

function dedupe(points) {
  const out = []
  for (const point of points) {
    const prev = out[out.length - 1]
    if (prev && hypot(point[0] - prev[0], point[1] - prev[1], point[2] - prev[2]) < 1e-4) continue
    out.push(point)
  }
  return out.length >= 2 ? out : null
}

function normalOr(value, fallback) {
  const length = hypot(value[0], value[1], value[2])
  if (length < 1e-6) return fallback
  return [value[0] / length, value[1] / length, value[2] / length]
}

export function routePlacement(aPos, aNormal, bPos, bNormal, bend) {
  const an = normalOr(aNormal, [0, 1, 0])
  const bn = normalOr(bNormal, [0, 1, 0])
  const dist = hypot(bPos[0] - aPos[0], bPos[1] - aPos[1], bPos[2] - aPos[2])
  const lead = Math.min(0.12, Math.max(0.025, dist * 0.12))
  const start = [aPos[0] + an[0] * lead, aPos[1] + an[1] * lead, aPos[2] + an[2] * lead]
  const end = [bPos[0] + bn[0] * lead, bPos[1] + bn[1] * lead, bPos[2] + bn[2] * lead]
  const drop = Math.min(0.28, Math.max(0.02, dist * 0.16))
  const mid = [
    (start[0] + end[0]) / 2 + (bend?.[0] || 0),
    (start[1] + end[1]) / 2 - drop + (bend?.[1] || 0),
    (start[2] + end[2]) / 2 + (bend?.[2] || 0)
  ]
  return dedupe([aPos, start, mid, end, bPos])
}

export function routeSchema(aPos, aNormal, bPos, bNormal, lift, bend) {
  const ax = aNormal[0]
  const az = aNormal[2]
  const bx = bNormal[0]
  const bz = bNormal[2]
  const al = Math.hypot(ax, az)
  const bl = Math.hypot(bx, bz)
  const an = al < 1e-6 ? [1, 0] : [ax / al, az / al]
  const bn = bl < 1e-6 ? [-1, 0] : [bx / bl, bz / bl]
  const lead = 0.18
  const origin = [aPos[0], lift, aPos[2]]
  const target = [bPos[0], lift, bPos[2]]
  const exit = [origin[0] + an[0] * lead, lift, origin[2] + an[1] * lead]
  const entry = [target[0] + bn[0] * lead, lift, target[2] + bn[1] * lead]
  const corner = [entry[0] + (bend?.[0] || 0), lift, exit[2] + (bend?.[1] || 0)]
  return dedupe([origin, exit, corner, entry, target])
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}

function scale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s]
}

function insideBox(box, point, pad = 0) {
  return point[0] > box.min[0] - pad && point[0] < box.max[0] + pad
    && point[1] > box.min[1] - pad && point[1] < box.max[1] + pad
    && point[2] > box.min[2] - pad && point[2] < box.max[2] + pad
}

function segmentHits(a, b, box, pad) {
  for (let step = 0; step <= 10; step += 1) {
    const t = step / 10
    const point = [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t
    ]
    if (insideBox(box, point, pad)) return true
  }
  return false
}

function hitsAny(a, b, boxes, pad) {
  return boxes.some((box) => segmentHits(a, b, box, pad))
}

export function routeClear(aPos, aNormal, bPos, bNormal, boxes = [], lane = 0) {
  const an = normalOr(aNormal, [0, 1, 0])
  const bn = normalOr(bNormal, [0, 1, 0])
  const dist = hypot(bPos[0] - aPos[0], bPos[1] - aPos[1], bPos[2] - aPos[2])
  const lead = Math.min(0.14, Math.max(0.04, dist * 0.12))
  let start = add(aPos, scale(an, lead))
  let end = add(bPos, scale(bn, lead))
  for (let pass = 0; pass < 8; pass += 1) {
    let moved = false
    for (const box of boxes) {
      if (insideBox(box, start, 0.008)) {
        start = add(start, scale(an, 0.03))
        moved = true
      }
      if (insideBox(box, end, 0.008)) {
        end = add(end, scale(bn, 0.03))
        moved = true
      }
    }
    if (!moved) break
  }
  const pad = 0.01
  const laneLift = lane * 0.04
  const blocked = hitsAny(start, end, boxes, pad)
  if (!blocked && lane === 0) {
    const sag = Math.min(0.06, dist * 0.08)
    const mid = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2 - sag,
      (start[2] + end[2]) / 2
    ]
    if (!hitsAny(start, mid, boxes, pad) && !hitsAny(mid, end, boxes, pad)) {
      return dedupe([aPos, start, mid, end, bPos])
    }
  }
  let top = Math.max(start[1], end[1])
  for (const box of boxes) top = Math.max(top, box.max[1])
  const crown = top + 0.08 + laneLift
  const upA = [start[0], Math.max(start[1], crown), start[2]]
  const upB = [end[0], Math.max(end[1], crown), end[2]]
  const mid = [(upA[0] + upB[0]) / 2, crown, (upA[2] + upB[2]) / 2]
  return dedupe([aPos, start, upA, mid, upB, end, bPos])
}

export function routeVia(aPos, aNormal, bPos, bNormal, vias, lift = null) {
  const an = normalOr(aNormal, [0, 1, 0])
  const bn = normalOr(bNormal, [0, 1, 0])
  const dist = hypot(bPos[0] - aPos[0], bPos[1] - aPos[1], bPos[2] - aPos[2])
  const lead = Math.min(0.14, Math.max(0.04, dist * 0.12))
  const start = add(aPos, scale(an, lead))
  const end = add(bPos, scale(bn, lead))
  const mids = (vias || []).map((via) => (
    lift == null ? via : [via[0], lift, via[1]]
  ))
  return dedupe([aPos, start, ...mids, end, bPos])
}

export function routeThrough(aPos, aNormal, bPos, bNormal, via) {
  const an = normalOr(aNormal, [0, 1, 0])
  const bn = normalOr(bNormal, [0, 1, 0])
  const dist = hypot(bPos[0] - aPos[0], bPos[1] - aPos[1], bPos[2] - aPos[2])
  const lead = Math.min(0.14, Math.max(0.04, dist * 0.12))
  const start = add(aPos, scale(an, lead))
  const end = add(bPos, scale(bn, lead))
  return dedupe([aPos, start, via, end, bPos])
}

export const CABLE_RADIUS = {
  sma: 0.0055,
  rf: 0.0055,
  ntype: 0.014,
  usb2: 0.007,
  usb: 0.007,
  usb3: 0.008,
  usbc: 0.007,
  ag: 0.009,
  guc: 0.012,
  diger: 0.008
}
export const SCHEMA_LIFT = {
  sma: 0.008,
  rf: 0.008,
  ntype: 0.014,
  usb2: 0.02,
  usb: 0.02,
  usb3: 0.026,
  usbc: 0.03,
  ag: 0.032,
  guc: 0.038,
  diger: 0.044
}
