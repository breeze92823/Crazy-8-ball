// Procedural 3D models for the rooftop hub. Every builder returns a Group with
// its origin on the floor at the prop's centre, +Z = its front. Static props are
// later baked (bake.js) into a handful of meshes per material.
import {
  BoxGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Path,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { TABLE } from '../config.js'
import { neon, put } from '../propkit.js'
import { mulberry32 } from '../textures.js'
import { paintCrateFace, paintFelt, paintFrond, paintWood, tex } from './paint.js'

// --- Shared materials -----------------------------------------------------------------
const cache = new Map()
function mat(key, make) {
  if (!cache.has(key)) cache.set(key, make())
  return cache.get(key)
}
const std = (color, rough = 0.7, extra = {}) => mat(`std${color}${rough}${JSON.stringify(extra)}`, () => new MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra }))
export const M = {
  wood: () => mat('wood', () => new MeshPhysicalMaterial({ map: tex(paintWood(TABLE.wood, 256, 5), { repeat: [2, 1] }), roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.18 })),
  woodLight: () => mat('woodL', () => new MeshPhysicalMaterial({ map: tex(paintWood(TABLE.woodLight, 256, 8), { repeat: [2, 1] }), roughness: 0.5, clearcoat: 0.5, clearcoatRoughness: 0.25 })),
  walnut: () => mat('walnut', () => new MeshStandardMaterial({ map: tex(paintWood('#3c2416', 256, 11), { repeat: [1, 3] }), roughness: 0.6 })),
  teak: () => mat('teak', () => new MeshStandardMaterial({ map: tex(paintWood('#8a5a34', 256, 13), { repeat: [1, 2] }), roughness: 0.65 })),
  felt: (color) => mat(`felt${color}`, () => new MeshStandardMaterial({ color: '#ffffff', map: tex(paintFelt(color), { repeat: [3, 2] }), roughness: 0.95 })),
  cushion: (color) => mat(`cush${color}`, () => new MeshStandardMaterial({ color: new Color(color).multiplyScalar(0.86), roughness: 0.9 })),
  pocket: () => std('#060606', 0.9),
  leather: () => std('#24150d', 0.5),
  brass: () => mat('brass', () => new MeshStandardMaterial({ color: '#d8b35e', roughness: 0.28, metalness: 1 })),
  steel: () => mat('steel', () => new MeshStandardMaterial({ color: '#b9bec8', roughness: 0.3, metalness: 1 })),
  dark: () => std('#1e1f24', 0.55),
  pearl: () => std('#f7f2e6', 0.25),
  fabric: () => std('#f3ede2', 0.95),
  black: () => mat('gloss', () => new MeshPhysicalMaterial({ color: '#0a0a0c', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 })),
  soil: () => std('#2e2119', 1),
  stone: () => std('#a69c95', 0.95, { flatShading: true }),
  bark: () => std('#4a3328', 0.95),
}

// --- Geometry helpers -------------------------------------------------------------------
// Top-view outline [[x, z], ...] extruded up from y = 0 to `height`.
export function prism(points, height, { bevel = 0, holes = [] } = {}) {
  const s = new Shape()
  points.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)))
  s.closePath()
  for (const h of holes) {
    const p = new Path()
    h.forEach(([x, z], i) => (i ? p.lineTo(x, -z) : p.moveTo(x, -z)))
    p.closePath()
    s.holes.push(p)
  }
  const g = new ExtrudeGeometry(s, { depth: height, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 })
  g.rotateX(-Math.PI / 2)
  return g
}
// Rounded rectangle outline, half extents hx/hz, corner radius r.
export function roundedRectPts(hx, hz, r, seg = 4) {
  const pts = []
  const corners = [[hx - r, hz - r, 0], [-hx + r, hz - r, Math.PI / 2], [-hx + r, -hz + r, Math.PI], [hx - r, -hz + r, Math.PI * 1.5]]
  for (const [cx, cz, a0] of corners) {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (i / seg) * (Math.PI / 2)
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r])
    }
  }
  return pts
}
// A tube along a curve that narrows from r0 to r1 (trunks, branches).
export function taperTube(points, r0, r1, segs = 10, radial = 7) {
  const curve = new CatmullRomCurve3(points)
  const g = new TubeGeometry(curve, segs, 1, radial, false)
  const pos = g.attributes.position
  const v = new Vector3()
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const c = curve.getPointAt(t)
    const r = r0 + (r1 - r0) * t
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c)
      pos.setXYZ(k, v.x, v.y, v.z)
    }
  }
  g.computeVertexNormals()
  return g
}
function box(parent, w, h, d, material, x, y, z) {
  return put(parent, new BoxGeometry(w, h, d), material, x, y, z)
}

