// The in-match abilities (catalog: src/abilities.js). match.js arms the equipped ability when the
// ABILITY bar is full and asks this module for the shot's physics mods (tablesim.js shoot mods),
// its speed, its colours and its table visuals; it reports table events and the moment the balls
// settle here. Per ability:
//   eaglesEye      the aim shows the simulated path of the cue ball and every ball it moves
//   fireShot       long guide lines, ~1.8x speed, fire trail + scorch marks (trail drawn by match.js)
//   superBounce    cushions keep all the speed (rail restitution 1) for the shot
//   magnet         the six pockets pull in your balls that roll close (6 s)
//   rewind         a shot that pots nothing of yours or fouls is rewound; you shoot again
//   portals        a blue/orange portal pair on the cloth: a ball entering one leaves the other
//   lookOverThere  the opponent's next shot goes wild (activates at once, no shot needed)
//   verity         the aim snaps to the best shot; a gold line runs to the pocket
//   catchABall     no scratch (the cue ball is caught at the pocket); one of your balls left near
//                  a pocket is dropped in once the table settles
//   timeStop       it stays your turn after this shot unless you foul
//   chainLightning on the first strike, lightning zaps up to 3 of your balls toward a pocket
//   steelBall      the cue ball weighs 3x and hits harder
//   blackFlash     big speed; the cue ball phases through every ball that isn't a legal target
//   blackHole      a hole in the middle of the table swallows your balls that drift near (5 s)
//   guangdongTiger the cue ball keeps its speed off the cushions and each of your balls it hits
//                  leaps toward its nearest pocket
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  RingGeometry,
  SRGBColorSpace,
} from 'three'
import { ABILITY_BY_ID } from '../abilities.js'
import * as asfx from '../audio/abilitySfx.js'
import { BED, POCKETS, createSim, pickShot } from './tablesim.js'

const R = BED.r
const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
// Aura / trail colours per ability: [glow, core, particle start, particle end]
export const TINT = {
  eaglesEye: ['#ffcc33', '#fff3b0', '#fff8d0', '#ffb400'],
  fireShot: ['#ff4a00', '#ff9a2a', '#fff1a8', '#ff5a12'],
  superBounce: ['#2aa8ff', '#9fe2ff', '#e0f6ff', '#3d7cff'],
  magnet: ['#ff3355', '#6f9dff', '#ffd0d8', '#ff3355'],
  rewind: ['#3d9bff', '#bfe0ff', '#e8f4ff', '#3d9bff'],
  portals: ['#7b4dff', '#ff8a2a', '#d8ccff', '#7b4dff'],
  lookOverThere: ['#ffb02e', '#ffe0a0', '#fff0c8', '#ff8a2a'],
  verity: ['#ffd23d', '#fff4b8', '#fffbe0', '#ffc21a'],
  catchABall: ['#c98a4a', '#ffe0b8', '#fff0de', '#c98a4a'],
  timeStop: ['#8fa8ff', '#e0e8ff', '#ffffff', '#8fa8ff'],
  chainLightning: ['#22d8ff', '#c8faff', '#ffffff', '#22d8ff'],
  steelBall: ['#4fcf7f', '#e0ffe8', '#ffffff', '#7ee0a0'],
  blackFlash: ['#ff1030', '#200008', '#ff4060', '#100008'],
  blackHole: ['#9a4dff', '#2a0050', '#e0b8ff', '#5a1aa0'],
  guangdongTiger: ['#ff8a00', '#ffd27a', '#fff0c0', '#ff6a00'],
}
// Abilities that stretch the guide lines to the cushions
const LONG_GUIDE = new Set(['eaglesEye', 'fireShot', 'superBounce', 'verity', 'guangdongTiger'])
// Abilities that arm the next shot (the rest act at once)
const INSTANT = new Set(['lookOverThere'])

