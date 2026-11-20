// Canvas painters for the rooftop hub: floor tiles, wood, felt, pool balls,
// pad decals, chevrons, flags, leaderboards and signs. Drawn once at load.
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
import { fbm, heightToNormal, mulberry32 } from '../textures.js'

function canvas(w, h = w) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}
const hexRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export const FONT = (px, weight = 700) => `${weight} ${px}px Fredoka, "Arial Black", sans-serif`

export function tex(c, { repeat = [1, 1], srgb = true, anisotropy = 8 } = {}) {
  const t = new CanvasTexture(c)
  t.wrapS = t.wrapT = RepeatWrapping
  t.repeat.set(repeat[0], repeat[1])
  t.anisotropy = anisotropy
  if (srgb) t.colorSpace = SRGBColorSpace
  return t
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// --- Floor: big glazed tiles with soft marble clouding and fine grout ----------
export function paintFloor(base, grout, size = 512, perSide = 2) {
  const rand = mulberry32(31)
  const cloud = fbm(size, 4, 5, 77)
  const vein = fbm(size, 8, 3, 78)
  const tile = size / perSide
  const b = hexRgb(base)
  const g = hexRgb(grout)
  const tints = Array.from({ length: perSide * perSide }, () => 0.94 + rand() * 0.08)
  const heights = new Float32Array(size * size)
  const color = canvas(size)
  const ctx = color.getContext('2d')
  const img = ctx.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const lx = x % tile
      const ly = y % tile
      const edge = Math.min(lx, ly, tile - 1 - lx, tile - 1 - ly)
      let r, gg, bb
      if (edge < 2) {
        r = g[0]; gg = g[1]; bb = g[2]
        heights[i] = 0
      } else {
        const t = tints[Math.floor(y / tile) * perSide + Math.floor(x / tile)]
        const v = Math.abs(vein[i] - 0.5) < 0.015 ? 0.93 : 1 // thin marble veins
        const s = t * (0.95 + cloud[i] * 0.09) * v
        r = b[0] * s; gg = b[1] * s; bb = b[2] * s
        heights[i] = Math.min(1, (edge - 2) / 5) * 0.8 + cloud[i] * 0.05
      }
      img.data[i * 4] = r
      img.data[i * 4 + 1] = gg
      img.data[i * 4 + 2] = bb
      img.data[i * 4 + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return { color, normal: heightToNormal(heights, size, 2.2) }
}

// --- Wood: long grain streaks along U ------------------------------------------
export function paintWood(base = '#5a2f1c', size = 256, seed = 5) {
  const warp = fbm(size, 4, 3, seed)
  const fine = fbm(size, 32, 2, seed + 3)
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const b = hexRgb(base)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const ring = 0.5 + 0.5 * Math.sin((y + warp[i] * 60) * 0.35)
      const s = 0.8 + ring * 0.22 + (fine[i] - 0.5) * 0.12
      img.data[i * 4] = Math.min(255, b[0] * s)
      img.data[i * 4 + 1] = Math.min(255, b[1] * s)
      img.data[i * 4 + 2] = Math.min(255, b[2] * s)
      img.data[i * 4 + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  return c
}

// --- Felt: fine napped cloth ------------------------------------------------------
export function paintFelt(base, size = 256) {
  const n = fbm(size, 64, 2, 21)
  const m = fbm(size, 6, 3, 22)
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const img = ctx.createImageData(size, size)
  const b = hexRgb(base)
  for (let i = 0; i < size * size; i++) {
    const s = 0.9 + (n[i] - 0.5) * 0.16 + (m[i] - 0.5) * 0.08
    img.data[i * 4] = Math.min(255, b[0] * s)
    img.data[i * 4 + 1] = Math.min(255, b[1] * s)
    img.data[i * 4 + 2] = Math.min(255, b[2] * s)
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  return c
}

// --- Pool balls: equirect maps (u around, v pole to pole) ----------------------
export const BALL_COLORS = ['#f7f3e8', '#f2c500', '#1446c8', '#d6231e', '#5a2ca0', '#f06d10', '#137a3c', '#7a1622', '#141414']
export function ballColor(n) {
  return n === 0 ? BALL_COLORS[0] : BALL_COLORS[n > 8 ? n - 8 : n]
}
export function paintBall(n, w = 256, h = 128) {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')
  const col = ballColor(n)
  const stripe = n > 8
  ctx.fillStyle = stripe || n === 0 ? '#f7f3e8' : col
  ctx.fillRect(0, 0, w, h)
  if (stripe) {
    ctx.fillStyle = col
    ctx.fillRect(0, h * 0.28, w, h * 0.44)
  }
  if (n === 0) {
    // cue ball: a faint red dot (like a measles training mark), mostly plain
    ctx.fillStyle = '#d23a2a'
    for (const u of [0.25, 0.75]) {
      ctx.beginPath()
      ctx.ellipse(w * u, h / 2, w * 0.012, h * 0.025, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    return c
  }
  for (const u of [0.25, 0.75]) {
    // equirect: a circle on the sphere is wider than tall on the map
    ctx.fillStyle = '#fbf8ef'
    ctx.beginPath()
    ctx.ellipse(w * u, h / 2, w * 0.06, h * 0.13, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#111'
    ctx.font = FONT(h * 0.17)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.save()
    ctx.translate(w * u, h / 2 + 1)
    ctx.scale(0.62, 1)
    ctx.fillText(String(n), 0, 0)
    ctx.restore()
  }
  return c
}

// --- Chevron on the floor (points toward +V = canvas top) ---------------------
export function paintChevron(size = 128) {
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const s = size
  const path = () => {
    ctx.beginPath()
    ctx.moveTo(s * 0.12, s * 0.78)
    ctx.lineTo(s * 0.5, s * 0.3)
    ctx.lineTo(s * 0.88, s * 0.78)
    ctx.lineTo(s * 0.7, s * 0.78)
    ctx.lineTo(s * 0.5, s * 0.52)
    ctx.lineTo(s * 0.3, s * 0.78)
    ctx.closePath()
  }
  ctx.lineJoin = 'round'
  path()
  ctx.lineWidth = s * 0.07
  ctx.strokeStyle = 'rgba(40,40,60,0.85)'
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.fill()
  return c
}
// Big end arrow (filled triangle with outline).
export function paintTriangle(size = 128) {
  const c = canvas(size)
  const ctx = c.getContext('2d')
  ctx.beginPath()
  ctx.moveTo(size * 0.5, size * 0.1)
  ctx.lineTo(size * 0.9, size * 0.85)
  ctx.lineTo(size * 0.1, size * 0.85)
  ctx.closePath()
  ctx.lineJoin = 'round'
  ctx.lineWidth = size * 0.07
  ctx.strokeStyle = 'rgba(30,30,50,0.9)'
  ctx.stroke()
  ctx.fillStyle = '#fff'
  ctx.fill()
  return c
}

// --- Pad decal: big outlined text, white, tinted by the material ------------------
// lines: [{ text, size }], drawn rotated so they read from the aisle (+Z side).
export function drawPadDecal(c, lines, opts = {}) {
  const ctx = c.getContext('2d')
  const w = c.width
  const h = c.height
  ctx.clearRect(0, 0, w, h)
  // translucent fill + double border
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  roundRect(ctx, 10, 10, w - 20, h - 20, h * 0.16)
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'
  ctx.stroke()
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate(opts.tilt ?? -0.16)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  let y = -((lines.length - 1) * h * 0.2) / 2
  for (const l of lines) {
    ctx.font = FONT(h * l.size)
    ctx.lineWidth = h * l.size * 0.16
    ctx.strokeStyle = 'rgba(20,30,70,0.9)'
    ctx.strokeText(l.text, 0, y)
    ctx.fillStyle = '#ffffff'
    ctx.fillText(l.text, 0, y)
    y += h * 0.33
  }
  ctx.restore()
  if (opts.badge) {
    // centre badge on the seam between the two team halves (drawn by the caller's layout)
  }
}
// Badge (e.g. "2v2") in a dark pill, for the seam between team pads.
export function paintBadge(text, w = 256, h = 128) {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#16244f'
  roundRect(ctx, 6, 14, w - 12, h - 28, (h - 28) / 2)
  ctx.fill()
  ctx.lineWidth = 6
  ctx.strokeStyle = '#ffffff'
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  ctx.font = FONT(h * 0.5)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, w / 2, h / 2 + 3)
  return c
}

// Rounded-rect outline (the hologram rings of a pad), white on transparent.
export function paintOutline(w = 512, h = 256, line = 14) {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')
  roundRect(ctx, line, line, w - line * 2, h - line * 2, h * 0.18)
  ctx.lineWidth = line
  ctx.strokeStyle = '#ffffff'
  ctx.shadowColor = '#ffffff'
  ctx.shadowBlur = line
  ctx.stroke()
  return c
}

// --- Flags (simplified, for name tags and boards) --------------------------------
function star(ctx, cx, cy, r, points = 5, inner = 0.45) {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points
    const rr = i % 2 ? r * inner : r
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath()
  ctx.fill()
}
function bandsH(ctx, x, y, w, h, cols, weights) {
  const total = weights ? weights.reduce((a, b) => a + b, 0) : cols.length
  let yy = y
  cols.forEach((c, i) => {
    const hh = (h * (weights ? weights[i] : 1)) / total
    ctx.fillStyle = c
    ctx.fillRect(x, yy, w, hh + 0.5)
    yy += hh
  })
}
function bandsV(ctx, x, y, w, h, cols, weights) {
  const total = weights ? weights.reduce((a, b) => a + b, 0) : cols.length
  let xx = x
  cols.forEach((c, i) => {
    const ww = (w * (weights ? weights[i] : 1)) / total
    ctx.fillStyle = c
    ctx.fillRect(xx, y, ww + 0.5, h)
    xx += ww
  })
}
export const COUNTRIES = {
  PH: 'Philippines', US: 'United States', BR: 'Brazil', ID: 'Indonesia', TH: 'Thailand', MY: 'Malaysia', MX: 'Mexico', GB: 'United Kingdom', LK: 'Sri Lanka', IN: 'India',
  JP: 'Japan', DE: 'Germany', FR: 'France', CA: 'Canada', VN: 'Vietnam', ES: 'Spain', IT: 'Italy', KR: 'South Korea', TR: 'Turkey', PL: 'Poland',
}
export function drawFlag(ctx, code, x, y, w, h) {
  ctx.save()
  roundRect(ctx, x, y, w, h, h * 0.12)
  ctx.clip()
  const cx = x + w / 2
  const cy = y + h / 2
  switch (code) {
    case 'PH':
      bandsH(ctx, x, y, w, h, ['#0038a8', '#ce1126'])
      ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + h * 0.87, cy); ctx.lineTo(x, y + h); ctx.fill()
      ctx.fillStyle = '#fcd116'; ctx.beginPath(); ctx.arc(x + h * 0.3, cy, h * 0.12, 0, 7); ctx.fill()
      break
    case 'US': {
      const cols = []
      for (let i = 0; i < 13; i++) cols.push(i % 2 ? '#fff' : '#b22234')
      bandsH(ctx, x, y, w, h, cols)
      ctx.fillStyle = '#3c3b6e'; ctx.fillRect(x, y, w * 0.42, h * 0.54)
      ctx.fillStyle = '#fff'
      for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + w * (0.05 + k * 0.08), y + h * (0.08 + r * 0.13), h * 0.025, 0, 7); ctx.fill() }
      break
    }
    case 'BR':
      ctx.fillStyle = '#009b3a'; ctx.fillRect(x, y, w, h)
      ctx.fillStyle = '#fedf00'; ctx.beginPath(); ctx.moveTo(cx, y + h * 0.1); ctx.lineTo(x + w * 0.92, cy); ctx.lineTo(cx, y + h * 0.9); ctx.lineTo(x + w * 0.08, cy); ctx.fill()
      ctx.fillStyle = '#002776'; ctx.beginPath(); ctx.arc(cx, cy, h * 0.24, 0, 7); ctx.fill()
      break
    case 'ID': bandsH(ctx, x, y, w, h, ['#ce1126', '#fff']); break
    case 'PL': bandsH(ctx, x, y, w, h, ['#fff', '#dc143c']); break
    case 'TH': bandsH(ctx, x, y, w, h, ['#a51931', '#f4f5f8', '#2d2a4a', '#f4f5f8', '#a51931'], [1, 1, 2, 1, 1]); break
    case 'MY': {
      const cols = []
      for (let i = 0; i < 14; i++) cols.push(i % 2 ? '#fff' : '#cc0001')
      bandsH(ctx, x, y, w, h, cols)
      ctx.fillStyle = '#010066'; ctx.fillRect(x, y, w * 0.5, h * 0.57)
      ctx.fillStyle = '#fc0'; ctx.beginPath(); ctx.arc(x + w * 0.2, y + h * 0.28, h * 0.17, 0, 7); ctx.fill()
      ctx.fillStyle = '#010066'; ctx.beginPath(); ctx.arc(x + w * 0.24, y + h * 0.28, h * 0.14, 0, 7); ctx.fill()
      ctx.fillStyle = '#fc0'; star(ctx, x + w * 0.36, y + h * 0.28, h * 0.12, 7)
      break
    }
    case 'MX':
      bandsV(ctx, x, y, w, h, ['#006847', '#fff', '#ce1126'])
      ctx.fillStyle = '#8c5a2b'; ctx.beginPath(); ctx.arc(cx, cy, h * 0.13, 0, 7); ctx.fill()
      break
    case 'GB':
      ctx.fillStyle = '#012169'; ctx.fillRect(x, y, w, h)
      ctx.strokeStyle = '#fff'; ctx.lineWidth = h * 0.2
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke()
      ctx.strokeStyle = '#c8102e'; ctx.lineWidth = h * 0.07; ctx.stroke()
      ctx.fillStyle = '#fff'; ctx.fillRect(cx - h * 0.17, y, h * 0.34, h); ctx.fillRect(x, cy - h * 0.17, w, h * 0.34)
      ctx.fillStyle = '#c8102e'; ctx.fillRect(cx - h * 0.1, y, h * 0.2, h); ctx.fillRect(x, cy - h * 0.1, w, h * 0.2)
      break
    case 'LK':
      ctx.fillStyle = '#ffbe29'; ctx.fillRect(x, y, w, h)
      ctx.fillStyle = '#00534e'; ctx.fillRect(x + w * 0.05, y + h * 0.08, w * 0.12, h * 0.84)
      ctx.fillStyle = '#eb7400'; ctx.fillRect(x + w * 0.17, y + h * 0.08, w * 0.12, h * 0.84)
      ctx.fillStyle = '#8d153a'; ctx.fillRect(x + w * 0.33, y + h * 0.08, w * 0.62, h * 0.84)
      ctx.fillStyle = '#ffbe29'; ctx.beginPath(); ctx.ellipse(x + w * 0.64, cy, w * 0.12, h * 0.2, 0, 0, 7); ctx.fill()
      break
    case 'IN':
      bandsH(ctx, x, y, w, h, ['#ff9933', '#fff', '#138808'])
      ctx.strokeStyle = '#000080'; ctx.lineWidth = Math.max(1, h * 0.04); ctx.beginPath(); ctx.arc(cx, cy, h * 0.13, 0, 7); ctx.stroke()
      break
    case 'JP':
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h)
      ctx.fillStyle = '#bc002d'; ctx.beginPath(); ctx.arc(cx, cy, h * 0.3, 0, 7); ctx.fill()
      break
    case 'KR':
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h)
      ctx.fillStyle = '#cd2e3a'; ctx.beginPath(); ctx.arc(cx, cy, h * 0.25, Math.PI, 0); ctx.fill()
      ctx.fillStyle = '#0047a0'; ctx.beginPath(); ctx.arc(cx, cy, h * 0.25, 0, Math.PI); ctx.fill()
      ctx.fillStyle = '#000'
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) ctx.fillRect(cx + dx * w * 0.33 - h * 0.08, cy + dy * h * 0.3 - h * 0.06, h * 0.16, h * 0.12)
      break
    case 'DE': bandsH(ctx, x, y, w, h, ['#000', '#dd0000', '#ffce00']); break
    case 'FR': bandsV(ctx, x, y, w, h, ['#0055a4', '#fff', '#ef4135']); break
    case 'IT': bandsV(ctx, x, y, w, h, ['#009246', '#fff', '#ce2b37']); break
    case 'ES': bandsH(ctx, x, y, w, h, ['#aa151b', '#f1bf00', '#aa151b'], [1, 2, 1]); break
    case 'CA':
      bandsV(ctx, x, y, w, h, ['#d52b1e', '#fff', '#d52b1e'], [1, 2, 1])
      ctx.fillStyle = '#d52b1e'; star(ctx, cx, cy, h * 0.3, 7, 0.55)
      break
    case 'VN':
      ctx.fillStyle = '#da251d'; ctx.fillRect(x, y, w, h)
      ctx.fillStyle = '#ff0'; star(ctx, cx, cy, h * 0.3)
      break
    case 'TR':
      ctx.fillStyle = '#e30a17'; ctx.fillRect(x, y, w, h)
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x + w * 0.38, cy, h * 0.25, 0, 7); ctx.fill()
      ctx.fillStyle = '#e30a17'; ctx.beginPath(); ctx.arc(x + w * 0.43, cy, h * 0.2, 0, 7); ctx.fill()
      ctx.fillStyle = '#fff'; star(ctx, x + w * 0.6, cy, h * 0.12)
      break
    default:
      bandsH(ctx, x, y, w, h, ['#888', '#ccc'])
  }
  ctx.restore()
}
const flagCache = new Map()
export function flagDataUrl(code) {
  if (!flagCache.has(code)) {
    const c = canvas(48, 32)
    drawFlag(c.getContext('2d'), code, 0, 0, 48, 32)
    flagCache.set(code, c.toDataURL())
  }
  return flagCache.get(code)
}