// --- Pool table -----------------------------------------------------------------------
// Bed top is TABLE_BED_Y; the playing area is bedL x bedW inside the cushion noses.
export const TABLE_BED_Y = 0.88
export function buildPoolTable(feltColor) {
  const g = new Group()
  const hx = TABLE.bedL / 2
  const hz = TABLE.bedW / 2
  const cw = 0.09 // cushion depth
  const ox = TABLE.length / 2
  const oz = TABLE.width / 2
  const felt = M.felt(feltColor)
  const wood = M.wood()

  // slate bed with felt
  box(g, (hx + cw) * 2, 0.06, (hz + cw) * 2, felt, 0, TABLE_BED_Y - 0.03, 0)
  // varnished rails: a rounded frame round the cushions
  const rail = put(g, prism(roundedRectPts(ox - 0.015, oz - 0.015, 0.12), 0.1, { bevel: 0.015, holes: [roundedRectPts(hx + cw, hz + cw, 0.001, 1)] }), wood, 0, 0.845, 0)
  rail.castShadow = true
  // apron / skirt with a bead line
  box(g, ox * 2 - 0.16, 0.2, oz * 2 - 0.16, wood, 0, 0.73, 0)
  box(g, ox * 2 - 0.12, 0.025, oz * 2 - 0.12, M.brass(), 0, 0.64, 0)
  box(g, ox * 2 - 0.1, 0.05, oz * 2 - 0.1, M.woodLight(), 0, 0.615, 0)

  // cushions: six segments with angled pocket jaws
  const cush = M.cushion(feltColor)
  const j = 0.075
  const H = 0.05
  const seg = (a, b, side) => {
    const local = [[a, 0], [b, 0], [b + j, cw], [a - j, cw]]
    const pts = local.map(([u, v]) => {
      if (side === 'pz') return [u, hz + v]
      if (side === 'nz') return [u, -(hz + v)]
      if (side === 'px') return [hx + v, u]
      return [-(hx + v), u]
    })
    put(g, prism(pts, H), cush, 0, TABLE_BED_Y, 0, false)
  }
  const cm = 0.13 // corner mouth
  const sm = 0.11 // side mouth
  for (const side of ['pz', 'nz']) {
    seg(-hx + cm, -sm, side)
    seg(sm, hx - cm, side)
  }
  for (const side of ['px', 'nx']) seg(-hz + cm, hz - cm, side)

  // pockets: leather cap + black hole on top of the rail
  const pockets = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]
  for (const [sx, sz] of pockets) {
    const corner = sx !== 0
    const px = corner ? sx * (hx + 0.045) : 0
    const pz = sz * (hz + (corner ? 0.045 : 0.075))
    const cap = put(g, new CylinderGeometry(corner ? 0.16 : 0.145, corner ? 0.16 : 0.145, 0.13, 20), M.leather(), px, 0.905, pz)
    cap.castShadow = false
    put(g, new CylinderGeometry(corner ? 0.112 : 0.1, corner ? 0.1 : 0.09, 0.28, 18), M.pocket(), px, 0.835, pz, false)
    // chrome lip on the outside of the cap
    const lip = put(g, new TorusGeometry(corner ? 0.16 : 0.145, 0.012, 6, 20), M.brass(), px, 0.97, pz, false)
    lip.rotation.x = Math.PI / 2
  }

  // diamond sights
  const dGeo = new BoxGeometry(0.03, 0.006, 0.03)
  const railMidZ = hz + cw + (oz - hz - cw) / 2
  const railMidX = hx + cw + (ox - hx - cw) / 2
  for (const sz of [-1, 1]) for (const x of [-1.35, -0.9, -0.45, 0.45, 0.9, 1.35]) {
    const d = put(g, dGeo, M.pearl(), (x * hx) / 1.8, 0.962, sz * railMidZ, false)
    d.rotation.y = Math.PI / 4
  }
  for (const sx of [-1, 1]) for (const z of [-0.45, 0, 0.45]) {
    const d = put(g, dGeo, M.pearl(), sx * railMidX, 0.962, z, false)
    d.rotation.y = Math.PI / 4
  }

  // turned legs (lathe) with corner blocks
  const prof = [[0, 0], [0.12, 0], [0.125, 0.035], [0.095, 0.06], [0.075, 0.12], [0.105, 0.24], [0.12, 0.32], [0.085, 0.44], [0.066, 0.52], [0.098, 0.56], [0.098, 0.63], [0, 0.63]].map(([r, y]) => new Vector2(r, y))
  const legGeo = new LatheGeometry(prof, 14)
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) {
    const lx = sx * (ox - 0.32)
    const lz = sz * (oz - 0.3)
    put(g, legGeo, wood, lx, 0, lz)
    box(g, 0.24, 0.05, 0.24, M.brass(), lx, 0.012, lz) // brass foot cup
  }
  // brass name plate on each end
  for (const sx of [-1, 1]) box(g, 0.02, 0.07, 0.34, M.brass(), sx * (ox - 0.075), 0.74, 0)
  return g
}

