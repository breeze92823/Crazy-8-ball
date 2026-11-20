// The player's own match, played on the hub table they joined (so everyone
// around sees the balls move). Top-down camera over the table; aim by pointing
// (mouse) or dragging (touch), pull the power bar (or hold Space) and release.
// 8-ball rules, simplified: open table after the break, first legal pot sets
// solids/stripes, fouls (scratch, no hit, wrong ball first, shot clock) give
// ball in hand, and the 8 wins once your group is cleared (early = loss).
import { BufferGeometry, Float32BufferAttribute, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, Plane, Quaternion, Raycaster, RingGeometry, Vector2, Vector3 } from 'three'
import { ECONOMY, MATCH, TABLE } from '../config.js'
import { player, resetPlayer } from '../player.js'
import { syncYawToPlayer } from '../camera.js'
import { setMoveLock } from '../input.js'
import { sfx } from '../audio/index.js'
import './match.css'
import { ballColor } from './paint.js'
import { TABLE_BED_Y } from './props.js'
import { BED, FOOT_SPOT, HEAD_SPOT, pickShot } from './tablesim.js'
import { aimPose } from './bots.js'

const R = BED.r
const rnd = (a, b) => a + Math.random() * (b - a)
const groupOf = (n) => (n > 0 && n < 8 ? 'solids' : n > 8 ? 'stripes' : null)
const other = (g) => (g === 'solids' ? 'stripes' : 'solids')
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export function createMatch({ scene, camera, renderer, tables, hud, me }) {
  const endListeners = []
  const M = {
    active: false,
    table: null,
    onEnd: (fn) => endListeners.push(fn),
  }
  let t = null
  let sim = null
  let phase = 'off' // intro | aim | ai | rolling | over
  let turn = 0
  let myTeam = 0
  let groups = [null, null]
  let breakShot = true
  let ballInHand = false
  let shooterIdx = [0, 0]
  let clock = 0
  let aim = 0
  let power = 0
  let charging = false
  let spaceCharge = false
  let chargeT = 0
  let dragBall = false
  let aiTimer = 0
  let msgTimer = 0
  let fineDir = 0
  let camT = 0
  let pending = null // AI or my shot being animated: { angle, speed, t }
  const camFrom = { p: new Vector3(), q: new Quaternion(), fov: 70 }
  const camTo = { p: new Vector3(), q: new Quaternion(), fov: MATCH.fov }

  // --- aim visuals ---
  const lineMat = new LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthTest: false })
  const aimLine = new Line(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(new Float32Array(9), 3)), lineMat)
  const objLine = new Line(new BufferGeometry().setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3)), new LineBasicMaterial({ color: '#ffd23d', depthTest: false }))
  const ghost = new Mesh(new RingGeometry(R * 0.85, R, 24), new MeshBasicMaterial({ color: '#ffffff', depthTest: false, transparent: true, opacity: 0.85 }))
  ghost.rotation.x = -Math.PI / 2
  const handRing = new Mesh(new RingGeometry(R * 1.4, R * 1.75, 28), new MeshBasicMaterial({ color: '#3dff8a', depthTest: false, transparent: true }))
  handRing.rotation.x = -Math.PI / 2
  for (const o of [aimLine, objLine, ghost, handRing]) {
    o.renderOrder = 10
    o.visible = false
    o.frustumCulled = false
    scene.add(o)
  }

  // --- DOM ---
  const layer = document.createElement('div')
  layer.className = 'match-layer'
  layer.innerHTML = `
    <div class="mt-top">
      <div class="mt-side left"><div class="mt-names hud-outline"></div><div class="mt-group"></div><div class="mt-balls"></div></div>
      <div class="mt-mid"><svg class="mt-clock" viewBox="0 0 46 46"><circle cx="23" cy="23" r="19" stroke="rgba(20,22,58,0.6)"/><circle class="arc" cx="23" cy="23" r="19" stroke="#3dff8a" stroke-dasharray="119.4" stroke-dashoffset="0" transform="rotate(-90 23 23)"/></svg><div class="mt-vs hud-outline">VS</div></div>
      <div class="mt-side right"><div class="mt-names hud-outline"></div><div class="mt-group"></div><div class="mt-balls"></div></div>
    </div>
    <div class="mt-msg hud-outline"></div>
    <div class="mt-hint hud-outline"></div>
    <div class="mt-power" role="button" data-silent><div class="fill"></div><div class="cue"></div><div class="lbl hud-outline">PULL</div></div>
    <div class="mt-fine"><button data-d="-1" aria-label="Aim left">&#9664;</button><button data-d="1" aria-label="Aim right">&#9654;</button></div>
    <button class="mt-forfeit">Forfeit</button>
    <div class="mt-result"><div class="mt-card"><h2 class="hud-outline"></h2><div class="reward"></div><p></p><button>Continue</button></div></div>`
  document.body.appendChild(layer)
  const $ = (s) => layer.querySelector(s)
  const sides = [$('.mt-side.left'), $('.mt-side.right')]
  const msg = $('.mt-msg')
  const hint = $('.mt-hint')
  const powerEl = $('.mt-power')
  const fill = $('.mt-power .fill')
  const cueEl = $('.mt-power .cue')
  const arc = $('.arc')
  const result = $('.mt-result')

  function say(text, color = '#ffffff', secs = 1.8) {
    msg.textContent = text
    msg.style.color = color
    msg.classList.remove('show')
    void msg.offsetWidth
    msg.classList.add('show')
    msgTimer = secs
  }

  // --- pointer: aim, ball in hand, power ---
  const ray = new Raycaster()
  const ndc = new Vector2()
  const plane = new Plane(new Vector3(0, 1, 0), -(TABLE_BED_Y + R))
  const hit = new Vector3()
  function tablePoint(e) {
    ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    if (!ray.ray.intersectPlane(plane, hit)) return null
    return { x: hit.x - t.x, z: hit.z - t.z }
  }
  const myShot = () => phase === 'aim'
  let pointerAim = false
  layer.addEventListener('pointerdown', (e) => {
    if (!M.active || e.target.closest('button, .mt-power')) return
    if (!myShot()) return
    const p = tablePoint(e)
    if (!p) return
    const c = sim.balls[0]
    if (ballInHand && Math.hypot(p.x - c.x, p.z - c.z) < R * 4) {
      dragBall = true
      layer.setPointerCapture(e.pointerId)
      return
    }
    pointerAim = true
    layer.setPointerCapture(e.pointerId)
    aimAt(p)
  })
  layer.addEventListener('pointermove', (e) => {
    if (!M.active || !myShot()) return
    const p = tablePoint(e)
    if (!p) return
    if (dragBall) return placeInHand(p.x, p.z)
    // mouse aims by hovering; touch aims while dragging
    if (pointerAim || (e.pointerType === 'mouse' && !charging)) aimAt(p)
  })
  const endPointer = () => {
    dragBall = false
    pointerAim = false
  }
  layer.addEventListener('pointerup', endPointer)
  layer.addEventListener('pointercancel', endPointer)
  function aimAt(p) {
    const c = sim.balls[0]
    if (Math.hypot(p.x - c.x, p.z - c.z) < R * 1.5) return
    aim = Math.atan2(p.z - c.z, p.x - c.x)
  }
  function placeInHand(x, z) {
    x = Math.max(-BED.hx + R, Math.min(BED.hx - R, x))
    z = Math.max(-BED.hz + R, Math.min(BED.hz - R, z))
    if (breakShot) x = Math.min(x, HEAD_SPOT.x) // behind the head string on the break
    for (const b of sim.balls) if (b.on && b.n !== 0 && Math.hypot(b.x - x, b.z - z) < R * 2.05) return
    sim.placeCue(x, z)
    t.dirty = true
  }

  let powerStart = 0
  powerEl.addEventListener('pointerdown', (e) => {
    if (!myShot()) return
    charging = true
    powerStart = e.clientY
    powerEl.setPointerCapture(e.pointerId)
    e.preventDefault()
  })
  powerEl.addEventListener('pointermove', (e) => {
    if (!charging) return
    power = Math.max(0, Math.min(1, (e.clientY - powerStart) / (powerEl.clientHeight * 0.8)))
  })
  const release = () => {
    if (!charging) return
    charging = false
    if (power > 0.03 && myShot()) takeShot()
    else power = 0
  }
  powerEl.addEventListener('pointerup', release)
  powerEl.addEventListener('pointercancel', () => {
    charging = false
    power = 0
  })
  layer.querySelectorAll('.mt-fine button').forEach((b) => {
    b.addEventListener('pointerdown', () => (fineDir = Number(b.dataset.d)))
    for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => (fineDir = 0))
  })
  $('.mt-forfeit').addEventListener('click', () => {
    if (phase !== 'over' && M.active) finish(1 - myTeam, 'You forfeited')
  })
  $('.mt-result button').addEventListener('click', exit)
  window.addEventListener('keydown', (e) => {
    if (!M.active) return
    if (e.code === 'Space' && !e.repeat && myShot()) {
      spaceCharge = true
      chargeT = 0
    }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') fineDir = -1
    if (e.code === 'KeyD' || e.code === 'ArrowRight') fineDir = 1
  })
  window.addEventListener('keyup', (e) => {
    if (!M.active) return
    if (e.code === 'Space' && spaceCharge) {
      spaceCharge = false
      if (power > 0.03 && myShot()) takeShot()
      else power = 0
    }
    if (['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight'].includes(e.code)) fineDir = 0
  })

  // --- turns ---
  const teamMembers = (team) => tables.all(t).filter((e) => tables.teamOf(t, e) === team)
  const shooter = () => {
    const m = teamMembers(turn)
    return m[shooterIdx[turn] % Math.max(1, m.length)] ?? null
  }
  const cleared = (team) => groups[team] && sim.balls.every((b) => !b.on || groupOf(b.n) !== groups[team])
  const legalFor = (team) => (n) => {
    const g = groups[team]
    if (!g) return n !== 8
    return cleared(team) ? n === 8 : groupOf(n) === g
  }
  function beginTurn(newInning) {
    if (newInning) shooterIdx[turn]++
    clock = MATCH.shotClock
    power = 0
    const s = shooter()
    renderSides()
    if (s === me) {
      phase = 'aim'
      // start aiming at the nearest legal ball
      const shot = pickShot(sim, legalFor(turn), 1)
      aim = breakShot ? 0 : shot.angle
      say(ballInHand ? 'Ball in hand!' : 'Your turn!', '#3dff8a', 1.4)
      sfx.toggle(true)
    } else {
      phase = 'ai'
      aiTimer = rnd(...MATCH.aiThink)
    }
  }
  function takeShot() {
    const speed = MATCH.minSpeed + power * (MATCH.maxSpeed - MATCH.minSpeed)
    pending = { angle: aim, speed, t: 0.55, shooter: me, fromPower: power }
    t.aim = { angle: aim, speed, t: 0.7, shooter: me }
    phase = 'strike'
  }
  function aiShot() {
    const s = shooter()
    if (ballInHand) {
      // try spots, keep the one with the best shot
      let best = null
      for (let i = 0; i < 24; i++) {
        const x = rnd(-BED.hx + R, breakShot ? HEAD_SPOT.x : BED.hx - R)
        const z = rnd(-BED.hz + R, BED.hz - R)
        if (sim.balls.some((b) => b.on && b.n !== 0 && Math.hypot(b.x - x, b.z - z) < R * 2.2)) continue
        sim.placeCue(x, z)
        const shot = pickShot(sim, legalFor(turn), 1)
        if (!best || (shot.score ?? -99) > best.score) best = { x, z, score: shot.score ?? -99 }
      }
      if (best) sim.placeCue(best.x, best.z)
      t.dirty = true
    }
    let shot
    if (breakShot) {
      shot = { angle: Math.atan2(FOOT_SPOT.z - sim.balls[0].z, FOOT_SPOT.x - sim.balls[0].x) + rnd(-0.015, 0.015), speed: rnd(6, 7) }
    } else shot = pickShot(sim, legalFor(turn), MATCH.aiSkill + rnd(-0.1, 0.1))
    pending = { angle: shot.angle, speed: shot.speed, t: 0 }
    t.aim = { angle: shot.angle, speed: shot.speed, t: 0, shooter: s }
    const st = stanceFor(shot.angle)
    s?.stance?.(st.x, st.z, st.facing)
    phase = 'strike'
  }
  // Where the shooter stands: back along the line, outside the rail.
  function stanceFor(angle) {
    const c = sim.balls[0]
    const dx = -Math.cos(angle)
    const dz = -Math.sin(angle)
    const ex = (TABLE.length / 2 + 0.55 - Math.sign(dx) * c.x) / Math.max(1e-3, Math.abs(dx))
    const ez = (TABLE.width / 2 + 0.55 - Math.sign(dz) * c.z) / Math.max(1e-3, Math.abs(dz))
    const k = Math.min(ex, ez)
    return { x: t.x + c.x + dx * k, z: t.z + c.z + dz * k, facing: Math.atan2(-dx, -dz) }
  }

  function resolve() {
    const sunk = sim.sunkThisShot
    const scratch = !sim.balls[0].on
    const first = sim.firstHit
    const g = groups[turn]
    let foul = scratch || first < 0
    let why = scratch ? 'Scratch!' : first < 0 ? 'No ball hit!' : ''
    if (!foul && g && !cleared(turn) && (first === 8 || groupOf(first) !== g)) {
      foul = true
      why = 'Wrong ball first!'
    }
    if (!foul && !g && first === 8 && !breakShot) {
      foul = true
      why = 'Hit the 8 first!'
    }
    if (scratch) sim.placeCue(HEAD_SPOT.x, HEAD_SPOT.z)
    if (sunk.includes(8)) {
      if (breakShot) {
        // 8 on the break: respot it and play on
        const b = sim.balls[8]
        Object.assign(b, { on: true, x: FOOT_SPOT.x, z: FOOT_SPOT.z, vx: 0, vz: 0, pocket: -1 })
      } else {
        const won = !foul && groups[turn] && sim.balls.every((b) => !b.on || groupOf(b.n) !== groups[turn])
        return finish(won ? turn : 1 - turn, won ? 'Sank the 8!' : 'The 8 went down early!')
      }
    }
    const own = sunk.filter((n) => n !== 0 && n !== 8)
    if (!g && !foul && !breakShot && own.length) {
      groups[turn] = groupOf(own[0])
      groups[1 - turn] = other(groups[turn])
      say(`${turn === myTeam ? 'You are' : 'They are'} ${groups[turn].toUpperCase()}`, '#ffd23d')
    }
    const potOwn = own.some((n) => !groups[turn] || groupOf(n) === groups[turn])
    breakShot = false
    t.dirty = true
    if (foul) {
      ballInHand = true
      turn = 1 - turn
      say(`Foul! ${why}`, '#ff6b6b', 2)
      sfx.lose()
      return beginTurn(true)
    }
    ballInHand = false
    if (own.length && potOwn) {
      if (turn === myTeam) {
        hud.popup('NICE SHOT!', new Vector3(t.x, 1.6, t.z), '#ffd23d', 1.1)
        sfx.niceShot(1, 0)
      }
      return beginTurn(false)
    }
    turn = 1 - turn
    beginTurn(true)
  }

  function finish(winner, why) {
    phase = 'over'
    t.aim = null
    t.cue.visible = false
    for (const o of [aimLine, objLine, ghost, handRing]) o.visible = false
    const won = winner === myTeam
    const reward = won ? ECONOMY.winReward * t.team : ECONOMY.lossReward
    $('.mt-card h2').textContent = won ? 'YOU WIN!' : 'YOU LOSE'
    $('.mt-card h2').style.color = won ? '#3dff8a' : '#ff6b6b'
    $('.mt-card .reward').textContent = `+$${reward}`
    $('.mt-card p').textContent = why
    result.classList.add('show')
    if (won) sfx.win()
    else {
      sfx.lose()
      setTimeout(() => sfx.cash(2), 500)
    }
    M.winner = winner
    for (const fn of endListeners) fn({ won, reward })
  }

  function exit() {
    result.classList.remove('show')
    document.body.classList.remove('in-match')
    setMoveLock(false)
    for (const o of [aimLine, objLine, ghost, handRing]) o.visible = false
    const table = t
    camera.fov = camFrom.fov
    camera.updateProjectionMatrix()
    M.active = false
    M.table = null
    phase = 'off'
    tables.finish(table, M.winner ?? 0)
    // step off the pad so it doesn't instantly rejoin
    resetPlayer({ x: table.x + 3.2, y: 0.05, z: table.padZ + 2.6 }, Math.PI)
    syncYawToPlayer()
  }

  // --- camera framing: straight down on the table, long side along the screen's long side ---
  function frame() {
    const aspect = window.innerWidth / window.innerHeight
    const portrait = aspect < 1
    const tan = Math.tan((camTo.fov * Math.PI) / 360)
    // the table's length runs along the screen's long side; leave room for the scoreboard
    const along = TABLE.length / 2 + (portrait ? 0.95 : 0.35)
    const across = TABLE.width / 2 + (portrait ? 0.25 : 0.75)
    const d = (portrait ? Math.max(along / tan, across / (tan * aspect)) : Math.max(across / tan, along / (tan * aspect)))
    camTo.p.set(t.x, TABLE_BED_Y + d, t.z + (portrait ? 0 : 0.25))
    const up = portrait ? new Vector3(1, 0, 0) : new Vector3(0, 0, -1)
    const m = camera.matrix.clone().lookAt(camTo.p, new Vector3(t.x, TABLE_BED_Y, t.z), up)
    camTo.q.setFromRotationMatrix(m)
  }
  window.addEventListener('resize', () => {
    if (M.active) frame()
  })

  M.start = (table) => {
    t = table
    sim = t.sim
    M.table = t
    M.active = true
    M.winner = null
    document.body.classList.add('in-match')
    setMoveLock(true)
    sim.rack()
    t.dirty = true
    myTeam = tables.teamOf(t, me)
    groups = [null, null]
    breakShot = true
    ballInHand = true // place the cue ball behind the head string to break
    shooterIdx = [-1, -1]
    turn = Math.random() < 0.5 ? 0 : 1
    camFrom.p.copy(camera.position)
    camFrom.q.copy(camera.quaternion)
    camFrom.fov = camera.fov
    camT = 0
    frame()
    phase = 'intro'
    aiTimer = 1.4
    sfx.matchStart()
    say(turn === myTeam ? 'You break!' : 'Opponent breaks', '#ffffff', 1.6)
    renderSides()
    // stand at the table
    resetPlayer({ x: t.x - 1.2 + myTeam * 2.4, y: 0.05, z: t.z + (myTeam ? 1 : -1) * (TABLE.width / 2 + 0.7) }, myTeam ? Math.PI : 0)
  }

  // scoreboard: names, group, balls left
  function renderSides() {
    if (!t) return
    for (const team of [0, 1]) {
      const side = sides[team === myTeam ? 0 : 1]
      const names = teamMembers(team).map((e) => (e === me ? 'You' : e.name))
      side.querySelector('.mt-names').innerHTML = esc(names.join(' & ') || '...')
      side.classList.toggle('turn', team === turn && phase !== 'over')
      const g = groups[team]
      side.querySelector('.mt-group').textContent = g ? g.toUpperCase() : breakShot ? '' : 'OPEN TABLE'
      const nums = g === 'solids' ? [1, 2, 3, 4, 5, 6, 7] : g === 'stripes' ? [9, 10, 11, 12, 13, 14, 15] : []
      if (g && nums.every((n) => !sim.balls[n].on)) nums.push(8)
      side.querySelector('.mt-balls').innerHTML = nums.map((n) => `<span class="mt-ball${n > 8 ? ' stripe' : ''}${sim.balls[n].on ? '' : ' gone'}" style="background:${ballColor(n)};--c:${ballColor(n)}"></span>`).join('')
    }
  }

  // --- aim line: cue ball path to the first ball or cushion ---
  function updateAimLine() {
    const c = sim.balls[0]
    const dx = Math.cos(aim)
    const dz = Math.sin(aim)
    let best = Infinity
    let target = null
    for (const b of sim.balls) {
      if (!b.on || b.n === 0) continue
      const ox = b.x - c.x
      const oz = b.z - c.z
      const along = ox * dx + oz * dz
      if (along <= 0) continue
      const perp2 = ox * ox + oz * oz - along * along
      if (perp2 > 4 * R * R) continue
      const s = along - Math.sqrt(4 * R * R - perp2)
      if (s < best) {
        best = s
        target = b
      }
    }
    // cushions
    const sx = dx > 0 ? (BED.hx - R - c.x) / dx : dx < 0 ? (-BED.hx + R - c.x) / dx : Infinity
    const sz = dz > 0 ? (BED.hz - R - c.z) / dz : dz < 0 ? (-BED.hz + R - c.z) / dz : Infinity
    const wall = Math.min(sx, sz)
    const y = TABLE_BED_Y + R
    const pos = aimLine.geometry.attributes.position
    const gx = c.x + dx * Math.min(best, wall)
    const gz = c.z + dz * Math.min(best, wall)
    pos.setXYZ(0, t.x + c.x, y, t.z + c.z)
    pos.setXYZ(1, t.x + gx, y, t.z + gz)
    if (target && best < wall) {
      pos.setXYZ(2, t.x + gx, y, t.z + gz)
      ghost.visible = true
      ghost.position.set(t.x + gx, y + 0.002, t.z + gz)
      const nx = (target.x - gx) / (2 * R)
      const nz = (target.z - gz) / (2 * R)
      const o = objLine.geometry.attributes.position
      o.setXYZ(0, t.x + target.x, y, t.z + target.z)
      o.setXYZ(1, t.x + target.x + nx * 0.5, y, t.z + target.z + nz * 0.5)
      o.needsUpdate = true
      objLine.visible = true
      const legal = legalFor(turn)(target.n)
      objLine.material.color.set(legal ? '#ffd23d' : '#ff5a5a')
      ghost.material.color.set(legal ? '#ffffff' : '#ff5a5a')
    } else {
      // short bounce off the cushion
      const rx = sx < sz ? -dx : dx
      const rz = sx < sz ? dz : -dz
      pos.setXYZ(2, t.x + gx + rx * 0.35, y, t.z + gz + rz * 0.35)
      ghost.visible = false
      objLine.visible = false
    }
    pos.needsUpdate = true
    aimLine.geometry.computeBoundingSphere()
    aimLine.visible = true
  }

  M.update = (dt, elapsed) => {
    if (!M.active) return
    // camera glides in over the table
    if (camT < 1) {
      camT = Math.min(1, camT + dt / 0.9)
      const k = camT * camT * (3 - 2 * camT)
      camera.position.lerpVectors(camFrom.p, camTo.p, k)
      camera.quaternion.slerpQuaternions(camFrom.q, camTo.q, k)
      camera.fov = camFrom.fov + (camTo.fov - camFrom.fov) * k
      camera.updateProjectionMatrix()
    } else {
      camera.position.copy(camTo.p)
      camera.quaternion.copy(camTo.q)
    }
    if (msgTimer > 0) {
      msgTimer -= dt
      if (msgTimer <= 0) msg.classList.remove('show')
    }
    const c = sim.balls[0]
    const mine = phase === 'aim'
    powerEl.classList.toggle('off', !mine)
    hint.textContent = mine ? (ballInHand ? 'Drag the cue ball to place it · aim · pull the bar' : 'Aim at the table · pull the power bar (or hold Space) to shoot') : phase === 'ai' || phase === 'strike' ? `${shooter()?.name ?? 'Opponent'} is shooting...` : ''
    if (phase === 'intro') {
      aiTimer -= dt
      if (aiTimer <= 0) beginTurn(true)
    } else if (phase === 'aim') {
      aim += fineDir * MATCH.fineAim * dt
      if (spaceCharge) {
        chargeT += dt
        power = 0.5 - 0.5 * Math.cos(chargeT * 2.6) // swings 0..1..0
      }
      clock -= dt
      if (clock <= 0) {
        // out of time: foul
        ballInHand = true
        turn = 1 - turn
        say('Out of time!', '#ff6b6b')
        beginTurn(true)
      }
      updateAimLine()
      handRing.visible = ballInHand
      handRing.position.set(t.x + c.x, TABLE_BED_Y + 0.004, t.z + c.z)
      handRing.material.opacity = 0.5 + 0.5 * Math.sin(elapsed * 6)
      tables.placeCue(t, aim, 0.03 + power * 0.32)
      t.cue.visible = true
      // my avatar leans in at the right spot
      const st = stanceFor(aim)
      if (Math.hypot(player.position.x - st.x, player.position.z - st.z) > 0.05) resetPlayer({ x: st.x, y: 0.05, z: st.z }, st.facing)
      player.facing = st.facing
    } else if (phase === 'ai') {
      for (const o of [aimLine, objLine, ghost, handRing]) o.visible = false
      t.cue.visible = false
      aiTimer -= dt
      if (aiTimer <= 0) aiShot()
    } else if (phase === 'strike') {
      for (const o of [aimLine, objLine, ghost, handRing]) o.visible = false
      // the cue draws back then strikes (my shot strikes from where the power bar left it)
      pending.t += dt
      t.aim.t = pending.t
      t.cue.visible = true
      const pull = pending.fromPower != null ? 0.03 + pending.fromPower * 0.32 : 0.06 + Math.min(pending.t, 0.7) * 0.3
      const gap = pending.t < 0.7 ? pull : Math.max(0.01, pull - (pending.t - 0.7) * 4)
      tables.placeCue(t, pending.angle, gap)
      if (pending.t >= 0.78) {
        sim.shoot(pending.angle, pending.speed)
        t.cue.visible = false
        t.aim = null
        power = 0
        phase = 'rolling'
        pending = null
      }
    } else if (phase === 'rolling') {
      sim.step(dt)
      if (!sim.moving()) resolve()
    }
    // power bar + shot clock
    fill.style.height = `${power * 100}%`
    cueEl.style.transform = `translateY(${power * 22}%)`
    const frac = phase === 'aim' ? clock / MATCH.shotClock : 1
    arc.setAttribute('stroke-dashoffset', String(119.4 * (1 - frac)))
    arc.setAttribute('stroke', frac < 0.3 ? '#ff5a5a' : '#3dff8a')
    if (phase === 'rolling' && Math.random() < dt * 4) renderSides()
  }

  // my avatar's lean while aiming
  M.pose = (avatar, dt) => {
    if (!M.active || !avatar) return
    const k = phase === 'aim' || (phase === 'strike' && pending?.fromPower != null) ? 1 : 0
    M.lean = (M.lean ?? 0) + (k - (M.lean ?? 0)) * Math.min(1, dt * 8)
    aimPose(avatar, M.lean, power)
  }
  return M
}
