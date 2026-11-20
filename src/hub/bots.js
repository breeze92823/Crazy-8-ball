// Other players in the hub (simulated): they wander, sit out by the railing,
// walk to tables, stand on the join pads, and play real games on the tables
// (the table runs the game and calls bot.stance() when it is their shot).
import { Group } from 'three'
import { BOTS, LOBBY, PLAYER_DIMS, RIG_HEIGHT, TABLE } from '../config.js'
import { buildDefaultCharacter } from '../avatar/character.js'
import { makeAnimator } from '../avatar/animator.js'
import { buildCue } from './props.js'
import { findPath, randomFree } from './nav.js'
import { floorAt } from './layout.js'

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

// Gives a character a cue in its right hand (rig units: the rig is scaled to metres).
export function attachCue(character) {
  const arm = character.nodes?.ArmR1
  if (!arm) return null
  const cue = buildCue()
  cue.scale.setScalar(RIG_HEIGHT / PLAYER_DIMS.height)
  cue.position.set(0, -2.15, 0.15)
  cue.rotation.set(-0.42, 0, 0.18)
  cue.children.forEach((c) => (c.position.y -= 0.32)) // grip a little up from the butt
  arm.add(cue)
  return cue
}

// Leaning over the table with the cue level: written over the animator's pose.
export function aimPose(character, k, stroke = 0) {
  const n = character.nodes
  if (!n || k <= 0) return
  if (n.Spine1) n.Spine1.rotation.x += 0.75 * k
  if (n.Neck1) n.Neck1.rotation.x -= 0.45 * k
  if (n.ArmR1) n.ArmR1.rotation.x += (-1.0 + stroke * 0.5 - n.ArmR1.rotation.x) * k
  if (n.ArmL1) n.ArmL1.rotation.x += (-1.45 - n.ArmL1.rotation.x) * k
  if (n.LegL1) n.LegL1.rotation.x += -0.35 * k
  if (n.LegR1) n.LegR1.rotation.x += 0.15 * k
}