// Cue stick along +Y, butt at 0, tip at `len`.
export function buildCue(len = 1.45) {
  const g = new Group()
  const parts = [
    [0, 0.012, 0.0165, 0.0165, M.dark()], // bumper
    [0.012, 0.42, 0.0165, 0.0145, M.walnut()], // butt
    [0.42, 0.66, 0.0145, 0.0135, M.dark()], // wrap
    [0.66, 0.68, 0.0135, 0.0133, M.brass()], // joint
    [0.68, len - 0.02, 0.0133, 0.0068, std('#e7cd98', 0.45)], // maple shaft
    [len - 0.02, len - 0.006, 0.0068, 0.0066, std('#fbfaf5', 0.3)], // ferrule
    [len - 0.006, len, 0.0066, 0.006, std('#2f5fd0', 0.9)], // chalked tip
  ]
  for (const [a, b, r0, r1, m] of parts) {
    const c = new Mesh(new CylinderGeometry(r1, r0, b - a, 10), m)
    c.position.y = (a + b) / 2
    c.castShadow = true
    g.add(c)
  }
  return g
}

// --- Lounge furniture -----------------------------------------------------------------
const PILLOWS = ['#2a5db0', '#f08a24', '#8f97a3', '#e7c25a', '#2a5db0', '#e0e0e0']
export function buildSofa(len = 3, seed = 1) {
  const rand = mulberry32(seed)
  const g = new Group()
  const f = M.fabric()
  put(g, new RoundedBoxGeometry(len, 0.4, 0.95, 2, 0.06), M.fabric(), 0, 0.2, 0)
  put(g, new BoxGeometry(len - 0.1, 0.08, 0.8), M.dark(), 0, 0.04, 0)
  const n = Math.max(1, Math.round((len - 0.4) / 0.85))
  const cw = (len - 0.4) / n
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + 0.2 + cw * (i + 0.5)
    put(g, new RoundedBoxGeometry(cw - 0.03, 0.17, 0.78, 3, 0.07), f, x, 0.48, 0.06)
    const back = put(g, new RoundedBoxGeometry(cw - 0.03, 0.52, 0.2, 3, 0.08), f, x, 0.76, -0.36)
    back.rotation.x = -0.14
  }
  for (const s of [-1, 1]) put(g, new RoundedBoxGeometry(0.2, 0.62, 0.95, 3, 0.07), f, s * (len / 2 - 0.1), 0.43, 0)
  const pillows = 1 + Math.floor(rand() * 3)
  for (let i = 0; i < pillows; i++) {
    const x = (rand() - 0.5) * (len - 1)
    const p = put(g, new RoundedBoxGeometry(0.44, 0.42, 0.14, 3, 0.06), std(PILLOWS[Math.floor(rand() * PILLOWS.length)], 0.95), x, 0.74, -0.17)
    p.rotation.set(-0.25, (rand() - 0.5) * 0.4, (rand() - 0.5) * 0.5)
  }
  return g
}
export function buildCoffeeTable(round = true) {
  const g = new Group()
  if (round) {
    put(g, new CylinderGeometry(0.55, 0.55, 0.06, 24), M.teak(), 0, 0.42, 0)
    put(g, new CylinderGeometry(0.08, 0.1, 0.4, 10), M.dark(), 0, 0.2, 0)
    put(g, new CylinderGeometry(0.32, 0.36, 0.04, 20), M.dark(), 0, 0.02, 0)
  } else {
    put(g, new BoxGeometry(1.3, 0.07, 0.7), M.teak(), 0, 0.36, 0)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, new BoxGeometry(0.06, 0.33, 0.06), M.dark(), sx * 0.58, 0.165, sz * 0.29)
  }
  return g
}

