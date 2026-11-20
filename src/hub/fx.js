// Particles and small effects: cherry petals drifting off the trees, sparkles
// rising off the player's pad, confetti and a shock ring when you join, the
// fire pit's flames + embers (with a flickering light), and motes/fireflies
// that glow after dark. Counts scale with the graphics preset.
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Points,
  RingGeometry,
  ShaderMaterial,
} from 'three'
import { paintSoftDot, paintSparkle } from '../textures.js'
import { floorAt } from './layout.js'

const rnd = (a, b) => a + Math.random() * (b - a)
const dummy = new Object3D()

// Additive point sprites with per-point size and colour*alpha (fades without sorting).
function pointCloud(n, texCanvas) {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage))
  geo.setAttribute('color', new BufferAttribute(new Float32Array(n * 3), 3).setUsage(DynamicDrawUsage))
  geo.setAttribute('size', new BufferAttribute(new Float32Array(n), 1).setUsage(DynamicDrawUsage))
  const mat = new ShaderMaterial({
    uniforms: { map: { value: new CanvasTexture(texCanvas) }, scale: { value: 600 } },
    vertexShader: `
      attribute float size; attribute vec3 color; varying vec3 vColor;
      uniform float scale;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map; varying vec3 vColor;
      void main() { gl_FragColor = vec4(vColor, 1.0) * texture2D(map, gl_PointCoord); }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
  })
  const pts = new Points(geo, mat)
  pts.frustumCulled = false
  return pts
}

export function createFx(scene, { petalSources, firePos, quality = 1 }) {
  // --- petals ---
  const nPetals = Math.round(260 * quality)
  const petalGeo = new PlaneGeometry(0.1, 0.075, 2, 1)
  petalGeo.attributes.position.setZ(1, 0.02) // a slight curl
  petalGeo.attributes.position.setZ(4, 0.02)
  const petals = new InstancedMesh(petalGeo, new MeshStandardMaterial({ color: '#ffffff', roughness: 0.7, side: DoubleSide }), nPetals)
  petals.instanceMatrix.setUsage(DynamicDrawUsage)
  const pinks = ['#ffc6da', '#ffd9e6', '#f7a9c6', '#fff0f5'].map((c) => new Color(c))
  const P = []
  for (let i = 0; i < nPetals; i++) {
    petals.setColorAt(i, pinks[i % pinks.length])
    P.push(spawnPetal({}, true))
  }
  function spawnPetal(p, scatter = false) {
    const s = petalSources[Math.floor(Math.random() * petalSources.length)]
    p.x = s.x + rnd(-1.3, 1.3)
    p.y = scatter ? rnd(0, s.y) : s.y + rnd(-0.4, 0.3)
    p.z = s.z + rnd(-1.3, 1.3)
    p.vy = -rnd(0.25, 0.5)
    p.phase = rnd(0, 6.28)
    p.spin = rnd(1.5, 4)
    p.rest = 0
    p.rx = rnd(0, 6)
    p.ry = rnd(0, 6)
    return p
  }
  petals.frustumCulled = false
  scene.add(petals)

  // --- sparkles over a pad ---
  const nSpark = 70
  const spark = pointCloud(nSpark, paintSparkle(64))
  scene.add(spark)
  const S = Array.from({ length: nSpark }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vy: 0 }))
  let sparkZone = null
  let sparkColor = new Color('#7fd8ff')

  // --- confetti ---
  const nConf = Math.round(160 * Math.max(0.5, quality))
  const conf = new InstancedMesh(new PlaneGeometry(0.09, 0.05), new MeshBasicMaterial({ side: DoubleSide }), nConf)
  conf.instanceMatrix.setUsage(DynamicDrawUsage)
  const confCols = ['#ff4f8b', '#ffd23d', '#3dff8a', '#36b9ff', '#b46bff', '#ffffff'].map((c) => new Color(c))
  const CF = Array.from({ length: nConf }, (_, i) => {
    conf.setColorAt(i, confCols[i % confCols.length])
    return { life: 0, x: 0, y: -50, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, s: rnd(2, 8) }
  })
  conf.frustumCulled = false
  scene.add(conf)

  // --- shock ring ---
  const ring = new Mesh(new RingGeometry(0.8, 1, 48), new MeshBasicMaterial({ color: '#3dff8a', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }))
  ring.rotation.x = -Math.PI / 2
  ring.visible = false
  scene.add(ring)
  let ringT = 1

  // --- fire ---
  const nFlame = Math.round(70 * Math.max(0.5, quality))
  const flames = pointCloud(nFlame, paintSoftDot(64))
  scene.add(flames)
  const F = Array.from({ length: nFlame }, () => ({ life: Math.random(), max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ember: false }))
  const fireLight = new PointLight('#ff8a3a', 6, 9, 2)
  fireLight.position.set(firePos.x, firePos.y + 0.8, firePos.z)
  scene.add(fireLight)
  const flameHot = new Color('#ffd27a')
  const flameCool = new Color('#ff3b12')

  // --- motes / fireflies ---
  const nMotes = Math.round(90 * quality)
  const motes = pointCloud(nMotes, paintSoftDot(32))
  scene.add(motes)
  const MO = Array.from({ length: nMotes }, () => ({ x: rnd(-38, 38), y: rnd(0.4, 3.5), z: rnd(-33, 33), p: rnd(0, 6.28), s: rnd(0.3, 1) }))

  const col = new Color()
  const wind = { x: 0.35, z: 0.12 }
  function update(dt, elapsed, { night = 0, player } = {}) {
    // petals: flutter down, rest a while on the floor, then respawn
    for (let i = 0; i < nPetals; i++) {
      const p = P[i]
      const floor = floorAt(p.x, p.z) + 0.01
      if (p.rest > 0) {
        p.rest -= dt
        if (p.rest <= 0) spawnPetal(p)
      } else {
        p.phase += dt * p.spin
        p.x += (wind.x + Math.sin(p.phase) * 0.35) * dt
        p.z += (wind.z + Math.cos(p.phase * 0.7) * 0.25) * dt
        p.y += (p.vy + Math.sin(p.phase * 1.3) * 0.12) * dt
        p.rx += dt * p.spin
        p.ry += dt * p.spin * 0.6
        if (p.y <= floor) {
          p.y = floor
          p.rest = rnd(3, 8)
          p.rx = Math.PI / 2
        }
        if (Math.abs(p.x) > 41 || Math.abs(p.z) > 35) spawnPetal(p)
      }
      dummy.position.set(p.x, p.y, p.z)
      dummy.rotation.set(p.rx, p.ry, 0)
      const s = p.rest > 0 ? Math.min(1, p.rest) : 1
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      petals.setMatrixAt(i, dummy.matrix)
    }
    petals.instanceMatrix.needsUpdate = true

    // sparkles rising off the active pad
    const sp = spark.geometry.attributes
    for (let i = 0; i < nSpark; i++) {
      const s = S[i]
      if (s.life <= 0 && sparkZone && Math.random() < dt * 6) {
        s.max = s.life = rnd(0.8, 1.6)
        s.x = sparkZone.x + rnd(-sparkZone.hx, sparkZone.hx)
        s.z = sparkZone.z + rnd(-sparkZone.hz, sparkZone.hz)
        s.y = 0.05
        s.vy = rnd(0.5, 1.3)
      }
      if (s.life > 0) {
        s.life -= dt
        s.y += s.vy * dt
      }
      const a = s.life > 0 ? Math.sin((s.life / s.max) * Math.PI) : 0
      sp.position.setXYZ(i, s.x, s.y, s.z)
      sp.color.setXYZ(i, sparkColor.r * a, sparkColor.g * a, sparkColor.b * a)
      sp.size.setX(i, 0.35 * a)
    }
    sp.position.needsUpdate = sp.color.needsUpdate = sp.size.needsUpdate = true

    // confetti
    let anyConf = false
    for (let i = 0; i < nConf; i++) {
      const c = CF[i]
      if (c.life > 0) {
        anyConf = true
        c.life -= dt
        c.vy -= 6 * dt
        c.vx *= 1 - dt * 1.5
        c.vz *= 1 - dt * 1.5
        c.vy = Math.max(c.vy, -1.4) // paper flutters down slowly
        c.x += c.vx * dt + Math.sin(elapsed * c.s) * 0.3 * dt
        c.y += c.vy * dt
        c.z += c.vz * dt
        c.rx += dt * c.s
        c.ry += dt * c.s * 0.7
        if (c.y < 0.02) {
          c.y = 0.02
          c.vy = 0
          c.vx = c.vz = 0
        }
      }
      dummy.position.set(c.x, c.life > 0 ? c.y : -50, c.z)
      dummy.rotation.set(c.rx, c.ry, 0)
      dummy.scale.setScalar(c.life > 0 ? Math.min(1, c.life) : 0)
      dummy.updateMatrix()
      conf.setMatrixAt(i, dummy.matrix)
    }
    if (anyConf || conf.userData.wasActive) conf.instanceMatrix.needsUpdate = true
    conf.userData.wasActive = anyConf

    // shock ring
    if (ringT < 1) {
      ringT += dt * 1.6
      ring.scale.setScalar(0.6 + ringT * 4)
      ring.material.opacity = (1 - ringT) * 0.9
      ring.visible = ringT < 1
    }

    // fire
    const fa = flames.geometry.attributes
    for (let i = 0; i < nFlame; i++) {
      const f = F[i]
      f.life -= dt
      if (f.life <= 0) {
        f.ember = Math.random() < 0.18
        f.max = f.life = f.ember ? rnd(1.2, 2.2) : rnd(0.45, 0.9)
        const a = rnd(0, 6.28)
        const r = rnd(0, 0.42)
        f.x = firePos.x + Math.cos(a) * r
        f.z = firePos.z + Math.sin(a) * r
        f.y = firePos.y + 0.15
        f.vx = rnd(-0.1, 0.1) + wind.x * 0.2
        f.vz = rnd(-0.1, 0.1)
        f.vy = f.ember ? rnd(0.8, 1.6) : rnd(0.6, 1.2)
      }
      const t = 1 - f.life / f.max
      f.x += (f.vx + Math.sin(elapsed * 9 + i) * (f.ember ? 0.4 : 0.15)) * dt
      f.z += f.vz * dt
      f.y += f.vy * dt
      if (!f.ember) {
        // pull flames towards the centre as they rise
        f.x += (firePos.x - f.x) * dt * 1.5
        f.z += (firePos.z - f.z) * dt * 1.5
      }
      col.copy(flameHot).lerp(flameCool, t)
      const a = f.ember ? (1 - t) * 1.4 : Math.sin(t * Math.PI) * 1.1
      fa.position.setXYZ(i, f.x, f.y, f.z)
      fa.color.setXYZ(i, col.r * a, col.g * a, col.b * a)
      fa.size.setX(i, f.ember ? 0.06 : (0.55 - t * 0.35) * 1.2)
    }
    fa.position.needsUpdate = fa.color.needsUpdate = fa.size.needsUpdate = true
    fireLight.intensity = 5 + Math.sin(elapsed * 17) * 1 + Math.sin(elapsed * 7.3) * 1.4 + night * 6

    // motes by day, fireflies by night
    const ma = motes.geometry.attributes
    for (let i = 0; i < nMotes; i++) {
      const m = MO[i]
      m.p += dt * m.s
      const x = m.x + Math.sin(m.p) * 1.2
      const y = m.y + Math.sin(m.p * 1.7) * 0.4
      const z = m.z + Math.cos(m.p * 0.8) * 1.2
      const blink = 0.5 + 0.5 * Math.sin(elapsed * 2.5 + i)
      const a = 0.12 + night * blink * 1.6
      ma.position.setXYZ(i, x, y, z)
      ma.color.setXYZ(i, (1 - night * 0.3) * a, (0.95 + night * 0.05) * a, (0.8 - night * 0.4) * a)
      ma.size.setX(i, 0.07 + night * 0.06)
    }
    ma.position.needsUpdate = ma.color.needsUpdate = ma.size.needsUpdate = true
  }

  return {
    update,
    // sparkles rise off this zone (null = none); colour per pad state
    setSparkZone(zone, color) {
      sparkZone = zone
      if (color) sparkColor.set(color)
    },
    burst(x, y, z, color = '#3dff8a') {
      let k = 0
      for (const c of CF) {
        if (k++ > nConf * 0.75) break
        c.life = rnd(1.8, 3)
        c.x = x + rnd(-0.4, 0.4)
        c.y = y
        c.z = z + rnd(-0.4, 0.4)
        const a = rnd(0, 6.28)
        const sp = rnd(1, 3.2)
        c.vx = Math.cos(a) * sp
        c.vz = Math.sin(a) * sp
        c.vy = rnd(3.5, 6.5)
      }
      ring.position.set(x, 0.06, z)
      ring.material.color.set(color)
      ringT = 0
      ring.visible = true
    },
    setScale(px) {
      for (const pc of [spark, flames, motes]) pc.material.uniforms.scale.value = px
    },
  }
}