function glowDisc(inner, outer) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
  grd.addColorStop(0, inner)
  grd.addColorStop(0.45, inner)
  grd.addColorStop(0.62, outer)
  grd.addColorStop(1, 'rgba(0,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 128, 128)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
function swirl(color) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.translate(64, 64)
  for (let i = 0; i < 5; i++) {
    g.rotate((Math.PI * 2) / 5)
    g.strokeStyle = color
    g.lineWidth = 5
    g.globalAlpha = 0.85
    g.beginPath()
    for (let a = 0; a < 2.6; a += 0.05) {
      const r = 14 + a * 18
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    g.stroke()
  }
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

// ctx: getters into the match: t, sim, phase, aim, setAim(a), power, spin {x, y}, elev,
// legal(n) (a legal target for the shooter now), mine(n) (one of my balls), popup(text, x, z, color),
// banner(kind, title, sub, secs), shake(k), shooterName()
export function createAbilityPlay({ scene, bedY, mfx, ctx }) {
  const root = new Group()
  root.visible = true
  scene.add(root)
  const y0 = bedY + 0.003
  let kind = '' // the equipped ability this match
  let t = null

  // --- portals: two discs with a spinning swirl ---
  const portalMeshes = ['#3d8bff', '#ff8a2a'].map((col) => {
    const g = new Group()
    const disc = new Mesh(new CircleGeometry(R * 1.9, 32), new MeshBasicMaterial({ map: glowDisc('rgba(10,10,30,0.95)', col), transparent: true, depthWrite: false }))
    const sw = new Mesh(new CircleGeometry(R * 1.75, 32), new MeshBasicMaterial({ map: swirl(col), transparent: true, depthWrite: false, blending: AdditiveBlending }))
    const ring = new Mesh(new RingGeometry(R * 1.6, R * 2.0, 40), new MeshBasicMaterial({ color: col, transparent: true, depthWrite: false, side: DoubleSide }))
    for (const m of [disc, sw, ring]) {
      m.rotation.x = -Math.PI / 2
      m.renderOrder = 3
      g.add(m)
    }
    g.userData.sw = sw
    g.visible = false
    root.add(g)
    return g
  })
  let portals = null // [{ x, z }, { x, z }] table-local

  // --- black hole ---
  const hole = new Group()
  const holeDisc = new Mesh(new CircleGeometry(R * 2.4, 40), new MeshBasicMaterial({ map: glowDisc('rgba(0,0,0,1)', 'rgba(120,40,220,0.9)'), transparent: true, depthWrite: false }))
  const holeSwirl = new Mesh(new CircleGeometry(R * 4.6, 40), new MeshBasicMaterial({ map: swirl('#c88bff'), transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0.8 }))
  const holeRing = new Mesh(new RingGeometry(0.5, 0.52, 64), new MeshBasicMaterial({ color: '#b46cff', transparent: true, opacity: 0.35, depthWrite: false, side: DoubleSide }))
  for (const m of [holeSwirl, holeDisc, holeRing]) {
    m.rotation.x = -Math.PI / 2
    m.renderOrder = 3
    hole.add(m)
  }
  hole.visible = false
  root.add(hole)
  let holeAt = null

  // --- magnet rings at the pockets ---
  const magnets = POCKETS.map(() => {
    const m = new Mesh(new RingGeometry(0.36, 0.42, 40), new MeshBasicMaterial({ color: '#ff3355', transparent: true, opacity: 0.5, depthWrite: false, side: DoubleSide, blending: AdditiveBlending }))
    m.rotation.x = -Math.PI / 2
    m.renderOrder = 3
    m.visible = false
    root.add(m)
    return m
  })

  // --- lightning bolts (jagged lines, flash and fade) ---
  const bolts = []
  for (let i = 0; i < 4; i++) {
    const geo = new BufferGeometry()
    geo.setAttribute('position', new BufferAttribute(new Float32Array(14 * 3), 3).setUsage(DynamicDrawUsage))
    const line = new Line(geo, new LineBasicMaterial({ color: '#bff6ff', transparent: true, blending: AdditiveBlending, depthWrite: false }))
    line.renderOrder = 15
    line.frustumCulled = false
    line.visible = false
    root.add(line)
    bolts.push({ line, life: 0, ax: 0, az: 0, bx: 0, bz: 0 })
  }
  function bolt(ax, az, bx, bz) {
    const b = bolts.find((x) => x.life <= 0) ?? bolts[0]
    Object.assign(b, { life: 0.55, ax, az, bx, bz })
    jag(b)
    b.line.visible = true
  }
  function jag(b) {
    const pos = b.line.geometry.attributes.position
    const nx = -(b.bz - b.az)
    const nz = b.bx - b.ax
    const l = Math.hypot(nx, nz) || 1
    for (let i = 0; i < 14; i++) {
      const k = i / 13
      const off = i === 0 || i === 13 ? 0 : rnd(-0.06, 0.06)
      pos.setXYZ(i, t.x + b.ax + (b.bx - b.ax) * k + (nx / l) * off, bedY + R + rnd(0, 0.05) * (1 - Math.abs(k - 0.5) * 2), t.z + b.az + (b.bz - b.az) * k + (nz / l) * off)
    }
    pos.needsUpdate = true
  }

  // --- Eagle's Eye prediction: dots along each moving ball's simulated path ---
  const PATH_PTS = 1400
  const pathGeo = new BufferGeometry()
  const pathPos = new Float32Array(PATH_PTS * 3)
  const pathCol = new Float32Array(PATH_PTS * 3)
  pathGeo.setAttribute('position', new BufferAttribute(pathPos, 3).setUsage(DynamicDrawUsage))
  pathGeo.setAttribute('color', new BufferAttribute(pathCol, 3).setUsage(DynamicDrawUsage))
  pathGeo.setDrawRange(0, 0)
  const path = new Points(pathGeo, new PointsMaterial({ size: 0.014, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }))
  path.renderOrder = 10
  path.frustumCulled = false
  path.visible = false
  root.add(path)
  const ghostSim = createSim()
  let predictKey = ''
  let predictAt = 0
  const WHITE = new Color('#ffffff')
  const GOLD = new Color('#ffd23d')
  function predict(elapsed) {
    const c = ctx.sim().balls[0]
    const power = ctx.power() > 0.03 ? ctx.power() : 0.55
    const sp = ctx.spin()
    const key = [ctx.aim().toFixed(3), power.toFixed(2), sp.x.toFixed(2), sp.y.toFixed(2), ctx.elev().toFixed(2), c.x.toFixed(3), c.z.toFixed(3)].join()
    if (key === predictKey || elapsed - predictAt < 0.08) return
    predictKey = key
    predictAt = elapsed
    const src = ctx.sim().balls
    for (let i = 0; i < 16; i++) {
      const a = src[i]
      Object.assign(ghostSim.balls[i], { x: a.x, z: a.z, vx: 0, vz: 0, on: a.on, pocket: -1, sunk: 0 })
    }
    ghostSim.events.length = 0
    ghostSim.shoot(ctx.aim(), ctx.speedFor(power), { x: sp.x, y: sp.y, elev: ctx.elev() })
    const trails = Array.from({ length: 16 }, () => [])
    for (let s = 0; s < 260 && ghostSim.moving(); s++) {
      ghostSim.step(1 / 60)
      if (s % 2) continue
      for (const b of ghostSim.balls) if (b.on && (b.vx || b.vz)) trails[b.n].push(b.x, b.z)
    }
    ghostSim.events.length = 0
    let k = 0
    for (let n = 0; n < 16 && k < PATH_PTS; n++) {
      const tr = trails[n]
      const col = n === 0 ? WHITE : GOLD
      for (let i = 0; i < tr.length && k < PATH_PTS; i += 2) {
        pathPos[k * 3] = t.x + tr[i]
        pathPos[k * 3 + 1] = bedY + 0.006
        pathPos[k * 3 + 2] = t.z + tr[i + 1]
        pathCol[k * 3] = col.r
        pathCol[k * 3 + 1] = col.g
        pathCol[k * 3 + 2] = col.b
        k++
      }
    }
    pathGeo.setDrawRange(0, k)
    pathGeo.attributes.position.needsUpdate = true
    pathGeo.attributes.color.needsUpdate = true
  }

  // a free spot on the cloth (table-local), clear of the balls and cushions
  function freeSpot(minX, maxX, clear = R * 3.2) {
    const balls = ctx.sim().balls
    for (let i = 0; i < 60; i++) {
      const x = rnd(minX, maxX)
      const z = rnd(-BED.hz + 0.2, BED.hz - 0.2)
      if (balls.every((b) => !b.on || Math.hypot(b.x - x, b.z - z) > clear)) return { x, z }
    }
    return { x: (minX + maxX) / 2, z: 0 }
  }
  const nearestPocket = (x, z) => {
    let best = null
    let bd = Infinity
    for (const [px, pz] of POCKETS) {
      const d = Math.hypot(px - x, pz - z)
      if (d < bd) {
        bd = d
        best = { x: px, z: pz, d }
      }
    }
    return best
  }
  // speed that carries a ball `d` m across the cloth (rolling resistance + drag), with margin
  const reach = (d) => clamp(Math.sqrt(2 * 0.7 * d) + 0.35 + d * 0.25, 0.9, 4)
  function launchAtPocket(b, min = 0) {
    const p = nearestPocket(b.x, b.z)
    const sp = Math.max(min, reach(p.d))
    b.vx = ((p.x - b.x) / p.d) * sp
    b.vz = ((p.z - b.z) / p.d) * sp
  }

  // --- per-match / per-shot state ---
  let distract = false
  let rewindSnap = null
  let caught = false
  let chained = false
  let flashed = false
  let shot = '' // the ability riding on the shot in flight

  const P = {
    TINT,
    get kind() {
      return kind
    },
    get distract() {
      return distract
    },
    get shot() {
      return shot
    },
    isInstant: (id) => INSTANT.has(id),
    longGuide: (id) => LONG_GUIDE.has(id),
    begin(table, id) {
      t = table
      kind = ABILITY_BY_ID[id] ? id : ''
      distract = false
      P.clear()
    },
    // The bar was full and the player activated: set up what the ability needs before the shot.
    arm(id) {
      if (id === 'lookOverThere') {
        distract = true
        asfx.distract()
        ctx.popup('LOOK OVER THERE!', 0, 0, '#ffb02e')
        return
      }
      if (id === 'portals') {
        const a = freeSpot(-BED.hx + 0.3, -0.25)
        const b = freeSpot(0.25, BED.hx - 0.3)
        portals = Math.random() < 0.5 ? [a, b] : [b, a]
      }
      if (id === 'blackHole') {
        holeAt = freeSpot(-0.35, 0.35, R * 2.2)
        asfx.holeOpen()
      }
      if (id === 'verity') {
        const best = pickShot(ctx.sim(), ctx.legal, 1)
        if (best?.target >= 0) ctx.setAim(best.angle)
      }
      if (id === 'magnet') asfx.magnet()
      asfx.arm(id)
    },
    // The shot leaves the cue with ability `id` ('' = none): its sim mods and speed.
    shoot(id, speed) {
      shot = id
      caught = chained = flashed = false
      rewindSnap = null
      const mine = ctx.mine
      let mods = null
      if (id === 'fireShot') speed = Math.min(12.5, speed * 1.8)
      else if (id === 'superBounce') mods = { railE: 1.0 }
      else if (id === 'magnet') mods = { time: 6, pulls: POCKETS.map(([x, z]) => ({ x, z, r: 0.4, accel: 2.6, filter: mine, max: 2.2 })) }
      else if (id === 'rewind') rewindSnap = ctx.sim().balls.map((b) => ({ x: b.x, z: b.z, on: b.on, pocket: b.pocket, q: b.q.clone() }))
      else if (id === 'portals' && portals) mods = { portals, portalR: R * 1.7 }
      else if (id === 'catchABall') mods = { noScratch: true }
      else if (id === 'chainLightning') mods = { onCueHit: (b) => chain(b) }
      else if (id === 'steelBall') {
        speed = Math.min(12.5, speed * 1.15)
        mods = { cueMass: 3, onCueHit: (b, rel) => steelHit(b, rel) }
      } else if (id === 'blackFlash') {
        speed = Math.min(12.5, speed * 1.6)
        const legal = ctx.legal
        mods = { ghost: (n) => !legal(n), onCueHit: (b) => blackFlash(b) }
      } else if (id === 'blackHole' && holeAt) mods = { time: 5, pulls: [{ x: holeAt.x, z: holeAt.z, r: 0.6, accel: 3.2, filter: mine, swallow: R * 0.9, max: 2.6 }] }
      else if (id === 'guangdongTiger') {
        speed = Math.min(12.5, speed * 1.4)
        mods = { cueRailE: 0.98, onCueHit: (b) => tiger(b) }
        asfx.roar()
        ctx.popup('ROAR!', 0, 0, '#ff9a1a')
        ctx.shake(0.8)
      } else if (id === 'timeStop') asfx.timeStop()
      return { mods, speed }
    },
    // The opponent's shot: wild if distracted. Returns the (maybe) changed shot.
    aiShot(s) {
      if (!distract) return s
      distract = false
      ctx.popup('HUH?!', 0, 0, '#ffb02e')
      asfx.distract()
      const off = rnd(0.18, 0.55) * (Math.random() < 0.5 ? -1 : 1)
      return { ...s, angle: s.angle + off, speed: s.speed * rnd(0.45, 1.15) }
    },
    // Table event during my match (sim coords + world wx/wz).
    event(ev) {
      if (ev.type === 'portal') {
        asfx.warp()
        mfx.sparkle(t.x + ev.fx, bedY + R, t.z + ev.fz, '#7b4dff', 14)
        mfx.sparkle(ev.wx, bedY + R, ev.wz, '#ff8a2a', 14)
      } else if (ev.type === 'caught') {
        asfx.caught()
        ctx.popup('SAVED!', ev.x, ev.z, '#ffe0b8')
      } else if (ev.type === 'pocket' && ev.swallow) {
        asfx.swallow()
        mfx.sparkle(ev.wx, bedY + R, ev.wz, '#b46cff', 24)
      } else if (ev.type === 'rail' && shot === 'superBounce' && ev.speed > 0.6) mfx.sparkle(ev.wx, bedY + R, ev.wz, '#5cc8ff', 6)
    },
    // The balls stopped. True = something set them rolling again (Catch-a-Ball's drop).
    settle() {
      if (shot !== 'catchABall' || caught) return false
      caught = true
      const sim = ctx.sim()
      let best = null
      let bd = 0.34
      for (const b of sim.balls) {
        if (!b.on || !ctx.mine(b.n)) continue
        const p = nearestPocket(b.x, b.z)
        if (p.d < bd) {
          bd = p.d
          best = b
        }
      }
      if (!best) return false
      launchAtPocket(best, 1.1)
      ctx.popup('CAUGHT!', best.x, best.z, '#ffe0b8')
      asfx.caught()
      return true
    },
    // Rewind: a shot of mine that pots nothing of mine (or fouls) goes back. True = rewound.
    rewind(badShot) {
      if (shot !== 'rewind' || !rewindSnap || !badShot) return false
      const sim = ctx.sim()
      sim.balls.forEach((b, i) => {
        const s = rewindSnap[i]
        Object.assign(b, { x: s.x, z: s.z, on: s.on, pocket: s.pocket, vx: 0, vz: 0, sunk: s.on ? 0 : 9 })
        b.q.copy(s.q)
      })
      sim.sunkThisShot = []
      rewindSnap = null
      asfx.rewind()
      ctx.banner('turn', 'REWIND!', 'Take that shot again', 1.6)
      return true
    },
    keepsTurn: () => shot === 'timeStop',
    // every frame
    update(dt, elapsed, armed) {
      if (!t) return
      const phase = ctx.phase()
      const live = phase === 'rolling' || phase === 'strike'
      // portals while armed / in the shot
      const showPortals = !!portals && (armed === 'portals' || (shot === 'portals' && live))
      portalMeshes.forEach((g, i) => {
        g.visible = showPortals
        if (!showPortals) return
        g.position.set(t.x + portals[i].x, y0, t.z + portals[i].z)
        g.userData.sw.rotation.z = elapsed * (i ? -3 : 3)
        const s = 1 + Math.sin(elapsed * 6 + i) * 0.06
        g.scale.set(s, 1, s)
      })
      // black hole
      const showHole = !!holeAt && (armed === 'blackHole' || (shot === 'blackHole' && live))
      hole.visible = showHole
      if (showHole) {
        hole.position.set(t.x + holeAt.x, y0, t.z + holeAt.z)
        holeSwirl.rotation.z = elapsed * 2.4
        holeRing.scale.setScalar(1 + Math.sin(elapsed * 3) * 0.04)
        if (Math.random() < 0.7) {
          const a = rnd(0, 6.283)
          const r = rnd(0.25, 0.55)
          mfx.suck(t.x + holeAt.x + Math.cos(a) * r, bedY + 0.02, t.z + holeAt.z + Math.sin(a) * r, t.x + holeAt.x, t.z + holeAt.z, '#c88bff')
        }
      }
      // magnets
      const showMag = armed === 'magnet' || (shot === 'magnet' && live)
      magnets.forEach((m, i) => {
        m.visible = showMag
        if (!showMag) return
        m.position.set(t.x + POCKETS[i][0], y0, t.z + POCKETS[i][1])
        const k = (elapsed * 1.2 + i * 0.17) % 1
        m.scale.setScalar(1.15 - k * 0.6)
        m.material.opacity = 0.15 + k * 0.5
        m.material.color.set(i % 2 ? '#ff3355' : '#6f9dff')
      })
      // Eagle's Eye path while aiming
      const eye = armed === 'eaglesEye' && phase === 'aim'
      path.visible = eye
      if (eye) predict(elapsed)
      else predictKey = ''
      // bolts flicker + fade
      for (const b of bolts) {
        if (b.life <= 0) continue
        b.life -= dt
        if (Math.random() < 0.5) jag(b)
        b.line.material.opacity = clamp(b.life / 0.3, 0, 1)
        if (b.life <= 0) b.line.visible = false
      }
    },
    clear() {
      portals = null
      holeAt = null
      rewindSnap = null
      shot = ''
      for (const g of portalMeshes) g.visible = false
      hole.visible = false
      for (const m of magnets) m.visible = false
      for (const b of bolts) {
        b.life = 0
        b.line.visible = false
      }
      path.visible = false
    },
    // the shot is resolved: its one-shot visuals go
    endShot() {
      if (shot === 'portals') portals = null
      if (shot === 'blackHole') holeAt = null
      shot = ''
    },
  }

  // --- strike callbacks (inside the physics substep) ---
  function chain(hit) {
    if (chained) return
    chained = true
    const sim = ctx.sim()
    const targets = sim.balls
      .filter((b) => b.on && b !== hit && ctx.mine(b.n))
      .sort((a, b) => Math.hypot(a.x - hit.x, a.z - hit.z) - Math.hypot(b.x - hit.x, b.z - hit.z))
      .slice(0, 3)
    for (const b of targets) {
      launchAtPocket(b)
      bolt(hit.x, hit.z, b.x, b.z)
      mfx.sparkle(t.x + b.x, bedY + R, t.z + b.z, '#6ef0ff', 10)
    }
    if (targets.length) {
      asfx.zap()
      ctx.shake(0.4)
    }
  }
  function steelHit(b, rel) {
    asfx.clank()
    mfx.sparkle(t.x + b.x, bedY + R, t.z + b.z, '#e0ffe8', Math.min(18, 4 + rel * 3))
    if (rel > 2) ctx.shake(0.5)
  }
  function blackFlash(b) {
    if (flashed) return
    flashed = true
    asfx.flash()
    mfx.sparkle(t.x + b.x, bedY + R, t.z + b.z, '#ff1030', 30)
    mfx.sparkle(t.x + b.x, bedY + R, t.z + b.z, '#200008', 20)
    ctx.flash('#ff1030')
    ctx.shake(1)
  }
  function tiger(b) {
    mfx.sparkle(t.x + b.x, bedY + R, t.z + b.z, '#ff9a1a', 16)
    if (!ctx.mine(b.n)) return
    launchAtPocket(b, 2.2)
  }

  return P
}