// Grand piano, keyboard toward +Z.
function paintKeys() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 64
  const ctx = c.getContext('2d')
  ctx.fillStyle = '#fbf8f0'
  ctx.fillRect(0, 0, 1024, 64)
  const kw = 1024 / 52
  ctx.fillStyle = '#b9b3a6'
  for (let i = 1; i < 52; i++) ctx.fillRect(i * kw - 1, 0, 2, 64)
  ctx.fillStyle = '#111'
  for (let i = 0; i < 51; i++) {
    const n = (i + 5) % 7 // white key index within an octave, starting at A
    if (n === 2 || n === 6) continue // no black key after B and E
    ctx.fillRect((i + 1) * kw - kw * 0.3, 0, kw * 0.6, 38)
  }
  return c
}
export function buildPiano() {
  const g = new Group()
  const outline = [[-0.75, 0], [0.75, 0], [0.75, -0.8]]
  for (let i = 1; i <= 10; i++) {
    const t = i / 10
    // the bentside curves in toward the tail
    outline.push([0.75 - 0.55 * t - 0.25 * Math.sin(t * Math.PI), -0.8 - 1.25 * t])
  }
  outline.push([-0.75, -2.05])
  const body = put(g, prism(outline, 0.32, { bevel: 0.02 }), M.black(), 0, 0.6, 0)
  body.castShadow = true
  // propped lid, hinged on the straight left side
  const lidPivot = new Group()
  lidPivot.position.set(-0.75, 0.95, 0)
  lidPivot.rotation.z = 0.62
  const lid = put(lidPivot, prism(outline.map(([x, z]) => [x + 0.75, z]), 0.025), M.black(), 0, 0, 0)
  lid.castShadow = true
  g.add(lidPivot)
  const prop = put(g, new CylinderGeometry(0.012, 0.012, 0.85, 6), M.black(), 0.32, 1.2, -0.9)
  prop.rotation.z = 0.35
  // keybed + keys
  put(g, new BoxGeometry(1.56, 0.1, 0.34), M.black(), 0, 0.62, 0.15)
  const keys = new Mesh(new BoxGeometry(1.42, 0.03, 0.22), [M.black(), M.black(), mat('keys', () => new MeshStandardMaterial({ map: tex(paintKeys()), roughness: 0.35 })), M.black(), M.black(), M.black()])
  keys.position.set(0, 0.685, 0.19)
  g.add(keys)
  put(g, new BoxGeometry(1.42, 0.12, 0.04), M.black(), 0, 0.74, 0.05) // fallboard
  // legs + pedal lyre
  for (const [x, z] of [[-0.65, 0.1], [0.65, 0.1], [-0.4, -1.8]]) {
    put(g, new CylinderGeometry(0.06, 0.045, 0.6, 10), M.black(), x, 0.3, z)
    put(g, new SphereGeometry(0.04, 8, 6), M.brass(), x, 0.02, z)
  }
  put(g, new BoxGeometry(0.22, 0.45, 0.05), M.black(), 0, 0.3, -0.1)
  for (const x of [-0.05, 0, 0.05]) put(g, new BoxGeometry(0.025, 0.012, 0.09), M.brass(), x, 0.08, -0.05)
  // bench
  put(g, new RoundedBoxGeometry(0.85, 0.08, 0.36, 2, 0.03), M.black(), 0, 0.5, 0.75)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, new BoxGeometry(0.04, 0.46, 0.04), M.black(), sx * 0.36, 0.23, 0.75 + sz * 0.13)
  return g
}