// --- Leaderboard panel --------------------------------------------------------------
function trophy(ctx, x, y, s) {
  ctx.fillStyle = '#f5b301'
  ctx.beginPath()
  ctx.moveTo(x - s * 0.5, y - s * 0.5)
  ctx.lineTo(x + s * 0.5, y - s * 0.5)
  ctx.quadraticCurveTo(x + s * 0.45, y + s * 0.15, x, y + s * 0.2)
  ctx.quadraticCurveTo(x - s * 0.45, y + s * 0.15, x - s * 0.5, y - s * 0.5)
  ctx.fill()
  ctx.fillRect(x - s * 0.08, y + s * 0.15, s * 0.16, s * 0.25)
  ctx.fillRect(x - s * 0.3, y + s * 0.38, s * 0.6, s * 0.12)
}
function globe(ctx, x, y, s) {
  const g = ctx.createRadialGradient(x - s * 0.15, y - s * 0.15, s * 0.05, x, y, s * 0.5)
  g.addColorStop(0, '#7fd1ff')
  g.addColorStop(1, '#1565c0')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(x, y, s * 0.5, 0, 7); ctx.fill()
  ctx.fillStyle = '#43a047'
  ctx.beginPath(); ctx.ellipse(x - s * 0.12, y - s * 0.08, s * 0.18, s * 0.12, 0.6, 0, 7); ctx.fill()
  ctx.beginPath(); ctx.ellipse(x + s * 0.18, y + s * 0.16, s * 0.12, s * 0.08, -0.4, 0, 7); ctx.fill()
}
const MEDALS = ['#f5b301', '#b8c2cc', '#d08a4b']
// rows: [{ name, flag, wins, color }] (players) or [{ flag, name, wins }] (countries)
export function paintBoard(kind, rows, footer, w = 768, h = 1024) {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#e9eef8'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, 18, 18, w - 36, h - 36, 34)
  ctx.fill()
  ctx.lineWidth = 10
  ctx.strokeStyle = '#1b2550'
  ctx.stroke()
  // title
  const icon = kind === 'players' ? trophy : globe
  icon(ctx, 78, 92, 62)
  ctx.font = FONT(64)
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 12
  ctx.strokeStyle = '#1b2550'
  ctx.fillStyle = '#ffffff'
  const title = kind === 'players' ? 'TOP PLAYERS' : 'TOP COUNTRIES'
  ctx.strokeText(title, 128, 94)
  ctx.fillText(title, 128, 94)
  ctx.font = FONT(28, 600)
  ctx.fillStyle = '#4a5578'
  ctx.textAlign = 'right'
  ctx.fillText('Wins', w - 60, 160)
  ctx.textAlign = 'left'
  const top = 190
  const rowH = (h - top - 120) / 10
  rows.slice(0, 10).forEach((r, i) => {
    const y = top + rowH * i + rowH / 2
    if (i % 2 === 0) {
      ctx.fillStyle = '#f1f4fb'
      roundRect(ctx, 40, y - rowH / 2 + 3, w - 80, rowH - 6, 14)
      ctx.fill()
    }
    // rank medal
    ctx.fillStyle = MEDALS[i] ?? '#d5dbea'
    ctx.beginPath(); ctx.arc(74, y, rowH * 0.3, 0, 7); ctx.fill()
    ctx.lineWidth = 4; ctx.strokeStyle = '#1b2550'; ctx.stroke()
    ctx.fillStyle = '#1b2550'
    ctx.font = FONT(rowH * 0.36)
    ctx.textAlign = 'center'
    ctx.fillText(String(i + 1), 74, y + 2)
    ctx.textAlign = 'left'
    let x = 118
    if (kind === 'players') {
      ctx.fillStyle = r.color
      ctx.beginPath(); ctx.arc(x + rowH * 0.28, y, rowH * 0.28, 0, 7); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.8)'
      ctx.beginPath(); ctx.arc(x + rowH * 0.28, y - rowH * 0.06, rowH * 0.1, 0, 7); ctx.fill()
      x += rowH * 0.7
    }
    ctx.font = FONT(rowH * 0.4, 600)
    ctx.fillStyle = '#1b2550'
    const name = r.name.length > 15 ? r.name.slice(0, 14) + '…' : r.name
    if (kind === 'countries') {
      drawFlag(ctx, r.flag, x, y - rowH * 0.2, rowH * 0.6, rowH * 0.4)
      x += rowH * 0.75
      ctx.fillText(name, x, y + 2)
    } else {
      ctx.fillText(name, x, y + 2)
      const nw = ctx.measureText(name).width
      drawFlag(ctx, r.flag, x + nw + 12, y - rowH * 0.15, rowH * 0.45, rowH * 0.3)
    }
    ctx.textAlign = 'right'
    ctx.font = FONT(rowH * 0.4)
    ctx.fillStyle = '#e58a00'
    ctx.fillText(r.wins.toLocaleString('en-US'), w - 60, y + 2)
    trophy(ctx, w - 70 - ctx.measureText(r.wins.toLocaleString('en-US')).width - 20, y, rowH * 0.36)
    ctx.textAlign = 'left'
  })
  // footer
  ctx.fillStyle = '#1b2550'
  roundRect(ctx, 40, h - 108, w - 80, 66, 18)
  ctx.fill()
  ctx.fillStyle = '#fff'
  ctx.font = FONT(30, 600)
  ctx.fillText(footer, 64, h - 74)
  return c
}

