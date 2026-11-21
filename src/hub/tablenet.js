// The hub's tables as the server runs them (backend tables.ts): every seat is a real player.
//   - Pads: stepping on one sends `padJoin` { table, team }, stepping off `padLeave`; the seat shows
//     at once and holds until the server's roster (room.state.tables) confirms or drops it.
//   - Each frame the server's seats / lobby state are mirrored into tables.js (setMembers / setState).
//   - Matches: `matchStart` racks the table (seed) and starts my match if I sit there. The shooter's
//     client runs the physics and streams it: `mAim` (the cue turning), `mShot` (the strike),
//     `mBalls` (ball positions + sound events while they roll), then the server's `mTurn` (the
//     settled balls + the next shooter). Every table I'm not shooting on is drawn from that stream,
//     ~DELAY s behind, interpolated, so passers-by watch real games too. match.js gets the same
//     messages for its own table (match.onNet).
// Offline (no room) a pad only seats this player and no match can start.
import { Quaternion, Vector3 } from 'three'
import { TABLE } from '../config.js'
import { net, onServer, sendServer, serverNow } from '../net.js'
import { applyCueLook, DEFAULT_CUE } from '../cues.js'

const R = TABLE.ballR
const DELAY = 110 // ms behind the stream, so there are two snapshots to blend between
const PENDING_MS = 1500 // a pad seat shown before the server has confirmed it
const EVENT_CODES = ['cue', 'ball', 'rail', 'pocket', 'caught', 'portal']
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a))
const split = (s) => (s ? s.split(',') : [])

// 16 balls -> [x, z, on] x 16 (whole 1e-4 m), the wire format of mBalls / mEnd / mTurn.
export function packBalls(sim) {
  const out = new Array(48)
  sim.balls.forEach((b, i) => {
    out[i * 3] = Math.round(b.x * 1e4)
    out[i * 3 + 1] = Math.round(b.z * 1e4)
    out[i * 3 + 2] = b.on ? 1 : 0
  })
  return out
}
// The settled balls of a turn: placed, at rest; a ball that just went down drops into its pocket.
export function applyBalls(sim, arr) {
  if (!Array.isArray(arr) || arr.length !== 48) return
  sim.balls.forEach((b, i) => {
    const on = !!arr[i * 3 + 2]
    if (b.on && !on) b.sunk = 0
    if (!b.on && on) b.sunk = 0
    b.x = arr[i * 3] / 1e4
    b.z = arr[i * 3 + 1] / 1e4
    b.vx = b.vz = 0
    b.on = on
  })
}
// A sim event -> [code, n, speed x100, x, z] (whole numbers); null for ones nobody else needs.
export function packEvent(ev, out) {
  const code = EVENT_CODES.indexOf(ev.type)
  if (code < 0 || (ev.type === 'ball' && ev.speed < 0.15) || (ev.type === 'rail' && ev.speed < 0.25)) return
  out.push(code, ev.n | 0, Math.round(ev.speed * 100), Math.round(ev.x * 1e4), Math.round(ev.z * 1e4))
}

// A streamed ball turns as it travels, like the sim's own rolling.
const axis = new Vector3()
const dq = new Quaternion()
function roll(b, dx, dz) {
  const d = Math.hypot(dx, dz)
  if (d < 1e-6 || d > 0.5) return
  axis.set(dz / d, 0, -dx / d)
  b.q.premultiply(dq.setFromAxisAngle(axis, d / R))
}