// --- Greenery -------------------------------------------------------------------------
const BLOSSOM = ['#ffc2d8', '#ffd6e4', '#f6a9c6', '#fde3ec', '#f39bbd']
const blossomMat = (c) => mat(`bl${c}`, () => new MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true }))
export function buildPlanterBox(w, h, d) {
  const g = new Group()
  put(g, new BoxGeometry(w, h, d), M.walnut(), 0, h / 2, 0)
  put(g, new BoxGeometry(w + 0.08, 0.06, d + 0.08), M.dark(), 0, h, 0)
  put(g, new BoxGeometry(w - 0.12, 0.04, d - 0.12), M.soil(), 0, h + 0.01, 0, false)
  return g
}
// Cherry tree in a planter; returns { group, petalSources: [Vector3 local] }
export function buildCherryTree(seed = 1, scale = 1) {
  const rand = mulberry32(seed)
  const g = new Group()
  g.add(buildPlanterBox(1.7, 0.6, 1.7))
  const tree = new Group()
  tree.position.y = 0.6
  tree.scale.setScalar(scale)
  g.add(tree)
  const lean = (rand() - 0.5) * 0.6
  const top = new Vector3(lean, 2.3, (rand() - 0.5) * 0.4)
  put(tree, taperTube([new Vector3(0, 0, 0), new Vector3(lean * 0.2, 0.9, 0.05), new Vector3(lean * 0.7, 1.7, -0.05), top], 0.2, 0.11, 10, 8), M.bark(), 0, 0, 0)
  const tips = []
  const nb = 4 + Math.floor(rand() * 2)
  for (let i = 0; i < nb; i++) {
    const a = (i / nb) * Math.PI * 2 + rand() * 0.6
    const len = 1.1 + rand() * 0.8
    const start = top.clone().add(new Vector3(0, -0.3 - rand() * 0.5, 0))
    const mid = start.clone().add(new Vector3(Math.cos(a) * len * 0.5, 0.45 + rand() * 0.3, Math.sin(a) * len * 0.5))
    const end = start.clone().add(new Vector3(Math.cos(a) * len, 0.6 + rand() * 0.6, Math.sin(a) * len))
    put(tree, taperTube([start, mid, end], 0.09, 0.03, 6, 6), M.bark(), 0, 0, 0)
    tips.push(end, mid)
  }
  tips.push(top.clone().add(new Vector3(0, 0.5, 0)))
  const geo = new IcosahedronGeometry(1, 0)
  const sources = []
  for (const tip of tips) {
    const n = 3 + Math.floor(rand() * 3)
    for (let k = 0; k < n; k++) {
      const r = 0.35 + rand() * 0.42
      const m = put(tree, geo, blossomMat(BLOSSOM[Math.floor(rand() * BLOSSOM.length)]), tip.x + (rand() - 0.5) * 0.9, tip.y + (rand() - 0.3) * 0.5, tip.z + (rand() - 0.5) * 0.9)
      m.scale.set(r, r * 0.8, r)
      m.rotation.set(rand() * 3, rand() * 3, rand() * 3)
    }
    sources.push(tip.clone().multiplyScalar(scale).add(new Vector3(0, 0.6, 0)))
  }
  return { group: g, petalSources: sources }
}
// Bonsai-style pine in a planter: twisty trunk, flat foliage pads.
export function buildPine(seed = 3, scale = 1) {
  const rand = mulberry32(seed)
  const g = new Group()
  g.add(buildPlanterBox(1.2, 0.55, 1.2))
  const tree = new Group()
  tree.position.y = 0.55
  tree.scale.setScalar(scale)
  g.add(tree)
  const pts = [new Vector3(0, 0, 0)]
  for (let i = 1; i <= 4; i++) pts.push(new Vector3((rand() - 0.5) * 0.7, i * 0.55, (rand() - 0.5) * 0.5))
  put(tree, taperTube(pts, 0.13, 0.05, 12, 7), M.bark(), 0, 0, 0)
  const geo = new IcosahedronGeometry(1, 1)
  const greens = ['#3d6a2c', '#4b7a33', '#35602a']
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const side = i % 2 ? 1 : -1
    const end = p.clone().add(new Vector3(side * (0.5 + rand() * 0.4), 0.1, (rand() - 0.5) * 0.4))
    put(tree, taperTube([p, p.clone().lerp(end, 0.5).add(new Vector3(0, 0.08, 0)), end], 0.05, 0.025, 4, 5), M.bark(), 0, 0, 0)
    for (const at of [end, i === pts.length - 1 ? p : null]) {
      if (!at) continue
      const pad = put(tree, geo, std(greens[i % 3], 0.9, { flatShading: true }), at.x, at.y + 0.08, at.z)
      const r = 0.45 + rand() * 0.25
      pad.scale.set(r * 1.3, r * 0.42, r)
      pad.rotation.y = rand() * 3
    }
  }
  return g
}
// A fern: bent fronds (alpha-tested texture) out of a soil top at height y0.
const frondMat = (c) => mat(`frond${c}`, () => new MeshStandardMaterial({ color: c, map: tex(paintFrond()), alphaTest: 0.5, side: DoubleSide, roughness: 0.8 }))
function frondGeo(len) {
  const geo = new PlaneGeometry(len * 0.3, len, 1, 8)
  geo.translate(0, len / 2, 0)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / len
    pos.setZ(i, t * t * len * 0.55)
    pos.setY(i, pos.getY(i) * (1 - 0.18 * t))
  }
  geo.computeVertexNormals()
  return geo
}
const FROND = { short: null, long: null }
export function addFern(parent, x, y0, z, size = 1, seed = 2, n = 14) {
  const rand = mulberry32(seed)
  FROND.long ||= frondGeo(1.15)
  for (let i = 0; i < n; i++) {
    const f = new Mesh(FROND.long, frondMat(rand() < 0.5 ? '#8fae32' : '#a4bd3c'))
    f.position.set(x, y0, z)
    f.rotation.order = 'YXZ'
    f.rotation.y = (i / n) * Math.PI * 2 + rand() * 0.4
    f.rotation.x = 0.25 + rand() * 0.65
    f.scale.setScalar(size * (0.7 + rand() * 0.45))
    f.castShadow = true
    parent.add(f)
  }
}
export function buildFernPot(seed = 2) {
  const g = new Group()
  const pot = put(g, new CylinderGeometry(0.58, 0.44, 0.75, 4), M.walnut(), 0, 0.375, 0)
  pot.rotation.y = Math.PI / 4
  const soil = put(g, new CylinderGeometry(0.5, 0.5, 0.04, 4), M.soil(), 0, 0.74, 0, false)
  soil.rotation.y = Math.PI / 4
  addFern(g, 0, 0.72, 0, 1.25, seed, 16)
  return g
}
// Long planter along X with shrubs and ferns.
export function buildLongPlanter(len, seed = 4) {
  const rand = mulberry32(seed)
  const g = buildPlanterBox(len, 0.55, 0.8)
  const geo = new IcosahedronGeometry(1, 1)
  const n = Math.floor(len / 0.9)
  for (let i = 0; i < n; i++) {
    const x = -len / 2 + 0.45 + i * 0.9 + (rand() - 0.5) * 0.2
    if (rand() < 0.45) addFern(g, x, 0.56, (rand() - 0.5) * 0.2, 0.75, seed * 31 + i, 9)
    else {
      const b = put(g, geo, std(rand() < 0.5 ? '#5f8f2e' : '#77a33a', 0.9, { flatShading: true }), x, 0.75, (rand() - 0.5) * 0.15)
      const r = 0.3 + rand() * 0.15
      b.scale.set(r * 1.2, r, r)
    }
  }
  return g
}

