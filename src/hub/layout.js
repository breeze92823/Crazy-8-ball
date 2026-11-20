// Dresses the roof: the lounge pavilion with the leaderboards in front of it,
// the entrance arch and elevator at the spawn, cabana, umbrellas, trees,
// planters, lantern bollards and the two showcase pedestals. Static props are
// baked to a few meshes; colliders and nav obstacles are registered here too.
import { AdditiveBlending, BoxGeometry, CanvasTexture, Sprite, SpriteMaterial, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, Vector3 } from 'three'
import { ROOF, TABLE_GRID } from '../config.js'
import { bake } from '../bake.js'
import { label, neon, put, solidBox, solidPole } from '../propkit.js'
import { blockCircle, blockRect } from './nav.js'
import { paintTitleSign } from './paint.js'
import {
  M,
  buildArch,
  buildBoardStand,
  buildCherryTree,
  buildCoffeeTable,
  buildCrate,
  buildCue,
  buildElevator,
  buildFernPot,
  buildFirePit,
  buildLantern,
  buildLongPlanter,
  buildLounger,
  buildPedestal,
  buildPergola,
  buildPiano,
  buildPine,
  buildSofa,
  buildUmbrella,
} from './props.js'

export const LOUNGE = { x0: -22, x1: 22, z0: ROOF.minZ, z1: -25.4, y: 0.4 }
export const SPOTS = {
  fire: new Vector3(7, LOUNGE.y, -30.2),
  piano: new Vector3(-6.5, LOUNGE.y, -31),
  boards: [new Vector3(-3.5, 0, -22.8), new Vector3(3.5, 0, -22.8)],
  cuePedestal: new Vector3(-8, 0, 26),
  cratePedestal: new Vector3(8, 0, 26),
}
// Floor height under a point (the lounge platform is raised).
export function floorAt(x, z) {
  return x > LOUNGE.x0 && x < LOUNGE.x1 && z > LOUNGE.z0 && z < LOUNGE.z1 ? LOUNGE.y : 0
}

function auraCanvas() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(32, 64, 2, 32, 64, 60)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 128)
  return c
}

// Soft contact shadow under a prop (works with shadows off too).
let shadowMat = null
function contactShadow(parent, x, y, z, w, d) {
  if (!shadowMat) {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const ctx = c.getContext('2d')
    const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 32)
    g.addColorStop(0, 'rgba(0,0,0,0.55)')
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
    shadowMat = new MeshBasicMaterial({ map: new CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.6 })
  }
  const m = new Mesh(new PlaneGeometry(w, d), shadowMat)
  m.rotation.x = -Math.PI / 2
  m.position.set(x, y + 0.012, z)
  m.renderOrder = 1
  parent.add(m)
}