export function createTableNet({ tables, me, entityOf, match }) {
  let mySid = ''
  let pending = null // { zone, at } | { from: table, at }
  let wasOnline = false
  const startFns = []
  for (const t of tables.list) t.net = { buf: [], evq: [], aim: null, aimA: 0, strike: null, key: '', balls: '', look: '', last: 0 }

  const live = (msg) => tables.list[msg?.table]
  const toMatch = (type, msg) => {
    if (match.active && match.table?.id === msg.table) match.onNet(type, msg)
  }
  const shooterOf = (t) => {
    const s = net.room?.state?.tables?.get(String(t.id))
    return s?.shooter ? entityOf(s.shooter) : null
  }

  // --- the stream ---
  onServer('matchStart', (msg) => {
    const t = live(msg)
    if (!t) return
    t.sim.rack(msg.seed)
    t.net.buf.length = 0
    t.net.evq.length = 0
    t.net.aim = t.net.strike = null
    t.dirty = true
    const mine = Array.isArray(msg.teams) && msg.teams.some((team) => team.includes(mySid))
    if (mine) for (const fn of startFns) fn(t, msg)
  })
  onServer('mAim', (msg) => {
    const t = live(msg)
    if (!t) return
    const n = t.net
    if (!n.aim) n.aimA = msg.a
    n.aim = { a: msg.a, p: msg.p || 0, at: performance.now() }
    if (typeof msg.x === 'number' && !n.buf.length) {
      t.sim.placeCue(msg.x, msg.z) // ball in hand: the cue ball follows their drag
      t.dirty = true
    }
    const e = shooterOf(t)
    if (e) e.aimUntil = performance.now() + 700
    toMatch('mAim', msg)
  })
  onServer('mShot', (msg) => {
    const t = live(msg)
    if (!t) return
    t.sim.placeCue(msg.x, msg.z)
    t.dirty = true
    t.net.strike = { a: msg.a, t: 0, from: 0.06 + (t.net.aim?.p ?? 0.5) * 0.3 }
    t.net.aimA = msg.a
    t.net.buf.length = 0
    t.sim.events.push({ type: 'cue', speed: msg.s, x: msg.x, z: msg.z, n: 0 })
    toMatch('mShot', msg)
  })
  onServer('mBalls', (msg) => {
    const t = live(msg)
    if (!t || !Array.isArray(msg.b) || msg.b.length !== 48) return
    const at = performance.now()
    t.net.buf.push({ at, b: msg.b })
    if (t.net.buf.length > 40) t.net.buf.shift()
    const ev = msg.ev || []
    for (let i = 0; i + 4 < ev.length; i += 5) t.net.evq.push({ at, ev: { type: EVENT_CODES[ev[i]], n: ev[i + 1], speed: ev[i + 2] / 100, x: ev[i + 3] / 1e4, z: ev[i + 4] / 1e4 } })
    toMatch('mBalls', msg)
  })
  onServer('mTurn', (msg) => {
    const t = live(msg)
    if (!t) return
    const n = t.net
    // what is still queued plays out, then the balls settle exactly where the shooter's did
    for (const q of n.evq) t.sim.events.push(q.ev)
    n.buf.length = n.evq.length = 0
    n.aim = n.strike = null
    if (!(match.active && match.table === t && match.shooting())) {
      applyBalls(t.sim, msg.balls)
      t.cue.visible = false
    }
    t.dirty = true
    toMatch('mTurn', msg)
  })
  onServer('mTeams', (msg) => toMatch('mTeams', msg))

  // --- per frame: the stream drawn ~DELAY behind ---
  function animate(t, dt, now) {
    const n = t.net
    if (match.active && match.table === t && match.shooting()) return // my shot: match.js drives it
    // balls: blend the two snapshots around the render time
    const at = now - DELAY
    const buf = n.buf
    if (buf.length) {
      while (buf.length >= 2 && buf[1].at <= at) buf.shift()
      const a = buf[0].b
      const b = buf[1]?.b ?? a
      const k = buf[1] ? Math.max(0, Math.min(1, (at - buf[0].at) / (buf[1].at - buf[0].at))) : 1
      t.sim.balls.forEach((ball, i) => {
        const on = !!(k > 0.5 ? b : a)[i * 3 + 2]
        const x = (a[i * 3] + (b[i * 3] - a[i * 3]) * k) / 1e4
        const z = (a[i * 3 + 1] + (b[i * 3 + 1] - a[i * 3 + 1]) * k) / 1e4
        if (ball.on && on) roll(ball, x - ball.x, z - ball.z)
        if (ball.on !== on) ball.sunk = 0
        ball.on = on
        ball.x = x
        ball.z = z
        ball.vx = ball.vz = 0
      })
      t.dirty = true
    }
    while (n.evq.length && n.evq[0].at <= at) t.sim.events.push(n.evq.shift().ev)
    // the cue: turning with their aim, then the stroke
    const shooter = shooterOf(t)
    const look = shooter?.cueId || DEFAULT_CUE
    if (n.strike) {
      n.strike.t += dt
      const k = Math.min(1, n.strike.t / 0.09)
      if (n.look !== look) applyCueLook(t.cue, (n.look = look))
      tables.placeCue(t, n.strike.a, Math.max(0, n.strike.from * (1 - k * k)))
      t.cue.visible = n.strike.t < 0.3
      if (n.strike.t > 0.3) n.strike = null
    } else if (n.aim && now - n.aim.at < 1500 && t.state === 'match') {
      n.aimA += angDiff(n.aimA, n.aim.a) * Math.min(1, dt * 14)
      if (n.look !== look) applyCueLook(t.cue, (n.look = look))
      tables.placeCue(t, n.aimA, 0.06 + n.aim.p * 0.3)
      t.cue.visible = true
    } else if (n.aim || (t.cue.visible && !(match.active && match.table === t))) {
      n.aim = null
      t.cue.visible = false
    }
  }

  // --- the server's seats ---
  function sync(st, now) {
    for (const [id, s] of st) {
      const t = tables.list[Number(id)]
      if (!t) continue
      const teams = [split(s.team0), split(s.team1)]
      // my pad, before the server has caught up
      if (pending && now - pending.at < PENDING_MS) {
        const seated = teams.some((m) => m.includes(mySid))
        if (pending.zone?.table === t && !seated) {
          const side = t.team === 1 ? (teams[0].length ? 1 : 0) : pending.zone.team
          teams[side] = [...teams[side], mySid]
        } else if (pending.from === t && seated) for (const k of [0, 1]) teams[k] = teams[k].filter((x) => x !== mySid)
      }
      const ents = teams.map((m) => m.map((sid) => (sid === mySid ? me : entityOf(sid))).filter(Boolean))
      const key = `${s.state}|${ents[0].map((e) => e.id).join(',')}|${ents[1].map((e) => e.id).join(',')}`
      if (key !== t.net.key) {
        t.net.key = key
        tables.setMembers(t, ents)
      }
      const left = s.state === 'countdown' || s.state === 'cooldown' ? Math.max(0, (s.startsAt - serverNow()) / 1000) : 0
      tables.setState(t, s.state, left)
      // a newcomer (or a table that went quiet) draws the last settled balls
      if (s.balls !== t.net.balls) {
        t.net.balls = s.balls
        if (!t.net.buf.length && !(match.active && match.table === t)) {
          if (s.balls) applyBalls(t.sim, s.balls.split(/[;,]/).map(Number))
          else if (s.state !== 'match') t.sim.rack()
          t.dirty = true
        }
      }
    }
  }

  return {
    online: () => !!(net.connected && net.room?.state?.tables),
    mySid: () => mySid,
    onMatchStart: (fn) => startFns.push(fn),
    // Step onto / off a pad (main.js). Offline the seat is local only.
    join(zone) {
      if (!tables.join(zone, me)) return false
      if (this.online()) {
        pending = { zone, at: performance.now() }
        sendServer('padJoin', { table: zone.table.id, team: zone.team })
      }
      return true
    },
    leave() {
      const t = me.zone?.table
      if (!t) return
      tables.leave(me)
      if (this.online()) {
        pending = { from: t, at: performance.now() }
        sendServer('padLeave', {})
      }
    },
    forfeit: () => sendServer('mForfeit', {}),
    update(dt) {
      const now = performance.now()
      const st = net.connected ? net.room?.state?.tables : null
      mySid = net.connected ? net.room?.sessionId ?? '' : ''
      me.sid = mySid
      if (st) {
        wasOnline = true
        sync(st, now)
      } else if (wasOnline) {
        // the server went away: nobody is seated any more but this player's local seat
        wasOnline = false
        for (const t of tables.list) {
          t.net.key = ''
          tables.setMembers(t, [[], []])
          tables.setState(t, 'open')
          t.sim.rack()
          t.dirty = true
        }
      }
      for (const t of tables.list) animate(t, dt, now)
    },
  }
}