// --- Signs -----------------------------------------------------------------------------
// The entrance sign: game title with an 8-ball, on transparent.
export function paintTitleSign(w = 1024, h = 256) {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')
  const draw = () => {
    ctx.clearRect(0, 0, w, h)
    // 8-ball
    const bx = h * 0.55
    const by = h / 2
    const r = h * 0.38
    const g = ctx.createRadialGradient(bx - r * 0.35, by - r * 0.4, r * 0.1, bx, by, r)
    g.addColorStop(0, '#5a5a66')
    g.addColorStop(1, '#09090c')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(bx, by, r, 0, 7); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.beginPath(); ctx.arc(bx, by, r * 0.45, 0, 7); ctx.fill()
    ctx.fillStyle = '#111'
    ctx.font = FONT(r * 0.7)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('8', bx, by + 3)
    // title
    ctx.textAlign = 'left'
    ctx.font = FONT(h * 0.42)
    ctx.lineJoin = 'round'
    ctx.lineWidth = h * 0.08
    ctx.strokeStyle = '#1a1036'
    const tx = h * 1.05
    ctx.strokeText('CRAZY 8 BALL', tx, by + 6)
    const tg = ctx.createLinearGradient(0, by - h * 0.2, 0, by + h * 0.2)
    tg.addColorStop(0, '#fff6c2')
    tg.addColorStop(0.5, '#ffd23d')
    tg.addColorStop(1, '#ff8a1f')
    ctx.fillStyle = tg
    ctx.fillText('CRAZY 8 BALL', tx, by + 6)
  }
  draw()
  return { canvas: c, draw }
}

