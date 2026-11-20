// 2D billiards on one table, in table-local metres: x along the length, z
// across, (0, 0) the centre of the bed. Fixed substeps, rolling friction,
// elastic ball-ball impacts, cushions with pocket mouths and pocket capture.
// Each ball keeps a quaternion so it can be drawn rolling. Events report
// impacts so the caller can play positional sounds.
import { Quaternion, Vector3 } from 'three'
import { TABLE } from '../config.js'

const R = TABLE.ballR
const HX = TABLE.bedL / 2
const HZ = TABLE.bedW / 2
const ROLL_DECEL = 0.55 // m/s^2 rolling resistance on the cloth
const DAMP = 0.12 // 1/s extra speed-proportional drag
const BALL_E = 0.94
const RAIL_E = 0.72
const CORNER_MOUTH = 0.16 // along each rail from the corner, no cushion
const SIDE_MOUTH = 0.12 // half-width of a side pocket mouth
export const POCKETS = [
  [-HX - 0.03, -HZ - 0.03, 0.135], [HX + 0.03, -HZ - 0.03, 0.135], [-HX - 0.03, HZ + 0.03, 0.135], [HX + 0.03, HZ + 0.03, 0.135],
  [0, -HZ - 0.07, 0.125], [0, HZ + 0.07, 0.125],
]
export const HEAD_SPOT = { x: -HX / 2, z: 0 }
export const FOOT_SPOT = { x: HX / 2, z: 0 }
export const BED = { hx: HX, hz: HZ, r: R }

const axis = new Vector3()
const dq = new Quaternion()

