// Real players in the same server room (../Crazy-8-ball-backend roster, read from net.js's room):
// drawn in the hub as their Bloxity avatar holding their equipped cue, eased toward the pose the
// server last relayed plus speed x heading since (dead reckoning), playing the emotes they play.
// Each is also a hub entity (`entities`, `bySid`: name tag + Players panel: name, flag, rank badge,
// wins, money; the pool tables seat them by sessionId, tablenet.js), leaning over the cue while
// they aim at a table (`entity.aimUntil`, set by tablenet.js from their mAim). This module also sends this player's own presence through net.js: `pose` (REMOTES.poseHz),
// `stats` { wins, cash, rank, flag } and `setAvatar` when they change, and `emote` { id }.
// Diffed against the roster every frame, so joins / leaves need no events; nearest REMOTES.max
// (fewer on touch) are drawn, the rest only listed. Never throws when offline (no room = none).
import { Group } from 'three'
import { COARSE_POINTER, REMOTES } from './config.js'
import { net, sendServer } from './net.js'
import * as bloxity from './bloxity.js'
import { buildDefaultCharacter } from './avatar/character.js'
import { buildLook, disposeLook } from './avatar/look.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { boxityEmote } from './boxityEmotes.js'
import { aimPose, attachCue } from './hub/stance.js'
import { applyCueLook, DEFAULT_CUE } from './cues.js'
import { EMOTE_BY_ID } from './emotes.js'
import { BOTS } from './config.js'

const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from))
const MAX = COARSE_POINTER ? REMOTES.maxTouch : REMOTES.max
// A stable look per session for players without a Bloxity avatar.
function colorsFor(id) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0
  const at = (list, k) => list[(h >>> k) % list.length]
  return { shirt: at(BOTS.shirts, 0), pants: at(BOTS.pants, 5), skin: at(BOTS.skin, 10), hair: at(BOTS.hair, 15) }
}

