// The pool tables of the hub: their models, the glowing join pads beside them,
// the balls (instanced, one InstancedMesh per ball number across all tables)
// and each table's lobby state:
//   open -> waiting (someone on a pad) -> countdown (full) -> match -> cooldown -> open
// Every seat is a real player: the server runs the lobbies (backend tables.ts) and
// tablenet.js mirrors them here (setMembers / setState); offline a pad only seats you.
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
import { PAD, TABLE, TABLE_GRID, TABLE_MODES } from '../config.js'
import { bake } from '../bake.js'
import { label, neon, solidBox } from '../propkit.js'
import { blockRect } from './nav.js'
import { drawPadDecal, paintBadge, paintBall, paintOutline, tex } from './paint.js'
import { TABLE_BED_Y, buildCue, buildPoolTable } from './props.js'
import { createSim } from './tablesim.js'

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
        aim: null, // { angle, speed, t, shooter } while a shot is struck
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
  // Local seat (offline, and the moment before the server confirms one).
  function join(zone, e) {
    if (!canJoin(zone) || e.zone) return false
    zone.members.push(e)
    e.zone = zone
    const t = zone.table
    if (!t.host) t.host = e
    if (t.state === 'open') t.state = 'waiting'
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
    if ((t.state === 'waiting' || t.state === 'countdown') && members(t) === 0) t.state = 'open'
    emit('leave', { table: t, entity: e })
  }
  // The server's seats: teams = [[entity], [entity]] (1v1: both on the one pad, team 0 first).
  // Emits 'join' for each newcomer.
  function setMembers(t, teams) {
    const before = new Set(all(t))
    for (const e of before) if (e.zone?.table === t) e.zone = null
    for (const z of t.zones) z.members.length = 0
    teams.forEach((team, i) => {
      const zone = t.team === 1 ? t.zones[0] : t.zones[i]
      for (const e of team) {
        if (e.zone && e.zone.table !== t) leave(e)
        zone.members.push(e)
        e.zone = zone
      }
    })
    const now = all(t)
    t.host = now[0] ?? null
    for (const e of now) if (!before.has(e)) emit('join', { table: t, entity: e })
  }
  // The server's lobby state; timer = s left of a countdown / cooldown. Emits 'countdown'.
  function setState(t, state, timer = 0) {
    t.timer = timer
    if (state === t.state) return
    const was = t.state
    t.state = state
    if (state === 'countdown') emit('countdown', t)
    if (state === 'open' && was !== 'open') {
      t.cue.visible = false
      t.aim = null
    }
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
    const playing = t.state === 'match' || t.state === 'cooldown'
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
      if (t.state === 'countdown' || t.state === 'cooldown') t.timer = Math.max(0, t.timer - dt)
      if (t.state === 'match' || t.state === 'cooldown' || t.dirty) {
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
          r.material.opacity = (1 - k) * (t.state === 'match' ? 0.45 : 0.85)
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
    setMembers,
    setState,
    members,
    all,
    teamOf,
    placeCue,
    on: (fn) => listeners.push(fn),
    update,
    drawBalls,
  }
}