export function createSim() {
  const balls = []
  for (let n = 0; n < 16; n++) balls.push({ n, x: 0, z: 0, vx: 0, vz: 0, on: true, sunk: 0, q: new Quaternion(), pocket: -1 })
  const sim = {
    balls,
    events: [], // { type: 'ball'|'rail'|'pocket'|'cue', speed, x, z, n }
    firstHit: -1, // first object ball the cue ball touched this shot
    railAfter: false,
    sunkThisShot: [],
    rack,
    shoot,
    step,
    moving,
    placeCue,
  }
  function rack(seed = Math.random()) {
    // 8-ball rack: apex on the foot spot, 8 in the middle of row 3, a solid and a stripe in the back corners
    let r = seed
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280)
    const order = [1, 9, 2, 10, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15]
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    const spots = []
    for (let row = 0; row < 5; row++) for (let k = 0; k <= row; k++) spots.push([FOOT_SPOT.x + row * R * 1.74, (k - row / 2) * R * 2.01])
    // spot index 4 = row 3 middle (8 ball); 10 and 14 = back corners
    const solids = order.filter((n) => n < 8)
    const stripes = order.filter((n) => n > 8)
    const fill = []
    let s = 0
    let t = 0
    for (let i = 0; i < 15; i++) {
      if (i === 4) fill.push(8)
      else if (i === 10) fill.push(solids[s++])
      else if (i === 14) fill.push(stripes[t++])
      else fill.push(null)
    }
    const rest = [...solids.slice(s), ...stripes.slice(t)]
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[rest[i], rest[j]] = [rest[j], rest[i]]
    }
    for (let i = 0; i < 15; i++) if (fill[i] === null) fill[i] = rest.pop()
    for (const b of balls) Object.assign(b, { vx: 0, vz: 0, on: true, sunk: 0, pocket: -1 })
    fill.forEach((n, i) => {
      balls[n].x = spots[i][0] + (rnd() - 0.5) * 0.002
      balls[n].z = spots[i][1]
      balls[n].q.setFromAxisAngle(axis.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), rnd() * 6)
    })
    placeCue(HEAD_SPOT.x, HEAD_SPOT.z)
  }
  function placeCue(x, z) {
    const c = balls[0]
    Object.assign(c, { x, z, vx: 0, vz: 0, on: true, sunk: 0, pocket: -1 })
  }
  // angle: radians in the table plane (0 = +x), power: m/s
  function shoot(angle, speed) {
    const c = balls[0]
    c.vx = Math.cos(angle) * speed
    c.vz = Math.sin(angle) * speed
    sim.firstHit = -1
    sim.railAfter = false
    sim.sunkThisShot = []
    sim.events.push({ type: 'cue', speed, x: c.x, z: c.z, n: 0 })
  }
  function moving() {
    for (const b of balls) if (b.on && (b.vx !== 0 || b.vz !== 0)) return true
    return false
  }
  function step(dt) {
    const sub = 8
    const h = dt / sub
    for (let s = 0; s < sub; s++) substep(h)
    // rolling rotation for drawing
    for (const b of balls) {
      if (!b.on) continue
      const sp = Math.hypot(b.vx, b.vz)
      if (sp < 1e-5) continue
      axis.set(b.vz, 0, -b.vx).divideScalar(sp)
      dq.setFromAxisAngle(axis, (sp * dt) / R)
      b.q.premultiply(dq)
    }
  }
  function substep(h) {
    for (const b of balls) {
      if (!b.on) continue
      const sp = Math.hypot(b.vx, b.vz)
      if (sp === 0) continue
      const ns = Math.max(0, sp - (ROLL_DECEL + DAMP * sp) * h)
      if (ns < 0.012) {
        b.vx = b.vz = 0
        continue
      }
      b.vx *= ns / sp
      b.vz *= ns / sp
      b.x += b.vx * h
      b.z += b.vz * h
    }
    // ball-ball
    for (let i = 0; i < 16; i++) {
      const a = balls[i]
      if (!a.on) continue
      for (let j = i + 1; j < 16; j++) {
        const b = balls[j]
        if (!b.on) continue
        const dx = b.x - a.x
        const dz = b.z - a.z
        const d2 = dx * dx + dz * dz
        if (d2 >= 4 * R * R || d2 === 0) continue
        const d = Math.sqrt(d2)
        const nx = dx / d
        const nz = dz / d
        const overlap = 2 * R - d
        a.x -= nx * overlap * 0.5
        a.z -= nz * overlap * 0.5
        b.x += nx * overlap * 0.5
        b.z += nz * overlap * 0.5
        const rel = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz
        if (rel <= 0) continue
        const jimp = (rel * (1 + BALL_E)) / 2
        a.vx -= jimp * nx
        a.vz -= jimp * nz
        b.vx += jimp * nx
        b.vz += jimp * nz
        if (i === 0 && sim.firstHit < 0) sim.firstHit = j
        if (rel > 0.05) sim.events.push({ type: 'ball', speed: rel, x: (a.x + b.x) / 2, z: (a.z + b.z) / 2, n: j })
      }
    }
    // cushions + pockets
    for (const b of balls) {
      if (!b.on) continue
      for (let p = 0; p < POCKETS.length; p++) {
        const [px, pz, pr] = POCKETS[p]
        if (Math.hypot(b.x - px, b.z - pz) < pr - R * 0.25) {
          b.on = false
          b.pocket = p
          b.sunk = 0
          sim.sunkThisShot.push(b.n)
          sim.events.push({ type: 'pocket', speed: Math.hypot(b.vx, b.vz), x: px, z: pz, n: b.n })
          b.vx = b.vz = 0
          b.x = px
          b.z = pz
          break
        }
      }
      if (!b.on) continue
      const inCornerX = Math.abs(b.x) > HX - CORNER_MOUTH
      const inCornerZ = Math.abs(b.z) > HZ - CORNER_MOUTH
      const inSide = Math.abs(b.x) < SIDE_MOUTH
      // long rails (|z| = HZ) have side + corner mouths
      if (Math.abs(b.z) > HZ - R && !inCornerX && !inSide) {
        const s = Math.sign(b.z)
        b.z = s * (HZ - R)
        if (b.vz * s > 0) {
          const sp = Math.abs(b.vz)
          b.vz = -b.vz * RAIL_E
          b.vx *= 0.96
          if (sp > 0.05) sim.events.push({ type: 'rail', speed: sp, x: b.x, z: b.z, n: b.n })
          if (b.n === 0 || sim.firstHit >= 0) sim.railAfter = true
        }
      }
      if (Math.abs(b.x) > HX - R && !inCornerZ) {
        const s = Math.sign(b.x)
        b.x = s * (HX - R)
        if (b.vx * s > 0) {
          const sp = Math.abs(b.vx)
          b.vx = -b.vx * RAIL_E
          b.vz *= 0.96
          if (sp > 0.05) sim.events.push({ type: 'rail', speed: sp, x: b.x, z: b.z, n: b.n })
          if (b.n === 0 || sim.firstHit >= 0) sim.railAfter = true
        }
      }
      // jaws: never let a ball escape the table through a mouth; steer it into the nearest pocket
      if (Math.abs(b.x) > HX + 0.02 || Math.abs(b.z) > HZ + 0.04) {
        let best = 0
        let bd = Infinity
        POCKETS.forEach(([px, pz], i) => {
          const d = Math.hypot(b.x - px, b.z - pz)
          if (d < bd) {
            bd = d
            best = i
          }
        })
        const [px, pz] = POCKETS[best]
        const sp = Math.max(0.3, Math.hypot(b.vx, b.vz))
        b.vx = ((px - b.x) / (bd || 1)) * sp
        b.vz = ((pz - b.z) / (bd || 1)) * sp
      }
    }
  }
  rack()
  return sim
}

