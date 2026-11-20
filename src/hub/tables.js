// The pool tables of the hub: their models, the glowing join pads beside them,
// the balls (instanced, one InstancedMesh per ball number across all tables)
// and each table's lobby state:
//   open -> waiting (someone on a pad) -> countdown (full) -> playing (bots) | match (the player)
//   -> cooldown -> open
// Bot games are simulated for real (tablesim.js) so balls roll, clack and drop.
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { LOBBY, PAD, TABLE, TABLE_GRID, TABLE_MODES } from '../config.js'
import { bake } from '../bake.js'
import { label, neon, solidBox } from '../propkit.js'
import { blockRect } from './nav.js'
import { drawPadDecal, paintBadge, paintBall, paintOutline, tex } from './paint.js'
import { TABLE_BED_Y, buildCue, buildPoolTable } from './props.js'
import { createSim, pickShot } from './tablesim.js'

const rnd = (a, b) => a + Math.random() * (b - a)
const OUTLINE = paintOutline()

export function createTables(scene) {
  const listeners = []
  const emit = (type, data) => listeners.forEach((fn) => fn(type, data))
  const tables = []
  const staticGroup = new Group()
  const fxGroup = new Group()
  scene.add(fxGroup)

  // --- tables + pads ---
  TABLE_GRID.rows.forEach((z, r) =>
    TABLE_GRID.cols.forEach((x, c) => {
      const mode = TABLE_GRID.modes[r][c]
      const info = TABLE_MODES[mode]
      const t = {
        id: tables.length,
        x,
        z,
        mode,
        team: info.team,
        cap: info.team * 2,
        state: 'open',
        timer: 0,
        zones: [],
        sim: createSim(),
        turn: 0, // team to shoot
        shotTimer: 0,
        aim: null, // { angle, speed, t, shooter }
        playTime: 0,
        dirty: true, // balls need redraw
        padKey: '',
      }
      const model = buildPoolTable(info.felt)
      model.position.set(x, 0, z)
      staticGroup.add(model)
      solidBox(TABLE.length / 2, TABLE.height / 2, TABLE.width / 2, x, TABLE.height / 2, z)
      blockRect(x, z, TABLE.length / 2, TABLE.width / 2)

      const padZ = z + TABLE.width / 2 + PAD.gap + PAD.depth / 2
      t.padZ = padZ
      if (t.team === 1) t.zones.push(makeZone(t, x, padZ, 4.4, 0, 2))
      else {
        t.zones.push(makeZone(t, x - 1.45, padZ, 2.5, 0, t.team))
        t.zones.push(makeZone(t, x + 1.45, padZ, 2.5, 1, t.team))
        const badge = new Mesh(new PlaneGeometry(1.1, 0.55), new MeshBasicMaterial({ map: tex(paintBadge(mode)), transparent: true, depthWrite: false }))
        badge.rotation.x = -Math.PI / 2
        badge.position.set(x, 0.035, padZ)
        badge.rotation.z = 0.16
        fxGroup.add(badge)
      }
      // a cue that appears for each shot, along the shot line
      t.cue = buildCue()
      t.cue.visible = false
      fxGroup.add(t.cue)
      tables.push(t)
    }),
  )
  const baked = bake(staticGroup, true)
  baked.traverse((o) => {
    if (o.isMesh) o.receiveShadow = true
  })
  scene.add(baked)

  function makeZone(t, x, z, w, team, cap) {
    const d = PAD.depth
    const zone = { table: t, x, z, hx: w / 2, hz: d / 2, team, cap, members: [] }
    // decal (text + translucent fill), redrawn when its counts change
    const c = document.createElement('canvas')
    c.width = 512
    c.height = Math.round((512 * d) / w)
    zone.canvas = c
    zone.texture = new CanvasTexture(c)
    zone.texture.colorSpace = SRGBColorSpace
    zone.decalMat = new MeshBasicMaterial({ map: zone.texture, transparent: true, depthWrite: false, color: new Color(PAD.open), polygonOffset: true, polygonOffsetFactor: -2 })
    const decal = new Mesh(new PlaneGeometry(w, d), zone.decalMat)
    decal.rotation.x = -Math.PI / 2
    decal.position.set(x, 0.02, z)
    fxGroup.add(decal)
    // hologram rings drifting up off the pad
    zone.ringMat = new MeshBasicMaterial({ map: tex(OUTLINE), color: new Color(PAD.open), transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false, side: DoubleSide })
    zone.rings = []
    const ringGeo = new PlaneGeometry(w + 0.12, d + 0.12)
    for (let i = 0; i < 3; i++) {
      const m = new Mesh(ringGeo, zone.ringMat.clone())
      m.rotation.x = -Math.PI / 2
      m.position.set(x, 0.05, z)
      m.renderOrder = 3
      fxGroup.add(m)
      zone.rings.push(m)
    }
    // floating JOIN arrow
    const arrow = new Group()
    const blue = neon('#2f8bff', 2.2)
    const head = new Mesh(new ConeGeometry(0.32, 0.5, 4), blue)
    head.rotation.x = Math.PI
    head.rotation.y = Math.PI / 4
    head.position.y = -0.25
    const shaft = new Mesh(new ConeGeometry(0.13, 0.55, 4, 1, true), blue)
    shaft.rotation.x = Math.PI
    shaft.position.y = 0.25
    arrow.add(head, shaft)
    const txt = label('JOIN', 0.42, { color: '#ffffff', outline: '#123a8a' })
    txt.position.y = -0.85
    arrow.add(txt)
    arrow.position.set(x, 2.2, z)
    arrow.visible = false
    fxGroup.add(arrow)
    zone.arrow = arrow
    return zone
  }

  // --- balls: InstancedMesh per number ---
  const ballGeo = new SphereGeometry(TABLE.ballR, 20, 14)
  const ballMeshes = []
  for (let n = 0; n < 16; n++) {
    const m = new InstancedMesh(ballGeo, new MeshPhysicalMaterial({ map: tex(paintBall(n)), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.04 }), tables.length)
    m.castShadow = true
    m.frustumCulled = false
    scene.add(m)
    ballMeshes.push(m)
  }
  const mtx = new Matrix4()
  const pos = new Vector3()
  const one = new Vector3(1, 1, 1)
  const zero = new Vector3(0, 0, 0)
  function drawBalls(t) {
    for (const b of t.sim.balls) {
      let s = one
      pos.set(t.x + b.x, TABLE_BED_Y + TABLE.ballR, t.z + b.z)
      if (!b.on) {
        // drop into the pocket over 0.25 s, then hide
        if (b.sunk < 0.25) pos.y -= b.sunk * 0.8
        else s = zero
      }
      ballMeshes[b.n].setMatrixAt(t.id, mtx.compose(pos, b.q, s))
      ballMeshes[b.n].instanceMatrix.needsUpdate = true
    }
  }
  tables.forEach(drawBalls)

  // --- membership ---
  const members = (t) => t.zones.reduce((a, z) => a + z.members.length, 0)
  const all = (t) => t.zones.flatMap((z) => z.members)
  function zoneAt(x, z) {
    for (const t of tables) for (const zone of t.zones) if (Math.abs(x - zone.x) < zone.hx && Math.abs(z - zone.z) < zone.hz) return zone
    return null
  }
  // team of a member: 1v1 = join order, teams = their zone
  function teamOf(t, e) {
    if (t.team === 1) return t.zones[0].members.indexOf(e)
    return t.zones.findIndex((z) => z.members.includes(e))
  }
  function canJoin(zone) {
    const t = zone.table
    return (t.state === 'open' || t.state === 'waiting' || t.state === 'countdown') && zone.members.length < zone.cap
  }
  function join(zone, e) {
    if (!canJoin(zone) || e.zone) return false
    zone.members.push(e)
    e.zone = zone
    const t = zone.table
    if (!t.host) t.host = e
    if (t.state === 'open') t.state = 'waiting'
    if (members(t) >= t.cap) {
      t.state = 'countdown'
      t.timer = LOBBY.countdown
      emit('countdown', t)
    }
    emit('join', { table: t, entity: e })
    return true
  }
  function leave(e) {
    const zone = e.zone
    if (!zone) return
    e.zone = null
    zone.members.splice(zone.members.indexOf(e), 1)
    const t = zone.table
    if (t.host === e) t.host = all(t)[0] ?? null
    if (t.state === 'countdown') t.state = 'waiting'
    if ((t.state === 'waiting' || t.state === 'countdown') && members(t) === 0) t.state = 'open'
    emit('leave', { table: t, entity: e })
  }
  function finish(t, winnerTeam) {
    t.state = 'cooldown'
    t.timer = 3
    t.cue.visible = false
    t.aim = null
    emit('end', { table: t, winnerTeam, winners: all(t).filter((e) => teamOf(t, e) === winnerTeam) })
  }
  function reset(t) {
    for (const e of all(t)) e.zone = null
    for (const z of t.zones) z.members.length = 0
    t.host = null
    t.state = 'open'
    t.sim.rack()
    t.dirty = true
  }

  // --- bot games ---
  const legalFor = (t) => (n) => {
    if (n !== 8) return true
    return t.sim.balls.every((b) => b.n === 0 || b.n === 8 || !b.on)
  }
  function shooterFor(t) {
    const team = all(t).filter((e) => teamOf(t, e) === t.turn)
    return team.length ? team[Math.floor(Math.random() * team.length)] : null
  }
  // Where a shooter stands: back along the shot line, just outside the rail.
  const stance = (t, angle) => {
    const c = t.sim.balls[0]
    const dx = -Math.cos(angle)
    const dz = -Math.sin(angle)
    const ex = (TABLE.length / 2 + 0.55 - Math.sign(dx) * c.x) / Math.max(1e-3, Math.abs(dx))
    const ez = (TABLE.width / 2 + 0.55 - Math.sign(dz) * c.z) / Math.max(1e-3, Math.abs(dz))
    const k = Math.min(ex, ez)
    return { x: t.x + c.x + dx * k, z: t.z + c.z + dz * k, facing: Math.atan2(-dx, -dz) }
  }
  function startPlaying(t) {
    t.state = 'playing'
    t.playTime = rnd(...LOBBY.playTime)
    t.turn = Math.floor(Math.random() * 2)
    t.shotTimer = 1.5
    t.sim.rack()
    t.dirty = true
    emit('start', t)
  }
  function updateGame(t, dt) {
    const sim = t.sim
    t.playTime -= dt
    if (sim.moving()) return
    if (t.aim) {
      // the cue draws back, then strikes
      t.aim.t += dt
      placeCue(t, t.aim.angle, t.aim.t < 0.7 ? 0.08 + t.aim.t * 0.28 : Math.max(0.02, 0.28 - (t.aim.t - 0.7) * 3))
      if (t.aim.t >= 0.78) {
        sim.shoot(t.aim.angle, t.aim.speed)
        t.cue.visible = false
        t.lastShooter = t.aim.shooter
        t.aim = null
        t.resolving = true
      }
      return
    }
    if (t.resolving) {
      t.resolving = false
      // shot over: respot a scratched cue ball, keep the turn on a pot
      const potted = sim.sunkThisShot.filter((n) => n !== 0)
      if (!sim.balls[0].on) sim.placeCue(-TABLE.bedL / 4, 0)
      if (potted.includes(8)) {
        const clean = sim.balls.every((b) => b.n === 0 || !b.on)
        return finish(t, clean ? t.turn : 1 - t.turn)
      }
      if (potted.length) emit('pot', { table: t, shooter: t.lastShooter, balls: potted })
      else t.turn = 1 - t.turn
      t.shotTimer = rnd(...LOBBY.shotGap)
      if (t.playTime <= 0) return finish(t, Math.random() < 0.5 ? 0 : 1)
    }
    t.shotTimer -= dt
    if (t.shotTimer > 0) return
    const shooter = shooterFor(t)
    if (!shooter) return finish(t, 1 - t.turn)
    const shot = pickShot(sim, legalFor(t), 0.55 + Math.random() * 0.3)
    t.aim = { angle: shot.angle, speed: shot.speed, t: 0, shooter }
    const st = stance(t, shot.angle)
    shooter.stance?.(st.x, st.z, st.facing)
    t.cue.visible = true
  }
  // Cue along the shot line, tip `gap` m behind the cue ball.
  const up = new Vector3(0, 1, 0)
  const dir = new Vector3()
  function placeCue(t, angle, gap) {
    const c = t.sim.balls[0]
    dir.set(Math.cos(angle), -0.12, Math.sin(angle)).normalize()
    t.cue.quaternion.setFromUnitVectors(up, dir)
    const len = 1.45
    t.cue.position.set(t.x + c.x - dir.x * (len + gap + TABLE.ballR), TABLE_BED_Y + TABLE.ballR - dir.y * (len + gap) + 0.02, t.z + c.z - dir.z * (len + gap + TABLE.ballR))
  }

  // --- pad visuals ---
  const cols = { open: new Color(PAD.open), mine: new Color(PAD.mine), playing: new Color(PAD.playing) }
  function refreshPad(t, me) {
    const playing = t.state === 'playing' || t.state === 'match' || t.state === 'cooldown'
    const key = `${t.state}|${t.zones.map((z) => z.members.length).join(',')}|${me?.zone?.table === t}`
    if (key === t.padKey) return
    t.padKey = key
    for (const zone of t.zones) {
      const mine = me?.zone === zone || (me?.zone?.table === t && t.state === 'countdown')
      const col = playing ? cols.playing : mine ? cols.mine : cols.open
      zone.decalMat.color.copy(col)
      zone.rings.forEach((r) => r.material.color.copy(col))
      let lines
      if (t.team === 1) lines = [{ text: '1v1', size: 0.36 }, { text: playing ? 'PLAYING' : zone.members.length ? `${zone.members.length}/2` : 'JOIN', size: 0.2 }]
      else lines = [{ text: `TEAM ${zone.team + 1}`, size: 0.19 }, { text: playing ? 'PLAYING' : `${zone.members.length}/${zone.cap}`, size: 0.22 }]
      drawPadDecal(zone.canvas, lines)
      zone.texture.needsUpdate = true
    }
  }

  // --- per frame ---
  const sounds = [] // reused event buffer
  function update(dt, elapsed, me) {
    for (const t of tables) {
      if (t.state === 'countdown') {
        t.timer -= dt
        if (t.timer <= 0) {
          if (all(t).some((e) => e.isPlayer)) {
            t.state = 'match'
            emit('match', t)
          } else startPlaying(t)
        }
      } else if (t.state === 'playing') updateGame(t, dt)
      else if (t.state === 'cooldown') {
        t.timer -= dt
        if (t.timer <= 0) reset(t)
      }
      if (t.state === 'playing' || t.state === 'match' || t.dirty) {
        if (t.state === 'playing') t.sim.step(dt)
        for (const b of t.sim.balls) if (!b.on) b.sunk += dt
        drawBalls(t)
        t.dirty = false
        if (t.sim.events.length) {
          for (const ev of t.sim.events) sounds.push({ ...ev, wx: t.x + ev.x, wz: t.z + ev.z, table: t })
          t.sim.events.length = 0
        }
      }
      refreshPad(t, me)
      // rings drift up and fade; JOIN arrows bob over nearby open pads
      for (const zone of t.zones) {
        zone.rings.forEach((r, i) => {
          const k = (elapsed * 0.45 + i / 3) % 1
          r.position.y = 0.04 + k * 0.6
          r.material.opacity = (1 - k) * (t.state === 'playing' ? 0.45 : 0.85)
        })
        const near = me && Math.hypot(me.x - zone.x, me.z - zone.z) < PAD.arrowRange
        zone.arrow.visible = !!near && canJoin(zone) && me.zone !== zone && !me.zone
        if (zone.arrow.visible) {
          zone.arrow.position.y = 2.3 + Math.sin(elapsed * 3 + t.id) * 0.18
          zone.arrow.rotation.y = elapsed * 1.2
        }
      }
    }
    if (sounds.length) {
      emit('sounds', sounds)
      sounds.length = 0
    }
  }

  return {
    list: tables,
    zoneAt,
    canJoin,
    join,
    leave,
    members,
    all,
    teamOf,
    finish,
    placeCue,
    on: (fn) => listeners.push(fn),
    update,
    drawBalls,
  }
}
