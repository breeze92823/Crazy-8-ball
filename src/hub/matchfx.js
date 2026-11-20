// Effects for the player's match (match.js): pooled GPU points for chalk dust,
// impact sparks, pocket bursts and the fire-shot trail; light rays shooting up
// out of a pocket; scorch marks left on the cloth by a fire shot; a flame aura
// on the cue ball while the fire shot is armed. Everything is pooled: no
// allocation per frame.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Object3D,
  PlaneGeometry,
  Points,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
} from 'three'

const rnd = (a, b) => a + Math.random() * (b - a)

function softDot(size = 64, hard = 0.0) {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(Math.max(0.01, hard), 'rgba(255,255,255,0.85)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, size, size)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
function rayTexture() {
  const c = document.createElement('canvas')
  c.width = 32
  c.height = 128
  const g = c.getContext('2d')
  const grd = g.createLinearGradient(0, 128, 0, 0)
  grd.addColorStop(0, 'rgba(255,255,255,1)')
  grd.addColorStop(0.5, 'rgba(255,255,255,0.5)')
  grd.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 32, 128)
  const h = g.createLinearGradient(0, 0, 32, 0)
  h.addColorStop(0, 'rgba(0,0,0,1)')
  h.addColorStop(0.5, 'rgba(0,0,0,0)')
  h.addColorStop(1, 'rgba(0,0,0,1)')
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = h
  g.fillRect(0, 0, 32, 128)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}
function scorchTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(20,12,8,0.75)')
  grd.addColorStop(0.55, 'rgba(30,18,10,0.45)')
  grd.addColorStop(1, 'rgba(30,18,10,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  return new CanvasTexture(c)
}

// A pool of round particles drawn as screen-facing points sized in metres.
function pointPool(n, additive, map) {
  const geo = new BufferGeometry()
  const pos = new Float32Array(n * 3)
  const col = new Float32Array(n * 4)
  const size = new Float32Array(n)
  geo.setAttribute('position', new BufferAttribute(pos, 3).setUsage(DynamicDrawUsage))
  geo.setAttribute('color', new BufferAttribute(col, 4).setUsage(DynamicDrawUsage))
  geo.setAttribute('size', new BufferAttribute(size, 1).setUsage(DynamicDrawUsage))
  const mat = new ShaderMaterial({
    uniforms: { map: { value: map }, scale: { value: 600 } },
    vertexShader: `
      attribute float size; attribute vec4 color; varying vec4 vC;
      uniform float scale;
      void main() {
        vC = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / max(0.05, -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map; varying vec4 vC;
      void main() {
        vec4 t = texture2D(map, gl_PointCoord);
        gl_FragColor = vec4(vC.rgb, vC.a * t.a);
        if (gl_FragColor.a < 0.01) discard;
      }`,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  })
  const pts = new Points(geo, mat)
  pts.frustumCulled = false
  pts.renderOrder = additive ? 12 : 11
  const P = []
  for (let i = 0; i < n; i++) P.push({ life: 0, max: 1, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, s0: 0, s1: 0, r: 1, g: 1, b: 1, r2: 1, g2: 1, b2: 1, a: 1, drag: 0, grav: 0 })
  let next = 0
  return {
    pts,
    mat,
    emit(o) {
      const p = P[next]
      next = (next + 1) % n
      p.life = p.max = o.life ?? 0.6
      p.x = o.x
      p.y = o.y
      p.z = o.z
      p.vx = o.vx ?? 0
      p.vy = o.vy ?? 0
      p.vz = o.vz ?? 0
      p.s0 = o.size ?? 0.03
      p.s1 = o.size2 ?? p.s0
      const c1 = o.color
      const c2 = o.color2 ?? c1
      p.r = c1.r
      p.g = c1.g
      p.b = c1.b
      p.r2 = c2.r
      p.g2 = c2.g
      p.b2 = c2.b
      p.a = o.alpha ?? 1
      p.drag = o.drag ?? 2
      p.grav = o.grav ?? 0
    },
    update(dt) {
      for (let i = 0; i < n; i++) {
        const p = P[i]
        if (p.life <= 0) {
          size[i] = 0
          continue
        }
        p.life -= dt
        const k = Math.max(0, p.life / p.max) // 1 -> 0
        const f = Math.exp(-p.drag * dt)
        p.vx *= f
        p.vy = p.vy * f + p.grav * dt
        p.vz *= f
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.z += p.vz * dt
        pos[i * 3] = p.x
        pos[i * 3 + 1] = p.y
        pos[i * 3 + 2] = p.z
        const u = 1 - k
        col[i * 4] = p.r + (p.r2 - p.r) * u
        col[i * 4 + 1] = p.g + (p.g2 - p.g) * u
        col[i * 4 + 2] = p.b + (p.b2 - p.b) * u
        col[i * 4 + 3] = p.a * Math.min(1, k * 2.2) * Math.min(1, (1 - k) * 12 + 0.25)
        size[i] = p.s0 + (p.s1 - p.s0) * u
      }
      geo.attributes.position.needsUpdate = true
      geo.attributes.color.needsUpdate = true
      geo.attributes.size.needsUpdate = true
    },
    clear() {
      for (const p of P) p.life = 0
    },
  }
}

export function createMatchFx(scene, bedY) {
  const root = new Group()
  scene.add(root)
  const dot = softDot(64, 0.15)
  const add = pointPool(700, true, dot)
  const soft = pointPool(400, false, softDot(64, 0.0))
  root.add(add.pts, soft.pts)
  const C = (hex) => new Color(hex)
  const WHITE = C('#ffffff')
  const CHALK = C('#9fc4ff')
  const SMOKE = C('#3a332e')
  const FIRE1 = C('#fff1a8')
  const FIRE2 = C('#ff5a12')
  const EMBER = C('#ff9a2a')
  const tmp = new Color()
  // two cached colours per call site (no allocation per particle)
  const tints = [new Color(), new Color()]
  const tintKeys = ['', '']
  const tintCol = (hex, i) => {
    if (tintKeys[i] !== hex) {
      tintKeys[i] = hex
      tints[i].set(hex)
    }
    return tints[i]
  }

  // --- light rays out of a pocket ---
  const rayGeo = new CylinderGeometry(0.012, 0.03, 1, 6, 1, true)
  rayGeo.translate(0, 0.5, 0)
  const rayMap = rayTexture()
  const raySets = []
  for (let s = 0; s < 4; s++) {
    const g = new Group()
    g.visible = false
    const rays = []
    for (let i = 0; i < 9; i++) {
      const m = new Mesh(rayGeo, new MeshBasicMaterial({ map: rayMap, color: '#ffffff', transparent: true, depthWrite: false, blending: AdditiveBlending }))
      m.renderOrder = 13
      g.add(m)
      rays.push({ m, tilt: 0, yaw: 0, len: 0, delay: 0 })
    }
    root.add(g)
    raySets.push({ g, rays, t: 9 })
  }
  let rayNext = 0

  // --- scorch marks (fire shot) ---
  const SCORCH_N = 900
  const scorchGeo = new PlaneGeometry(1, 1)
  scorchGeo.rotateX(-Math.PI / 2)
  const scorch = new InstancedMesh(scorchGeo, new MeshBasicMaterial({ map: scorchTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }), SCORCH_N)
  scorch.count = 0
  scorch.frustumCulled = false
  scorch.renderOrder = 2
  root.add(scorch)
  const dummy = new Object3D()
  let scorchNext = 0

  // --- flame aura on the armed cue ball (two additive sprites) ---
  const auraMat = new SpriteMaterial({ map: dot, color: '#ff4a00', transparent: true, depthWrite: false, blending: AdditiveBlending })
  const aura = new Sprite(auraMat)
  const core = new Sprite(new SpriteMaterial({ map: dot, color: '#ff9a2a', opacity: 0.6, transparent: true, depthWrite: false, blending: AdditiveBlending }))
  aura.renderOrder = core.renderOrder = 14
  aura.visible = core.visible = false
  root.add(aura, core)

  const fx = {
    // chalk puff off the cue tip + a tiny flash where it meets the ball
    cueHit(x, y, z, dx, dz, power) {
      const n = 6 + Math.round(power * 10)
      for (let i = 0; i < n; i++) {
        soft.emit({ x: x - dx * 0.05, y, z: z - dz * 0.05, vx: -dx * rnd(0.1, 0.5) + rnd(-0.25, 0.25), vy: rnd(0.05, 0.35), vz: -dz * rnd(0.1, 0.5) + rnd(-0.25, 0.25), life: rnd(0.4, 0.9), size: 0.015, size2: rnd(0.05, 0.09), color: CHALK, alpha: 0.55, drag: 3.5, grav: -0.1 })
      }
      for (let i = 0; i < 4 + power * 6; i++) add.emit({ x, y, z, vx: rnd(-1, 1) * 0.6, vy: rnd(0, 0.8), vz: rnd(-1, 1) * 0.6, life: rnd(0.08, 0.2), size: 0.02, size2: 0.004, color: WHITE, drag: 6 })
    },
    // a hard ball-on-ball hit throws a few sparks
    ballHit(x, y, z, speed) {
      if (speed < 0.9) return
      const n = Math.min(12, Math.round(speed * 2.2))
      for (let i = 0; i < n; i++) {
        const a = rnd(0, 6.283)
        const s = rnd(0.4, 1.2) * Math.min(2.5, speed * 0.5)
        add.emit({ x, y: y + 0.01, z, vx: Math.cos(a) * s, vy: rnd(0.2, 1.4), vz: Math.sin(a) * s, life: rnd(0.12, 0.3), size: 0.016, size2: 0.003, color: WHITE, color2: C('#a8e8ff'), drag: 4, grav: -5 })
      }
    },
    railHit(x, y, z, speed) {
      if (speed < 1.4) return
      for (let i = 0; i < 5; i++) soft.emit({ x, y: y - 0.02, z, vx: rnd(-0.3, 0.3), vy: rnd(0.05, 0.25), vz: rnd(-0.3, 0.3), life: rnd(0.3, 0.6), size: 0.01, size2: 0.05, color: C('#e8f6ff'), alpha: 0.35, drag: 4 })
    },
    // a ball drops: rays shoot up out of the pocket, sparkles in its colour, a puff of dust
    pocket(x, z, color, big = false) {
      const col = tmp.set(color).clone()
      const set = raySets[rayNext]
      rayNext = (rayNext + 1) % raySets.length
      set.g.position.set(x, bedY - 0.02, z)
      set.g.visible = true
      set.t = 0
      set.big = big
      set.rays.forEach((r, i) => {
        r.yaw = (i / set.rays.length) * 6.283 + rnd(-0.3, 0.3)
        r.tilt = rnd(0.05, 0.42)
        r.len = rnd(0.35, 0.8) * (big ? 1.6 : 1)
        r.delay = rnd(0, 0.08)
        r.m.material.color.copy(i % 3 === 0 ? col : WHITE)
      })
      for (let i = 0; i < (big ? 46 : 26); i++) {
        const a = rnd(0, 6.283)
        const s = rnd(0.3, 1.3)
        add.emit({ x, y: bedY + 0.03, z, vx: Math.cos(a) * s * 0.6, vy: rnd(0.8, 2.6), vz: Math.sin(a) * s * 0.6, life: rnd(0.35, 0.8), size: rnd(0.02, 0.035), size2: 0.004, color: i % 2 ? WHITE : col, color2: col, drag: 2.5, grav: -4 })
      }
      for (let i = 0; i < 8; i++) soft.emit({ x: x + rnd(-0.04, 0.04), y: bedY + 0.02, z: z + rnd(-0.04, 0.04), vx: rnd(-0.15, 0.15), vy: rnd(0.15, 0.4), vz: rnd(-0.15, 0.15), life: rnd(0.5, 0.9), size: 0.03, size2: 0.12, color: C('#ffffff'), alpha: 0.25, drag: 3 })
    },
    // one tick of the fire trail behind a moving fire-shot cue ball; `tint` [glow, core, p1, p2]
    // recolours it for the other abilities (no smoke / embers then, just a glowing streak)
    fireTrail(x, y, z, vx, vz, dt, tint = null) {
      const sp = Math.hypot(vx, vz)
      const n = Math.min(6, 1 + Math.round(sp * 2))
      const c1 = tint ? tintCol(tint[2], 0) : FIRE1
      const c2 = tint ? tintCol(tint[3], 1) : FIRE2
      for (let i = 0; i < n; i++) {
        add.emit({ x: x + rnd(-0.02, 0.02), y: y + rnd(-0.02, 0.03), z: z + rnd(-0.02, 0.02), vx: -vx * 0.15 + rnd(-0.1, 0.1), vy: rnd(0.3, 0.9) * (tint ? 0.4 : 1), vz: -vz * 0.15 + rnd(-0.1, 0.1), life: rnd(0.2, 0.45), size: rnd(0.05, 0.08) * (tint ? 0.7 : 1), size2: 0.01, color: c1, color2: c2, drag: 3, grav: 0.6 })
      }
      if (tint) return
      if (Math.random() < 0.5) soft.emit({ x, y: y + 0.03, z, vx: rnd(-0.05, 0.05), vy: rnd(0.2, 0.5), vz: rnd(-0.05, 0.05), life: rnd(0.6, 1.1), size: 0.03, size2: 0.12, color: SMOKE, alpha: 0.35, drag: 1.5 })
      if (Math.random() < 0.4) add.emit({ x, y, z, vx: rnd(-0.6, 0.6), vy: rnd(0.4, 1.4), vz: rnd(-0.6, 0.6), life: rnd(0.3, 0.7), size: 0.012, size2: 0.003, color: EMBER, drag: 1.5, grav: -2 })
    },
    // a burst of glowing sparkles (abilities: portals, zaps, swallows, hits)
    sparkle(x, y, z, color, n = 12) {
      const col = new Color(color)
      for (let i = 0; i < n; i++) {
        const a = rnd(0, 6.283)
        const s = rnd(0.3, 1.4)
        add.emit({ x, y, z, vx: Math.cos(a) * s, vy: rnd(0.3, 1.6), vz: Math.sin(a) * s, life: rnd(0.25, 0.6), size: rnd(0.018, 0.035), size2: 0.004, color: WHITE, color2: col, drag: 3, grav: -3 })
      }
    },
    // one particle drifting from (x, z) into (tx, tz): the black hole's inflow
    suck(x, y, z, tx, tz, color) {
      add.emit({ x, y, z, vx: (tx - x) * 2.2, vy: 0, vz: (tz - z) * 2.2, life: 0.42, size: 0.018, size2: 0.004, color: new Color(color), drag: 0 })
    },
    scorch(x, z, r) {
      dummy.position.set(x, bedY + 0.0015, z)
      dummy.rotation.set(0, rnd(0, 6.28), 0)
      const s = r * rnd(2.0, 2.6)
      dummy.scale.set(s, 1, s)
      dummy.updateMatrix()
      scorch.setMatrixAt(scorchNext, dummy.matrix)
      scorchNext = (scorchNext + 1) % SCORCH_N
      scorch.count = Math.max(scorch.count, scorchNext === 0 ? SCORCH_N : scorchNext)
      scorch.instanceMatrix.needsUpdate = true
    },
    clearScorch() {
      scorch.count = 0
      scorchNext = 0
    },
    // an armed ability on the cue ball: glow + licking flames (fire), or the ability's own
    // colours (`tint` [glow, core, particle start, particle end]) with softer rising motes
    setAura(on, x = 0, y = 0, z = 0, r = 0.06, t = 0, tint = null) {
      aura.visible = core.visible = on
      if (!on) return
      const fl = 1 + Math.sin(t * 23) * 0.08 + Math.sin(t * 13.7) * 0.06
      aura.position.set(x, y, z)
      core.position.set(x, y, z)
      aura.scale.setScalar(r * 4.2 * fl)
      core.scale.setScalar(r * 2.6 * fl)
      auraMat.opacity = 0.42
      auraMat.color.set(tint ? tint[0] : '#ff4a00')
      core.material.color.set(tint ? tint[1] : '#ff9a2a')
      const c1 = tint ? tintCol(tint[2], 0) : FIRE1
      const c2 = tint ? tintCol(tint[3], 1) : FIRE2
      if (Math.random() < (tint ? 0.35 : 0.6)) add.emit({ x: x + rnd(-r, r) * 0.8, y: y + rnd(-r, r) * 0.4, z: z + rnd(-r, r) * 0.8, vx: rnd(-0.05, 0.05), vy: rnd(0.25, 0.6), vz: rnd(-0.05, 0.05), life: rnd(0.25, 0.5), size: rnd(0.04, 0.06) * (tint ? 0.6 : 1), size2: 0.008, color: c1, color2: c2, drag: 2, grav: 0.4 })
    },
    setScale(px) {
      add.mat.uniforms.scale.value = px
      soft.mat.uniforms.scale.value = px
    },
    clear() {
      add.clear()
      soft.clear()
      for (const s of raySets) s.g.visible = false
      fx.setAura(false)
    },
    update(dt) {
      add.update(dt)
      soft.update(dt)
      for (const s of raySets) {
        if (!s.g.visible) continue
        s.t += dt
        const dur = s.big ? 0.9 : 0.6
        if (s.t > dur + 0.1) {
          s.g.visible = false
          continue
        }
        for (const r of s.rays) {
          const k = Math.max(0, Math.min(1, (s.t - r.delay) / dur))
          const grow = 1 - Math.pow(1 - Math.min(1, k * 2.5), 3)
          r.m.rotation.set(Math.sin(r.yaw) * r.tilt, 0, Math.cos(r.yaw) * r.tilt)
          r.m.scale.set(1 + k * 1.5, r.len * grow + 0.001, 1 + k * 1.5)
          r.m.material.opacity = (1 - k) * (k > 0 ? 1 : 0)
        }
      }
    },
  }
  return fx
}

// Matrix helper kept for callers that place their own instanced decals.
export const _m4 = new Matrix4()