// --- Outdoor pieces -----------------------------------------------------------------------
export function buildUmbrella() {
  const g = new Group()
  const fabric = mat('umb', () => new MeshStandardMaterial({ color: '#f1e6d6', roughness: 0.9, side: DoubleSide, flatShading: true }))
  put(g, new CylinderGeometry(0.035, 0.04, 2.6, 8), M.teak(), 0, 1.3, 0)
  put(g, new CylinderGeometry(0.32, 0.38, 0.12, 16), M.dark(), 0, 0.06, 0)
  put(g, new ConeGeometry(1.75, 0.6, 8, 1, true), fabric, 0, 2.55, 0)
  put(g, new CylinderGeometry(1.75, 1.75, 0.16, 8, 1, true), fabric, 0, 2.18, 0)
  put(g, new SphereGeometry(0.06, 8, 6), M.teak(), 0, 2.88, 0)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    const rib = put(g, new BoxGeometry(0.025, 0.025, 1.75), M.teak(), Math.sin(a) * 0.85, 2.36, Math.cos(a) * 0.85, false)
    rib.rotation.y = a
    rib.rotation.x = -0.32
  }
  return g
}
export function buildLounger() {
  const g = new Group()
  const w = M.walnut()
  for (let i = 0; i < 9; i++) put(g, new BoxGeometry(0.66, 0.035, 0.12), w, 0, 0.32, -0.2 + i * 0.14)
  for (const s of [-1, 1]) {
    put(g, new BoxGeometry(0.05, 0.08, 1.95), w, s * 0.34, 0.28, 0.05)
    for (const z of [-0.8, 0.85]) put(g, new BoxGeometry(0.06, 0.28, 0.06), w, s * 0.34, 0.14, z)
  }
  const back = new Group()
  back.position.set(0, 0.34, -0.3)
  back.rotation.x = -0.75
  for (let i = 0; i < 5; i++) put(back, new BoxGeometry(0.66, 0.035, 0.12), w, 0, 0, -0.08 - i * 0.14)
  put(back, new RoundedBoxGeometry(0.6, 0.06, 0.66, 2, 0.025), std('#5a3a2a', 0.95), 0, 0.045, -0.36)
  g.add(back)
  put(g, new RoundedBoxGeometry(0.6, 0.06, 1.2, 2, 0.025), std('#5a3a2a', 0.95), 0, 0.37, 0.4)
  return g
}
// Modern lantern bollard: wood post, glowing cube top. Returns { group, bulb }.
export function buildLantern(bulbMat) {
  const g = new Group()
  put(g, new BoxGeometry(0.24, 0.85, 0.24), M.walnut(), 0, 0.425, 0)
  put(g, new BoxGeometry(0.4, 0.05, 0.4), M.dark(), 0, 0.875, 0)
  put(g, new BoxGeometry(0.3, 0.32, 0.3), bulbMat, 0, 1.06, 0, false)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, new BoxGeometry(0.035, 0.34, 0.035), M.dark(), sx * 0.15, 1.06, sz * 0.15, false)
  put(g, new BoxGeometry(0.44, 0.06, 0.44), M.dark(), 0, 1.25, 0)
  return g
}
// Fire pit: rock ring, logs, glowing coals (flames are particles, fx.js).
export function buildFirePit(coalMat) {
  const g = new Group()
  const rock = new DodecahedronGeometry(1, 0)
  const rand = mulberry32(55)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const r = put(g, rock, M.stone(), Math.cos(a) * 0.78, 0.16, Math.sin(a) * 0.78)
    r.scale.set(0.26 + rand() * 0.06, 0.2 + rand() * 0.06, 0.22)
    r.rotation.set(rand() * 3, a, rand())
  }
  put(g, new CylinderGeometry(0.62, 0.66, 0.1, 16), coalMat, 0, 0.06, 0, false)
  for (let i = 0; i < 4; i++) {
    const l = put(g, new CylinderGeometry(0.06, 0.07, 0.8, 7), M.bark(), 0, 0.17, 0)
    l.rotation.set(Math.PI / 2, (i / 4) * Math.PI, 0.25)
  }
  return g
}
// Showcase pedestal with a neon ring; the item floats above (animated by the caller).
export function buildPedestal(ringMat) {
  const g = new Group()
  put(g, new CylinderGeometry(0.9, 1, 0.3, 28), M.dark(), 0, 0.15, 0)
  put(g, new CylinderGeometry(0.75, 0.8, 0.5, 28), std('#f1ece4', 0.4), 0, 0.55, 0)
  const ring = put(g, new TorusGeometry(0.82, 0.04, 8, 40), ringMat, 0, 0.82, 0, false)
  ring.rotation.x = Math.PI / 2
  put(g, new CylinderGeometry(0.8, 0.8, 0.06, 28), M.dark(), 0, 0.84, 0)
  return g
}
export function buildCrate(size = 0.9) {
  const m = mat('crate', () => new MeshStandardMaterial({ map: tex(paintCrateFace()), roughness: 0.7 }))
  const c = new Mesh(new RoundedBoxGeometry(size, size, size, 2, 0.06), m)
  c.castShadow = true
  return c
}