export function buildLayout(scene, lighting) {
  const root = new Group() // everything static, baked at the end
  const live = new Group() // animated / unbaked bits
  scene.add(live)
  const at = (obj, x, z, yaw = 0, y = 0) => {
    obj.position.set(x, y, z)
    obj.rotation.y = yaw
    root.add(obj)
    return obj
  }
  const bulbWarm = neon('#ffd7a1', 3.2)
  const bulbAmber = neon('#ffa24a', 3.4)
  const bulbRose = neon('#ff7a8a', 3.4)
  const petalSources = []
  const lamps = []

  // contact shadows under the tables
  for (const z of TABLE_GRID.rows) for (const x of TABLE_GRID.cols) contactShadow(root, x, 0, z, 5.4, 3.4)

  // --- lounge pavilion ---------------------------------------------------------------------
  const L = LOUNGE
  const pw = L.x1 - L.x0
  const pd = L.z1 - L.z0
  const pcz = (L.z0 + L.z1) / 2
  const deck = put(root, new PlaneGeometry(pw, pd), M.teak(), 0, L.y, pcz)
  deck.rotation.x = -Math.PI / 2
  deck.geometry.attributes.uv.array.forEach((v, i, a) => (a[i] = v * (i % 2 ? pd / 1.2 : pw / 6)))
  const edge = new MeshStandardMaterial({ color: '#e4d8cf', roughness: 0.9 })
  // plinth front + a step along it
  put(root, new BoxGeometry(pw, L.y, 0.3), edge, 0, L.y / 2, L.z1 - 0.15)
  put(root, new BoxGeometry(pw + 0.6, 0.2, 0.55), edge, 0, 0.1, L.z1 + 0.27)
  solidBox(pw / 2, L.y / 2, pd / 2, 0, L.y / 2, pcz)
  solidBox(pw / 2 + 0.3, 0.1, 0.27, 0, 0.1, L.z1 + 0.27)
  const per = buildPergola(pw - 1.2, pd - 1.6, 4.4, { postsX: 6, postsZ: 2, bulbMats: [bulbWarm, bulbAmber, bulbWarm, bulbRose] })
  at(per.group, 0, pcz - 0.2, 0, L.y)
  for (const [x, z] of per.posts) {
    solidBox(0.17, 2.4, 0.17, x, 2.4, pcz - 0.2 + z)
    blockRect(x, pcz - 0.2 + z, 0.25, 0.25)
  }
  for (const x of [-14, 0, 14]) lamps.push([x, L.y + 3.6, pcz])
  // left lounge: L-sofa round a coffee table; right lounge: sofas round the fire pit
  const sofas = [
    [-15, -32.6, 0, 4.2, 1], [-19.4, -29.6, Math.PI / 2, 3, 2], [-10.6, -29.6, -Math.PI / 2, 3, 3],
    [7, -33, 0, 4, 4], [11.3, -30.3, -Math.PI / 2, 3, 5], [2.7, -30.3, Math.PI / 2, 3, 6],
    [17.5, -32.6, 0, 3.4, 7],
  ]
  for (const [x, z, yaw, len, seed] of sofas) {
    at(buildSofa(len, seed), x, z, yaw, L.y)
    const along = Math.abs(Math.sin(yaw)) > 0.5
    const hx = along ? 0.5 : len / 2
    const hz = along ? len / 2 : 0.5
    solidBox(hx, 0.45, hz, x, L.y + 0.45, z)
    blockRect(x, z, hx, hz)
    contactShadow(root, x, L.y, z, hx * 2 + 0.4, hz * 2 + 0.4)
  }
  at(buildCoffeeTable(true), -15, -29.8, 0, L.y)
  solidPole(0.55, 0.9, -15, -29.8)
  blockCircle(-15, -29.8, 0.55)
  at(buildCoffeeTable(false), 17.5, -30.8, 0, L.y)
  blockRect(17.5, -30.8, 0.65, 0.35)
  // fire pit
  const coal = neon('#ff6a1a', 2.4)
  at(buildFirePit(coal), SPOTS.fire.x, SPOTS.fire.z, 0, L.y)
  solidPole(1, 1.0, SPOTS.fire.x, SPOTS.fire.z)
  blockCircle(SPOTS.fire.x, SPOTS.fire.z, 1)
  // piano
  at(buildPiano(), SPOTS.piano.x, SPOTS.piano.z + 1, 0, L.y)
  solidBox(0.8, 0.6, 1.1, SPOTS.piano.x, L.y + 0.6, SPOTS.piano.z)
  blockRect(SPOTS.piano.x, SPOTS.piano.z, 0.8, 1.3)
  contactShadow(root, SPOTS.piano.x, L.y, SPOTS.piano.z, 2.2, 3)

  // --- leaderboards (faces painted by boards.js) ---------------------------------------------
  const boardMats = SPOTS.boards.map(() => new MeshBasicMaterial({ color: '#ffffff' }))
  SPOTS.boards.forEach((p, i) => {
    const stand = buildBoardStand(boardMats[i])
    stand.position.copy(p)
    stand.rotation.y = i === 0 ? 0.12 : -0.12
    live.add(stand)
    solidBox(1.7, 1.5, 0.3, p.x, 1.5, p.z, stand.rotation.y)
    blockRect(p.x, p.z, 1.8, 0.4)
  })

  // --- spawn: elevator, rug, arch, showcases ---------------------------------------------------
  const glass = new MeshPhysicalMaterial({ color: '#1d2a3a', roughness: 0.08, metalness: 0.3, clearcoat: 1 })
  at(buildElevator(glass, neon('#7cf0ff', 2.5)), -20.5, 32.4)
  solidBox(3, 2, 1.6, -20.5, 2, 32.4)
  blockRect(-20.5, 32.4, 3, 1.6)
  const rug = put(root, new PlaneGeometry(6.5, 4.2), new MeshStandardMaterial({ color: '#4b3a3f', roughness: 1 }), 0, 0.015, 25, false)
  rug.rotation.x = -Math.PI / 2
  rug.receiveShadow = true
  const sign = paintTitleSign()
  const signTex = new CanvasTexture(sign.canvas)
  signTex.colorSpace = SRGBColorSpace
  document.fonts?.load?.('700 96px Fredoka').then(() => {
    sign.draw()
    signTex.needsUpdate = true
  }).catch(() => {})
  const signMat = new MeshBasicMaterial({ map: signTex, transparent: true, toneMapped: false })
  const arch = buildArch(signMat, neon('#ff4fa3', 3.5))
  arch.position.set(0, 0, 21)
  live.add(arch)
  for (const s of [-1, 1]) {
    solidBox(0.45, 3, 0.45, s * 4.5, 3, 21)
    blockRect(s * 4.5, 21, 0.6, 0.6)
  }
  const pedRing = neon('#b46bff', 3)
  const crateRing = neon('#2fd8ff', 3)
  at(buildPedestal(pedRing), SPOTS.cuePedestal.x, SPOTS.cuePedestal.z)
  at(buildPedestal(crateRing), SPOTS.cratePedestal.x, SPOTS.cratePedestal.z)
  for (const p of [SPOTS.cuePedestal, SPOTS.cratePedestal]) {
    solidPole(1, 0.9, p.x, p.z)
    blockCircle(p.x, p.z, 1)
  }
  const showCue = buildCue(1.5)
  const showcase = new Group()
  showcase.position.set(SPOTS.cuePedestal.x, 1.05, SPOTS.cuePedestal.z)
  showCue.scale.setScalar(1.7)
  showCue.rotation.z = 0.35
  showCue.position.set(-0.45, 0.2, 0)
  const aura = new Sprite(new SpriteMaterial({ map: new CanvasTexture(auraCanvas()), color: '#c58bff', transparent: true, depthWrite: false, blending: AdditiveBlending }))
  aura.scale.set(1.4, 3.2, 1)
  aura.position.y = 1.2
  showcase.add(showCue, aura)
  showcase.userData.aura = aura
  live.add(showcase)
  const crate = buildCrate(0.85)
  crate.position.set(SPOTS.cratePedestal.x, 1.6, SPOTS.cratePedestal.z)
  live.add(crate)
  const cueLabel = label('LEGENDARY CUE\n$25,000', 0.75, { colors: ['#ffd23d', '#ffffff'], outline: '#2a1050' })
  cueLabel.position.set(SPOTS.cuePedestal.x, 3.6, SPOTS.cuePedestal.z)
  const crateLabel = label('MYSTERY CRATE\n$5,000', 0.75, { colors: ['#7cf0ff', '#ffffff'], outline: '#0b2a55' })
  crateLabel.position.set(SPOTS.cratePedestal.x, 3.4, SPOTS.cratePedestal.z)
  live.add(cueLabel, crateLabel)

  // lantern bollards
  const lanternMat = neon('#ffc46b', 2.6)
  const lanterns = [[-3.4, 27.5], [3.4, 27.5], [-3.4, 23], [3.4, 23], [-23, -24.6], [23, -24.6], [-38.4, -10], [38.4, -10], [-38.4, 12], [38.4, 12]]
  for (const [x, z] of lanterns) {
    at(buildLantern(lanternMat), x, z)
    solidBox(0.15, 0.6, 0.15, x, 0.6, z)
    blockRect(x, z, 0.2, 0.2)
  }
  lamps.push([0, 1.2, 23], [-38.4, 1.2, 12], [38.4, 1.2, -10])

  // --- west cabana --------------------------------------------------------------------------------
  const cab = buildPergola(4.4, 7, 3.6, { postsX: 2, postsZ: 3, bulbMats: [bulbWarm, bulbAmber] })
  at(cab.group, -36, -1)
  for (const [x, z] of cab.posts) {
    solidBox(0.17, 2, 0.17, -36 + x, 2, -1 + z)
    blockRect(-36 + x, -1 + z, 0.25, 0.25)
  }
  at(buildSofa(4.2, 11), -37.6, -1, Math.PI / 2)
  solidBox(0.5, 0.45, 2.1, -37.6, 0.45, -1)
  blockRect(-37.6, -1, 0.5, 2.1)
  at(buildCoffeeTable(false), -35.8, -1, Math.PI / 2)
  blockRect(-35.8, -1, 0.35, 0.65)
  lamps.push([-36, 3.2, -1])

  // --- east umbrellas + loungers --------------------------------------------------------------------
  for (const z of [-13, 9]) {
    at(buildUmbrella(), 36.2, z)
    solidPole(0.3, 2.4, 36.2, z)
    blockCircle(36.2, z, 0.35)
    for (const dz of [-1.7, 1.7]) {
      at(buildLounger(), 36.4, z + dz, -Math.PI / 2)
      solidBox(1, 0.3, 0.38, 36.4, 0.3, z + dz)
      blockRect(36.4, z + dz, 1.05, 0.4)
      contactShadow(root, 36.4, 0, z + dz, 2.3, 1)
    }
  }

  // --- trees + planters ---------------------------------------------------------------------------
  const cherries = [[-36.5, -30, 1.05], [36.5, -30, 1.1], [-36.5, 29.5, 1], [36.5, 29.5, 1.05], [-37, 7, 0.9], [37, -1.5, 0.95], [-15, 30.5, 0.9], [15, 30.5, 0.95]]
  cherries.forEach(([x, z, s], i) => {
    const { group, petalSources: ps } = buildCherryTree(100 + i * 7, s)
    at(group, x, z, i * 1.3)
    solidBox(0.85, 0.6, 0.85, x, 0.6, z)
    solidPole(0.25, 4, x, z)
    blockRect(x, z, 0.85, 0.85)
    for (const p of ps) {
      const v = p.clone().applyAxisAngle(new Vector3(0, 1, 0), i * 1.3)
      petalSources.push(new Vector3(x + v.x, v.y, z + v.z))
    }
  })
  const pines = [[-29, -32.6, 1], [29, -32.6, 1.1], [-38.3, -19, 0.9], [38.3, 20, 0.95], [-25, 32.4, 0.9], [25, 32.4, 1]]
  pines.forEach(([x, z, s], i) => {
    at(buildPine(200 + i * 5, s), x, z, i)
    solidBox(0.6, 0.55, 0.6, x, 0.55, z)
    blockRect(x, z, 0.6, 0.6)
  })
  const planters = [[-38.8, -25, 6, true], [38.8, -24, 6, true], [-38.8, 20, 6, true], [38.8, 26, 4, true], [-31, 33.2, 6, false], [31, 33.2, 6, false], [-33, -33.2, 6, false], [33, -33.2, 6, false]]
  planters.forEach(([x, z, len, alongZ], i) => {
    at(buildLongPlanter(len, 40 + i), x, z, alongZ ? Math.PI / 2 : 0)
    const hx = alongZ ? 0.4 : len / 2
    const hz = alongZ ? len / 2 : 0.4
    solidBox(hx, 0.4, hz, x, 0.4, z)
    blockRect(x, z, hx, hz)
  })
  // potted ferns between the tables
  const ferns = [[-19.5, -16], [-6.5, -16], [6.5, -16], [19.5, -16], [-19.5, 4], [-6.5, 4], [6.5, 4], [19.5, 4], [-5.5, 30.5], [5.5, 30.5], [-32.5, -21], [32.5, -21]]
  ferns.forEach(([x, z], i) => {
    at(buildFernPot(300 + i), x, z, i)
    solidBox(0.5, 0.5, 0.5, x, 0.5, z)
    blockRect(x, z, 0.55, 0.55)
    contactShadow(root, x, 0, z, 1.6, 1.6)
  })

  // bake the static props (cast shadows) and add lamps for the night
  const baked = bake(root, true)
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  scene.add(baked)
  for (const [x, y, z] of lamps) lighting.addLamp(x, y, z, {})

  return { live, boardMats, showcase, crate, petalSources, coal }
}