export function createBots(scene, tables) {
  const bots = []
  const names = [...BOTS.names].sort(() => Math.random() - 0.5)
  for (let i = 0; i < BOTS.count; i++) {
    const colors = { shirt: pick(BOTS.shirts), pants: pick(BOTS.pants), skin: pick(BOTS.skin), hair: pick(BOTS.hair) }
    const character = buildDefaultCharacter(colors)
    const group = new Group()
    group.add(character)
    scene.add(group)
    const [x, z] = randomFree()
    const bot = {
      id: `bot${i}`,
      isPlayer: false,
      name: names[i % names.length],
      flag: pick(BOTS.flags),
      rank: Math.floor(Math.random() * 9),
      streak: Math.random() < 0.3 ? 1 + Math.floor(Math.random() * 5) : 0,
      wins: 0,
      color: colors.shirt,
      x,
      z,
      y: 0,
      vx: 0,
      vz: 0,
      facing: Math.random() * 6.28,
      path: null,
      state: 'idle',
      timer: rnd(0.5, 4),
      intent: null,
      aim: 0,
      group,
      character,
      animator: makeAnimator(character),
      cue: null,
      zone: null,
    }
    bot.cue = attachCue(character)
    bot.stance = (sx, sz, facing) => {
      bot.stanceAt = { x: sx, z: sz, facing }
    }
    bots.push(bot)
  }

  function walkTo(bot, x, z, intent) {
    const path = findPath(bot.x, bot.z, x, z)
    if (!path) {
      bot.state = 'idle'
      bot.timer = rnd(1, 3)
      return
    }
    bot.path = path
    bot.pathIndex = 1
    bot.intent = intent
    bot.state = 'walk'
  }
  // A free spot inside a pad zone, away from whoever is on it.
  function padSpot(zone) {
    for (let t = 0; t < 12; t++) {
      const x = zone.x + rnd(-zone.hx + 0.6, zone.hx - 0.6)
      const z = zone.z + rnd(-zone.hz + 0.6, zone.hz - 0.6)
      if (zone.members.every((m) => Math.hypot(m.x - x, m.z - z) > 1)) return [x, z]
    }
    return [zone.x, zone.z]
  }
  // Where a member waits while the others shoot: along the long sides.
  function waitSpot(table, team, idx) {
    const side = team === 0 ? -1 : 1
    return [table.x + (idx - 1) * 1.3 + rnd(-0.3, 0.3), table.z + side * (TABLE.width / 2 + 0.75)]
  }

  function chooseZone() {
    const zones = []
    for (const t of tables.list) {
      for (const z of t.zones) {
        if (!tables.canJoin(z)) continue
        if (tables.all(t).some((e) => e.isPlayer)) continue // the player's table is filled on purpose (fillFor)
        // prefer half-full 1v1 tables, then empty 1v1s, rarely team tables
        const w = (tables.members(t) > 0 ? 6 : 1) * (t.team === 1 ? 3 : 0.5)
        zones.push([z, w])
      }
    }
    const total = zones.reduce((a, [, w]) => a + w, 0)
    let r = Math.random() * total
    for (const [z, w] of zones) if ((r -= w) <= 0) return z
    return null
  }

  function decide(bot) {
    const r = Math.random()
    if (r < 0.6) {
      const zone = chooseZone()
      if (zone) {
        const [x, z] = padSpot(zone)
        return walkTo(bot, x, z, { join: zone })
      }
    }
    // wander: lounge, railings, umbrellas
    const areas = [
      { x0: -20, x1: 20, z0: -25, z1: -22 },
      { x0: -38, x1: -31, z0: -26, z1: 26 },
      { x0: 31, x1: 38, z0: -26, z1: 26 },
      { x0: -12, x1: 12, z0: 19, z1: 26 },
      null,
    ]
    const [x, z] = randomFree(Math.random, pick(areas))
    walkTo(bot, x, z, { idle: rnd(3, 9) })
  }

  // Sends bots to fill every free slot on the player's table, one by one.
  function fillFor(table) {
    let delay = rnd(...LOBBY.botFillDelay)
    for (const zone of table.zones) {
      const free = zone.cap - zone.members.length
      for (let k = 0; k < free; k++) {
        const bot = bots.filter((b) => !b.zone && b.state !== 'play' && !b.reserved).sort((a, b) => Math.hypot(a.x - table.x, a.z - table.z) - Math.hypot(b.x - table.x, b.z - table.z))[0]
        if (!bot) return
        bot.reserved = { zone, at: delay }
        delay += rnd(0.8, 2.5)
      }
    }
  }
  function cancelFill(table) {
    for (const b of bots) {
      if (b.reserved?.zone.table === table) b.reserved = null
      if (b.intent?.join?.table === table && b.state === 'walk') {
        b.state = 'idle'
        b.timer = rnd(0.5, 2)
      }
    }
  }

  // Start a few games already running so the hub is alive on arrival.
  function seedGames(n) {
    const open = tables.list.filter((t) => t.team === 1).sort(() => Math.random() - 0.5)
    let bi = 0
    for (let g = 0; g < n && bi + 1 < bots.length; g++) {
      const t = open[g]
      for (let k = 0; k < 2; k++) {
        const b = bots[bi++]
        const [x, z] = padSpot(t.zones[0])
        b.x = x
        b.z = z
        tables.join(t.zones[0], b)
        b.state = 'pad'
        b.timer = 99
      }
      t.timer = 0.01
    }
  }

  function update(dt, player) {
    for (const bot of bots) {
      // reserved to fill the player's table
      if (bot.reserved && bot.state !== 'walk') {
        bot.reserved.at -= dt
        if (bot.reserved.at <= 0) {
          const zone = bot.reserved.zone
          bot.reserved = null
          if (tables.canJoin(zone) && !bot.zone) {
            const [x, z] = padSpot(zone)
            walkTo(bot, x, z, { join: zone })
          }
        }
      }
      const t = bot.zone?.table
      switch (bot.state) {
        case 'idle':
          bot.timer -= dt
          if (bot.timer <= 0 && !bot.reserved) decide(bot)
          break
        case 'walk':
          break
        case 'pad':
          if (!bot.zone) {
            bot.state = 'idle'
            bot.timer = rnd(1, 4)
          } else if (t.state === 'playing' || t.state === 'match') {
            bot.state = 'play'
            const team = tables.teamOf(t, bot)
            const idx = tables.all(t).filter((e) => tables.teamOf(t, e) === team).indexOf(bot)
            bot.home = waitSpot(t, team, idx)
            walkTo(bot, bot.home[0], bot.home[1], { play: true })
          } else if (t.state === 'waiting') {
            bot.timer -= dt
            if (bot.timer <= 0 && !tables.all(t).some((e) => e.isPlayer)) {
              tables.leave(bot)
              bot.state = 'idle'
              bot.timer = rnd(1, 3)
            }
          }
          break
        case 'play':
          if (!bot.zone) {
            bot.state = 'idle'
            bot.timer = rnd(2, 5)
            bot.stanceAt = null
          }
          break
      }
      // a shot was requested: step to the stance quickly, then aim
      let aiming = 0
      if (bot.stanceAt && t && t.aim?.shooter === bot) {
        const s = bot.stanceAt
        const d = Math.hypot(s.x - bot.x, s.z - bot.z)
        if (d > 0.05) {
          const k = Math.min(1, (dt * 6) / d)
          bot.x += (s.x - bot.x) * k
          bot.z += (s.z - bot.z) * k
        }
        bot.facing += angDiff(bot.facing, s.facing) * Math.min(1, dt * 10)
        aiming = 1
      } else if (bot.stanceAt && (!t || !t.aim)) {
        bot.stanceAt = null
        if (bot.state === 'play' && bot.home) walkTo(bot, bot.home[0], bot.home[1], { play: true })
      }
      bot.aim += (aiming - bot.aim) * Math.min(1, dt * 8)

      // follow the path
      let speed = 0
      if (bot.state === 'walk' && bot.path && !aiming) {
        const [tx, tz] = bot.path[bot.pathIndex]
        const dx = tx - bot.x
        const dz = tz - bot.z
        const d = Math.hypot(dx, dz)
        const v = BOTS.walkSpeed * (bot.intent?.play ? 0.6 : 1)
        if (d < 0.2) {
          bot.pathIndex++
          if (bot.pathIndex >= bot.path.length) arrive(bot)
        } else {
          const step = Math.min(d, v * dt)
          bot.x += (dx / d) * step
          bot.z += (dz / d) * step
          speed = v
          bot.facing += angDiff(bot.facing, Math.atan2(dx, dz)) * Math.min(1, dt * 10)
        }
      }
      // keep a little personal space (not while playing)
      if (bot.state !== 'play' && bot.state !== 'pad') {
        for (const o of bots) {
          if (o === bot) continue
          const dx = bot.x - o.x
          const dz = bot.z - o.z
          const d = Math.hypot(dx, dz)
          if (d > 0 && d < 0.9) {
            bot.x += (dx / d) * (0.9 - d) * 0.5
            bot.z += (dz / d) * (0.9 - d) * 0.5
          }
        }
        const dx = bot.x - player.x
        const dz = bot.z - player.z
        const d = Math.hypot(dx, dz)
        if (d > 0 && d < 1.1) {
          bot.x += (dx / d) * (1.1 - d) * 0.6
          bot.z += (dz / d) * (1.1 - d) * 0.6
        }
      }
      // face the table while waiting to play
      if (bot.state === 'play' && !aiming && speed === 0 && t) bot.facing += angDiff(bot.facing, Math.atan2(t.x - bot.x, t.z - bot.z)) * Math.min(1, dt * 4)
      if (bot.state === 'pad' && speed === 0 && t) bot.facing += angDiff(bot.facing, Math.atan2(t.x - bot.x, t.z - bot.z)) * Math.min(1, dt * 3)

      bot.y += (floorAt(bot.x, bot.z) - bot.y) * Math.min(1, dt * 12)
      bot.group.position.set(bot.x, bot.y, bot.z)
      bot.group.rotation.y = bot.facing
      bot.speed = speed
      bot.animator.update(dt, { grounded: true, speed, verticalVelocity: 0, turn: 0 })
      const stroke = t?.aim?.shooter === bot ? Math.min(1, t.aim.t / 0.7) : 0
      aimPose(bot.character, bot.aim, stroke)
    }
  }

  function arrive(bot) {
    const intent = bot.intent || {}
    bot.path = null
    if (intent.join) {
      if (tables.join(intent.join, bot)) {
        bot.state = 'pad'
        bot.timer = rnd(...LOBBY.botWait)
      } else {
        bot.state = 'idle'
        bot.timer = rnd(0.5, 2)
      }
    } else if (intent.play) {
      bot.state = bot.zone ? 'play' : 'idle'
      bot.timer = rnd(1, 3)
    } else {
      bot.state = 'idle'
      bot.timer = intent.idle ?? rnd(2, 6)
    }
  }

  return { list: bots, update, fillFor, cancelFill, seedGames }
}