class Remote {
  constructor(scene, id) {
    this.scene = scene
    this.colors = colorsFor(id)
    this.group = new Group()
    this.group.visible = false
    scene.add(this.group)
    this.avatar = null
    this.animator = null
    this.cue = null
    this.avatarJson = null
    this.generation = 0
    this.placed = false
    this.seq = -1 // emoteSeq last acted on
    this.base = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, at: 0, key: '' }
    this.lastY = 0
    this.vy = 0
    this.lean = 0
    this.entity = { id, sid: id, uid: '', isRemote: true, name: 'Player', flag: '', rank: 0, wins: 0, cash: 0, streak: 0, tag: '', color: this.colors.shirt, colors: this.colors, cueId: DEFAULT_CUE, group: this.group, aimUntil: 0, x: 0, y: 0, z: 0, hidden: true }
    this.setAvatar(buildDefaultCharacter(this.colors))
  }

  setAvatar(next) {
    if (this.avatar) this.group.remove(this.avatar)
    disposeLook(this.avatar)
    const emote = this.animator?.emoteId
    disposeAnimator(this.animator)
    this.avatar = next
    if (COARSE_POINTER) next.traverse((o) => o.isMesh && (o.castShadow = false)) // shadow passes add up on phones
    this.group.add(next)
    this.animator = makeAnimator(next)
    if (emote) this.playEmote(emote)
    this.cue = attachCue(next)
    this.cueId = undefined
  }

  // The game's own emote (emotes.js) or a Boxity catalogue one (boxityEmotes.js); unknown = stop.
  playEmote(id) {
    const def = EMOTE_BY_ID[id]
    if (def) return this.animator?.playEmote(def)
    const clip = boxityEmote(id)?.clip
    if (clip) this.animator?.playClip(id, clip)
    else this.animator?.stopEmote()
  }

  // A player's look arrives as JSON { equipped, proportions, skin, outfitKey }; "" = default.
  async syncAvatar(json) {
    if (json === this.avatarJson) return
    this.avatarJson = json
    const mine = ++this.generation
    if (!json) return this.setAvatar(buildDefaultCharacter(this.colors))
    let look = null
    try {
      look = JSON.parse(json)
    } catch {
      return
    }
    try {
      const skinUrl = look?.skin || (look?.equipped ? bloxity.getSkinTextureUrlFor(look.equipped) : null)
      const group = await buildLook({ equipped: look?.equipped, proportions: look?.proportions, skinUrl, outfitKey: typeof look?.outfitKey === 'string' ? look.outfitKey : '' }, () => mine !== this.generation)
      if (mine !== this.generation) return disposeLook(group)
      this.setAvatar(group)
    } catch (err) {
      console.warn('[remote] avatar failed to load', err)
    }
  }

  // Roster fields -> the hub entity (name tag + Players panel).
  syncEntity(p) {
    const e = this.entity
    e.name = p.username || 'Player'
    e.flag = p.flag || ''
    e.rank = p.rank || 0
    e.wins = p.wins || 0
    e.cash = p.cash || 0
    e.tag = p.tag || ''
    e.cueId = p.cue || DEFAULT_CUE
    e.uid = p.uid || ''
    e.streak = p.streak || 0 // the flame on their name tag
    e.pfp = p.pfp || '' // their Boxity profile picture (match cards)
  }

  update(p, dt, now) {
    this.syncAvatar(p.avatar)
    const cue = p.cue || DEFAULT_CUE
    if (cue !== this.cueId) {
      this.cueId = cue
      applyCueLook(this.cue, cue)
    }
    // emotes: a new emoteSeq (re)starts p.emote, or stops it when ""
    if (p.emoteSeq !== this.seq) {
      this.seq = p.emoteSeq
      this.playEmote(p.emote)
    }

    // a new pose resets the dead-reckoning base
    const b = this.base
    const key = `${p.x}|${p.y}|${p.z}|${p.yaw}|${p.speed}`
    if (key !== b.key) Object.assign(b, { key, x: p.x, y: p.y, z: p.z, yaw: p.yaw, speed: p.speed, at: now })
    const ahead = Math.min((now - b.at) / 1000, REMOTES.predictMax) * b.speed
    const tx = b.x + Math.sin(b.yaw) * ahead
    const tz = b.z + Math.cos(b.yaw) * ahead
    const g = this.group
    const far = Math.hypot(tx - g.position.x, tz - g.position.z) > 12
    const k = this.placed && !far ? 1 - Math.exp(-REMOTES.lerp * dt) : 1
    g.position.x += (tx - g.position.x) * k
    g.position.y += (b.y - g.position.y) * k
    g.position.z += (tz - g.position.z) * k
    g.rotation.y += angleDelta(g.rotation.y, b.yaw) * k
    this.vy = this.placed && dt > 0 ? this.vy + ((g.position.y - this.lastY) / dt - this.vy) * Math.min(1, dt * 10) : 0
    this.lastY = g.position.y
    this.placed = true
    this.animator?.update(dt, { grounded: Math.abs(this.vy) < 1.5, speed: b.speed, verticalVelocity: this.vy, turn: 0 })
    this.lean += ((now < this.entity.aimUntil ? 1 : 0) - this.lean) * Math.min(1, dt * 8)
    if (this.avatar) aimPose(this.avatar, this.lean)
    const e = this.entity
    e.x = g.position.x
    e.y = g.position.y
    e.z = g.position.z
  }

  hide() {
    this.group.visible = false
    this.entity.hidden = true
    this.placed = false // snap into place when it comes back
  }

  dispose() {
    this.generation++ // an avatar still loading is dropped
    this.scene.remove(this.group)
    disposeLook(this.avatar)
    disposeAnimator(this.animator)
  }
}