// --- Pergola with string lights ---------------------------------------------------------------
// w (x) by d (z), posts on a grid; returns { group, bulbs: [Vector3] } (bulb positions, local).
export function buildPergola(w, d, h, { postsX = 4, postsZ = 2, slats = true, bulbMats } = {}) {
  const g = new Group()
  const wood = M.walnut()
  const post = new BoxGeometry(0.34, h, 0.34)
  const xs = []
  for (let i = 0; i < postsX; i++) xs.push(-w / 2 + (w * i) / (postsX - 1))
  const zs = []
  for (let i = 0; i < postsZ; i++) zs.push(-d / 2 + (d * i) / (postsZ - 1))
  for (const x of xs) for (const z of zs) {
    put(g, post, wood, x, h / 2, z)
    put(g, new BoxGeometry(0.5, 0.18, 0.5), M.dark(), x, 0.09, z)
    put(g, new BoxGeometry(0.4, 0.06, 0.4), M.brass(), x, h - 0.4, z)
  }
  for (const z of zs) put(g, new BoxGeometry(w + 0.8, 0.32, 0.26), wood, 0, h + 0.1, z)
  for (const x of xs) put(g, new BoxGeometry(0.22, 0.24, d + 0.6), wood, x, h + 0.36, 0)
  if (slats) {
    const n = Math.floor((w + 0.6) / 0.42)
    const slat = new BoxGeometry(0.1, 0.16, d + 0.9)
    for (let i = 0; i <= n; i++) put(g, slat, wood, -w / 2 - 0.3 + (i * (w + 0.6)) / n, h + 0.56, 0)
  }
  // string lights: catenaries between the front and back beams, zig-zagging
  const bulbs = []
  const wire = std('#1b1b1b', 0.8)
  const bulbGeo = new SphereGeometry(0.075, 8, 6)
  const spans = []
  for (let i = 0; i < xs.length - 1; i++) {
    for (const k of [0.25, 0.75]) {
      const x = xs[i] + (xs[i + 1] - xs[i]) * k
      spans.push([new Vector3(x - 0.6, h - 0.02, -d / 2), new Vector3(x + 0.6, h - 0.02, d / 2)])
    }
  }
  spans.push([new Vector3(-w / 2, h - 0.02, d / 2 + 0.05), new Vector3(w / 2, h - 0.02, d / 2 + 0.05)])
  spans.forEach(([a, b], si) => {
    const pts = []
    const n = 14
    const len = a.distanceTo(b)
    for (let i = 0; i <= n; i++) {
      const t = i / n
      const p = a.clone().lerp(b, t)
      p.y -= Math.sin(t * Math.PI) * (0.25 + len * 0.06)
      pts.push(p)
    }
    put(g, new TubeGeometry(new CatmullRomCurve3(pts), 24, 0.008, 4), wire, 0, 0, 0, false)
    const count = Math.floor(len / 0.75)
    const curve = new CatmullRomCurve3(pts)
    for (let i = 1; i < count; i++) {
      const p = curve.getPointAt(i / count)
      const m = bulbMats[(i + si) % bulbMats.length]
      put(g, bulbGeo, m, p.x, p.y - 0.09, p.z, false)
      put(g, new CylinderGeometry(0.004, 0.004, 0.09, 3), wire, p.x, p.y - 0.04, p.z, false)
      bulbs.push(new Vector3(p.x, p.y - 0.09, p.z))
    }
  })
  return { group: g, bulbs, posts: xs.flatMap((x) => zs.map((z) => [x, z])) }
}