// One city block (roads round the edge), tiled under the whole city.
export function paintCityBlock(size = 256) {
  const c = canvas(size)
  const ctx = c.getContext('2d')
  const n = fbm(size, 16, 2, 9)
  ctx.fillStyle = '#5d6170'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#b9b8c9' // sidewalk
  ctx.fillRect(size * 0.16, size * 0.16, size * 0.68, size * 0.68)
  ctx.fillStyle = '#9ea7a0' // block interior
  ctx.fillRect(size * 0.2, size * 0.2, size * 0.6, size * 0.6)
  ctx.fillStyle = '#e8e3c8' // lane dashes
  for (let i = 0; i < 8; i++) {
    ctx.fillRect(i * (size / 8) + 4, size * 0.075, size / 16, 2)
    ctx.fillRect(size * 0.075, i * (size / 8) + 4, 2, size / 16)
  }
  const img = ctx.getImageData(0, 0, size, size)
  for (let i = 0; i < size * size; i++) {
    const s = 0.92 + n[i] * 0.12
    img.data[i * 4] *= s
    img.data[i * 4 + 1] *= s
    img.data[i * 4 + 2] *= s
  }
  ctx.putImageData(img, 0, 0)
  return c
}

// Fern frond: a rib with leaflets, white on transparent (tinted by the material).
export function paintFrond(w = 64, h = 256) {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')
  ctx.strokeStyle = '#fff'
  ctx.fillStyle = '#fff'
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(w / 2, h); ctx.lineTo(w / 2, 4); ctx.stroke()
  for (let y = h - 14; y > 8; y -= 9) {
    const t = y / h
    const len = (w / 2 - 3) * Math.sin(Math.PI * Math.min(1, t * 1.05)) * 0.95
    for (const s of [-1, 1]) {
      ctx.beginPath()
      ctx.ellipse(w / 2 + (s * len) / 2, y - 4, len / 2, 3.2, s * -0.35, 0, 7)
      ctx.fill()
    }
  }
  return c
}

// Mystery crate face: "?" on a cream panel with a dark frame.
export function paintCrateFace(size = 256) {
  const c = canvas(size)
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#f2e6d0'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#6b3d22'
  roundRect(ctx, size * 0.12, size * 0.12, size * 0.76, size * 0.76, 18)
  ctx.fill()
  ctx.fillStyle = '#f2e6d0'
  ctx.font = FONT(size * 0.6)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('?', size / 2, size * 0.53)
  return c
}