export function createRemotePlayers(scene) {
  const remotes = new Map() // sessionId -> Remote
  const entities = [] // every roster player but this one (drawn or not)
  const near = [] // reused each frame: [{ id, p, d }]

  // --- this player's presence -------------------------------------------------------------
  let room = null // the room the presence below was last sent to (a rejoin re-sends it all)
  let poseKey = ''
  let poseAt = 0
  let statsKey = ''
  let lookKey = null
  let lookAt = 0
  let emote = ''
  // This player's look for the others (guests included): the ids, proportions, composed skin and
  // the outfit key the platform character kit dresses from.
  function lookJson() {
    const equipped = bloxity.getEquippedAvatar()
    if (!equipped) return ''
    return JSON.stringify({ equipped, proportions: bloxity.getProportions() ?? null, skin: bloxity.getSkinTextureUrl() ?? '', outfitKey: bloxity.getOutfitKey() })
  }
  let arrived = false // the roster of the room just joined was read once (friend toasts: in room vs joined)
  function sendPresence(pose, stats, now) {
    if (!net.connected || !net.room) return
    if (net.room !== room) {
      room = net.room
      arrived = false
      poseKey = statsKey = ''
      lookKey = null
      if (emote) sendServer('emote', { id: emote })
    }
    if (now - poseAt >= 1000 / REMOTES.poseHz) {
      const q = { x: Math.round(pose.x * 100) / 100, y: Math.round(pose.y * 100) / 100, z: Math.round(pose.z * 100) / 100, yaw: Math.round(pose.yaw * 1000) / 1000, speed: Math.round(pose.speed * 10) / 10 }
      const key = `${q.x}|${q.y}|${q.z}|${q.yaw}|${q.speed}`
      if (key !== poseKey) {
        poseKey = key
        poseAt = now
        sendServer('pose', q)
      }
    }
    const s = { wins: stats.wins | 0, cash: Math.floor(stats.cash || 0), rank: stats.rank | 0, flag: stats.flag || '', streak: stats.streak | 0 }
    const sk = `${s.wins}|${s.cash}|${s.rank}|${s.flag}|${s.streak}`
    if (sk !== statsKey) {
      statsKey = sk
      sendServer('stats', s)
    }
    if (lookKey === null || now - lookAt > 3000) {
      lookAt = now
      const look = lookJson()
      if (look !== lookKey) {
        lookKey = look
        sendServer('setAvatar', { avatar: look })
      }
    }
  }

  function clear() {
    for (const r of remotes.values()) r.dispose()
    remotes.clear()
    entities.length = 0
  }

  return {
    entities,
    // The hub entity of the roster player `sid` (drawn or not), or null.
    bySid: (sid) => remotes.get(sid)?.entity ?? null,
    // The hub entity of the player with Boxity account id `uid` (chat bubbles), or null.
    byUid(uid) {
      if (!uid) return null
      for (const r of remotes.values()) if (r.entity.uid === uid) return r.entity
      return null
    },
    // This player's emote: an id from emotes.js, or '' when it stopped.
    sendEmote(id) {
      emote = id || ''
      sendServer('emote', { id: emote })
    },
    // pose { x, y, z, yaw, speed } and stats { wins, cash, rank, flag, streak } of this player.
    update(dt, pose, stats) {
      const now = performance.now()
      sendPresence(pose, stats, now)
      const players = net.connected ? net.room?.state?.players : null
      if (!players) return remotes.size && clear()
      const mine = net.room.sessionId
      near.length = 0
      players.forEach((p, id) => {
        if (id === mine) return
        near.push({ id, p, d: Math.hypot(p.x - pose.x, p.z - pose.z) })
      })
      near.sort((a, b) => a.d - b.d)
      entities.length = 0
      for (let i = 0; i < near.length; i++) {
        const { id, p } = near[i]
        let r = remotes.get(id)
        if (!r) remotes.set(id, (r = new Remote(scene, id)))
        r.syncEntity(p)
        // "X joined you" toasts (Boxity shows them for friends only)
        if (!r.reported && p.username) {
          r.reported = true
          bloxity.reportPlayer(p.username, !arrived)
        }
        r.alive = now
        entities.push(r.entity)
        if (i >= MAX) {
          if (r.group.visible || r.placed) r.hide()
          continue
        }
        r.group.visible = true
        r.entity.hidden = false
        r.update(p, dt, now)
      }
      arrived = true
      for (const [id, r] of remotes) {
        if (r.alive === now) continue
        r.dispose()
        remotes.delete(id)
      }
    },
  }
}