// Leaderboard stand: two posts and a framed board; `face` is the board's material.
export function buildBoardStand(face, w = 3.4, h = 4.4) {
  const g = new Group()
  const wood = M.walnut()
  for (const s of [-1, 1]) {
    put(g, new BoxGeometry(0.22, 1.4, 0.22), wood, s * (w / 2 - 0.4), 0.7, 0)
    put(g, new BoxGeometry(0.5, 0.12, 0.7), M.dark(), s * (w / 2 - 0.4), 0.06, 0)
  }
  put(g, new BoxGeometry(w + 0.2, h + 0.2, 0.16), M.dark(), 0, 1.2 + h / 2, -0.02)
  const board = new Mesh(new PlaneGeometry(w, h), face)
  board.position.set(0, 1.2 + h / 2, 0.065)
  g.add(board)
  return g
}

// Entrance arch over the spawn walkway; `sign` is a plane material for each face.
export function buildArch(signMat, neonMat, span = 9, h = 5.6) {
  const g = new Group()
  const wood = M.walnut()
  for (const s of [-1, 1]) {
    const x = s * span / 2
    put(g, new BoxGeometry(1.2, 0.5, 1.2), std('#cfc6bd', 0.9), x, 0.25, 0)
    put(g, new BoxGeometry(0.8, h, 0.8), wood, x, h / 2, 0)
    for (const y of [1.2, h - 0.6]) put(g, new BoxGeometry(0.86, 0.12, 0.86), M.brass(), x, y, 0)
  }
  put(g, new BoxGeometry(span + 1.6, 0.5, 1.1), wood, 0, h + 0.25, 0)
  put(g, new BoxGeometry(span + 2.2, 0.16, 1.3), M.dark(), 0, h + 0.58, 0)
  put(g, new BoxGeometry(span - 0.8, 0.06, 0.12), neonMat, 0, h - 0.03, 0.35, false)
  put(g, new BoxGeometry(span - 0.8, 0.06, 0.12), neonMat, 0, h - 0.03, -0.35, false)
  for (const s of [-1, 1]) {
    const plane = new Mesh(new PlaneGeometry(span * 0.95, span * 0.95 * 0.25), signMat)
    plane.position.set(0, h + 1.5, s * 0.1)
    if (s < 0) plane.rotation.y = Math.PI
    g.add(plane)
  }
  put(g, new BoxGeometry(span * 0.9, 1.9, 0.12), M.dark(), 0, h + 1.5, 0)
  return g
}

export function buildElevator(glassMat, lightMat) {
  const g = new Group()
  put(g, new BoxGeometry(6, 3.8, 3.2), std('#e9e1d8', 0.85), 0, 1.9, 0)
  put(g, new BoxGeometry(6.4, 0.3, 3.6), M.dark(), 0, 3.95, 0)
  // two elevator doors facing -Z
  for (const s of [-1, 1]) {
    const x = s * 1.4
    put(g, new BoxGeometry(1.9, 2.7, 0.12), M.steel(), x, 1.35, -1.61)
    put(g, new BoxGeometry(0.9, 2.5, 0.05), glassMat, x - 0.46, 1.35, -1.68, false)
    put(g, new BoxGeometry(0.9, 2.5, 0.05), glassMat, x + 0.46, 1.35, -1.68, false)
    put(g, new BoxGeometry(0.5, 0.14, 0.04), lightMat, x, 2.92, -1.66, false)
  }
  return g
}
