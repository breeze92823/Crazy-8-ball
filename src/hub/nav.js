// Walkability grid over the roof and A* paths on it, for the bots and the guide
// arrow. Obstacles are axis-aligned rectangles (inflated by the walker radius)
// or circles; a path is string-pulled to the fewest straight legs.
import { ROOF } from '../config.js'

const CELL = 0.5
const X0 = -ROOF.halfX
const Z0 = ROOF.minZ
const NX = Math.ceil((ROOF.halfX * 2) / CELL)
const NZ = Math.ceil((ROOF.maxZ - ROOF.minZ) / CELL)
const blocked = new Uint8Array(NX * NZ)
const INFLATE = 0.55

const cx = (x) => Math.max(0, Math.min(NX - 1, Math.floor((x - X0) / CELL)))
const cz = (z) => Math.max(0, Math.min(NZ - 1, Math.floor((z - Z0) / CELL)))
const wx = (i) => X0 + (i + 0.5) * CELL
const wz = (k) => Z0 + (k + 0.5) * CELL

export const obstacles = [] // { x, z, hx, hz } or { x, z, r }
export function blockRect(x, z, hx, hz) {
  obstacles.push({ x, z, hx, hz })
  for (let k = cz(z - hz - INFLATE); k <= cz(z + hz + INFLATE); k++) for (let i = cx(x - hx - INFLATE); i <= cx(x + hx + INFLATE); i++) blocked[k * NX + i] = 1
}
export function blockCircle(x, z, r) {
  obstacles.push({ x, z, r })
  const rr = r + INFLATE
  for (let k = cz(z - rr); k <= cz(z + rr); k++) for (let i = cx(x - rr); i <= cx(x + rr); i++) if (Math.hypot(wx(i) - x, wz(k) - z) <= rr) blocked[k * NX + i] = 1
}
// border margin
export function initNav() {
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) if (i < 2 || k < 2 || i >= NX - 2 || k >= NZ - 2) blocked[k * NX + i] = 1
}
export const walkable = (x, z) => x > X0 && x < -X0 && z > Z0 && z < ROOF.maxZ && !blocked[cz(z) * NX + cx(x)]

function nearestFree(i, k) {
  if (!blocked[k * NX + i]) return [i, k]
  for (let r = 1; r < 12; r++) {
    for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dk)) !== r) continue
      const ii = i + di
      const kk = k + dk
      if (ii < 0 || kk < 0 || ii >= NX || kk >= NZ) continue
      if (!blocked[kk * NX + ii]) return [ii, kk]
    }
  }
  return [i, k]
}

// Line of sight across free cells (supercover-ish sampling).
function clear(ax, az, bx, bz) {
  const d = Math.hypot(bx - ax, bz - az)
  const n = Math.ceil(d / (CELL * 0.5))
  for (let s = 1; s < n; s++) {
    const t = s / n
    if (blocked[cz(az + (bz - az) * t) * NX + cx(ax + (bx - ax) * t)]) return false
  }
  return true
}

// Binary heap of cell indices keyed by f.
const g = new Float32Array(NX * NZ)
const f = new Float32Array(NX * NZ)
const from = new Int32Array(NX * NZ)
const stamp = new Uint32Array(NX * NZ)
const closed = new Uint32Array(NX * NZ)
let gen = 0
const heap = []
function push(n) {
  heap.push(n)
  let i = heap.length - 1
  while (i > 0) {
    const p = (i - 1) >> 1
    if (f[heap[p]] <= f[n]) break
    heap[i] = heap[p]
    i = p
  }
  heap[i] = n
}
function pop() {
  const top = heap[0]
  const last = heap.pop()
  if (heap.length) {
    let i = 0
    for (;;) {
      const l = i * 2 + 1
      const r = l + 1
      let m = i
      let mf = f[last]
      if (l < heap.length && f[heap[l]] < mf) {
        m = l
        mf = f[heap[l]]
      }
      if (r < heap.length && f[heap[r]] < mf) m = r
      if (m === i) break
      heap[i] = heap[m]
      i = m
    }
    heap[i] = last
  }
  return top
}

// Returns [[x, z], ...] from start to goal (inclusive), or null.
export function findPath(sx, sz, gx, gz) {
  if (clear(sx, sz, gx, gz) && walkable(sx, sz)) return [[sx, sz], [gx, gz]]
  gen++
  heap.length = 0
  const [si, sk] = nearestFree(cx(sx), cz(sz))
  const [gi, gk] = nearestFree(cx(gx), cz(gz))
  const start = sk * NX + si
  const goal = gk * NX + gi
  const h = (n) => {
    const dx = Math.abs((n % NX) - gi)
    const dz = Math.abs(Math.floor(n / NX) - gk)
    return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)) * CELL
  }
  stamp[start] = gen
  g[start] = 0
  f[start] = h(start)
  from[start] = -1
  push(start)
  let found = false
  let iters = 0
  while (heap.length && iters++ < 20000) {
    const n = pop()
    if (n === goal) {
      found = true
      break
    }
    if (closed[n] === gen) continue
    closed[n] = gen
    const i = n % NX
    const k = (n - i) / NX
    for (let dk = -1; dk <= 1; dk++) for (let di = -1; di <= 1; di++) {
      if (!di && !dk) continue
      const ii = i + di
      const kk = k + dk
      if (ii < 0 || kk < 0 || ii >= NX || kk >= NZ) continue
      const m = kk * NX + ii
      if (blocked[m] || closed[m] === gen) continue
      if (di && dk && (blocked[k * NX + ii] || blocked[kk * NX + i])) continue // no corner cutting
      const cost = g[n] + (di && dk ? 1.414 : 1) * CELL
      if (stamp[m] !== gen || cost < g[m]) {
        stamp[m] = gen
        g[m] = cost
        f[m] = cost + h(m)
        from[m] = n
        push(m)
      }
    }
  }
  if (!found) return null
  const cells = []
  for (let n = goal; n !== -1; n = from[n]) cells.push([wx(n % NX), wz(Math.floor(n / NX))])
  cells.reverse()
  cells[0] = [sx, sz]
  cells.push([gx, gz])
  // string-pull
  const out = [cells[0]]
  let a = 0
  while (a < cells.length - 1) {
    let b = cells.length - 1
    while (b > a + 1 && !clear(cells[a][0], cells[a][1], cells[b][0], cells[b][1])) b--
    out.push(cells[b])
    a = b
  }
  return out
}

// A random free point (optionally inside a rectangle).
export function randomFree(rand = Math.random, area = null) {
  for (let t = 0; t < 60; t++) {
    const x = area ? area.x0 + rand() * (area.x1 - area.x0) : X0 + 2 + rand() * (-X0 * 2 - 4)
    const z = area ? area.z0 + rand() * (area.z1 - area.z0) : Z0 + 2 + rand() * (ROOF.maxZ - Z0 - 4)
    if (walkable(x, z)) return [x, z]
  }
  return [0, 20]
}