// A simple shot picker (bots and the AI): try every legal target into every
// pocket, score by cut angle, distance and blockers; noise by skill (0..1).
export function pickShot(sim, legal, skill = 0.6) {
  const c = sim.balls[0]
  let best = null
  for (const b of sim.balls) {
    if (!b.on || b.n === 0 || !legal(b.n)) continue
    for (const [px, pz] of POCKETS) {
      // ghost ball: where the cue ball must be at contact
      const tx = px - b.x
      const tz = pz - b.z
      const td = Math.hypot(tx, tz)
      const gx = b.x - (tx / td) * 2 * R
      const gz = b.z - (tz / td) * 2 * R
      const ax = gx - c.x
      const az = gz - c.z
      const ad = Math.hypot(ax, az)
      const cut = Math.acos(Math.max(-1, Math.min(1, (ax * tx + az * tz) / (ad * td || 1))))
      if (cut > 1.35) continue
      let blocked = 0
      for (const o of sim.balls) {
        if (!o.on || o.n === 0 || o === b) continue
        blocked += segBlock(c.x, c.z, gx, gz, o.x, o.z) + segBlock(b.x, b.z, px, pz, o.x, o.z)
      }
      const score = -cut * 1.6 - ad * 0.25 - td * 0.35 - blocked * 3
      if (!best || score > best.score) best = { score, angle: Math.atan2(az, ax), dist: ad + td, target: b.n }
    }
  }
  if (!best) {
    // nothing pottable: just hit the nearest legal ball
    let nb = null
    let nd = Infinity
    for (const b of sim.balls) {
      if (!b.on || b.n === 0 || !legal(b.n)) continue
      const d = Math.hypot(b.x - c.x, b.z - c.z)
      if (d < nd) {
        nd = d
        nb = b
      }
    }
    if (!nb) return { angle: Math.random() * Math.PI * 2, speed: 2, target: -1 }
    best = { score: -9, angle: Math.atan2(nb.z - c.z, nb.x - c.x), dist: nd, target: nb.n }
  }
  const noise = (1 - skill) * 0.06
  return { angle: best.angle + (Math.random() - 0.5) * noise, speed: Math.min(5.5, 1.6 + best.dist * 1.15 + Math.random() * 0.6), target: best.target, score: best.score }
}
function segBlock(ax, az, bx, bz, ox, oz) {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz
  if (l2 === 0) return 0
  const t = Math.max(0, Math.min(1, ((ox - ax) * dx + (oz - az) * dz) / l2))
  const d = Math.hypot(ax + dx * t - ox, az + dz * t - oz)
  return d < R * 2 ? 1 : 0
}
