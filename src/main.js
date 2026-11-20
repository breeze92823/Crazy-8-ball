import { ACESFilmicToneMapping, Clock, Group, PCFSoftShadowMap, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three'
import { CAMERA, ECONOMY, PAD, SPAWN, TABLE, graphicsPreset, RENDER } from './config.js'
import * as bloxity from './bloxity.js'
import { install as installInput, onKey } from './input.js'
import { installTouch } from './touch.js'
import { createPlayerBody, interpolate as interpolatePlayer, player, resetPlayer, respawn } from './player.js'
import { getYaw, setCameraSensitivity, syncYawToPlayer, update as updateCamera } from './camera.js'
import { isFirstPerson, onModeChanged, toggleMode } from './modes.js'
import { initPhysics, stepPhysics } from './physics.js'
import { createLighting } from './lighting.js'
import { createWorld } from './world.js'
import { createPostFx } from './postfx.js'
import { setNeonBloom } from './propkit.js'
import { buildDefaultCharacter, loadBaseCharacter } from './avatar/character.js'
import { applyProportions, attachEquippedAccessories } from './avatar/loader.js'
import { disposeAnimator, makeAnimator } from './avatar/animator.js'
import { A } from './audio/core.js'
import { at, installAudio, setListener, sfx, updateAmbience } from './audio/index.js'
import { AUDIO } from './config.js'
import { initNav } from './hub/nav.js'
import { buildRooftop } from './hub/rooftop.js'
import { SPOTS, buildLayout, floorAt } from './hub/layout.js'
import { createTables } from './hub/tables.js'
import { attachCue, createBots } from './hub/bots.js'
import { createGuide } from './hub/guide.js'
import { createFx } from './hub/fx.js'
import { createBoards } from './hub/boards.js'
import { createHud } from './hub/hud.js'
import { COUNTRIES } from './hub/paint.js'
import { createMatch } from './hub/match.js'

// Boot order: Bloxity SDK -> renderer -> Rapier (async wasm) -> sky + lighting,
// the rooftop hub (tower, city, props, tables, bots), player body -> avatar
// (async, swaps in when ready) -> HUD + audio -> loop.
let lighting = null
let renderer = null
let postfx = null
let fx = null

// --- Save (local) -------------------------------------------------------------------
const save = (() => {
  const def = { cash: ECONOMY.startCash, wins: 0, streak: 0, tutorialDone: false, settings: { sfx: 0.8, ambience: 0.8, piano: true, guide: true, tags: true, night: false } }
  try {
    const raw = JSON.parse(localStorage.getItem(ECONOMY.storageKey) || 'null')
    return raw ? { ...def, ...raw, settings: { ...def.settings, ...raw.settings } } : def
  } catch {
    return def
  }
})()
function persist() {
  try {
    localStorage.setItem(ECONOMY.storageKey, JSON.stringify(save))
  } catch {
    // storage blocked: this session only
  }
}

// Settings come from the portal's settings menu (or their defaults offline).
function applySetting(key, value) {
  if (key === 'camera_sensitivity') setCameraSensitivity(value)
  else if (key === 'fullscreen') bloxity.requestFullscreen(value)
  else if (key === 'graphics_quality' && renderer) {
    const next = graphicsPreset(value)
    renderer.shadowMap.enabled = next.shadows
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, next.dpr))
    lighting?.setShadows(next)
    postfx?.configure(next)
    setNeonBloom(next.bloom)
    postfx?.setSize(window.innerWidth, window.innerHeight)
    resize()
  }
}
bloxity.onSetting(applySetting)
bloxity.init()

// --- Renderer ---------------------------------------------------------------
const preset = graphicsPreset(bloxity.settings.graphics_quality)
renderer = new WebGLRenderer({ antialias: preset.antialias, powerPreference: 'high-performance' })
renderer.outputColorSpace = SRGBColorSpace
renderer.toneMapping = ACESFilmicToneMapping
renderer.toneMappingExposure = RENDER.exposure
renderer.shadowMap.enabled = preset.shadows
renderer.shadowMap.type = PCFSoftShadowMap
renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.dpr))
document.body.appendChild(renderer.domElement)
installInput(() => bloxity.showMenu(), renderer.domElement) // Esc opens the portal menu

const scene = new Scene()
const camera = new PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far)
postfx = createPostFx(renderer, scene, camera)
postfx.configure(preset)

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight)
  postfx.setSize(window.innerWidth, window.innerHeight)
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  fx?.setScale((window.innerHeight * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360)))
}
window.addEventListener('resize', resize)
resize()

for (const key of Object.keys(bloxity.settings)) applySetting(key, bloxity.settings[key])

// --- Physics + world -----------------------------------------------------------
bloxity.loadingStep('Starting physics')
await initPhysics()

lighting = createLighting(scene, renderer, preset)
const world = createWorld(scene) // the sea and clouds
bloxity.loadingStep('Building the rooftop')
initNav()
const roof = buildRooftop(scene)
const layout = buildLayout(scene, lighting)
const tables = createTables(scene)
const bots = createBots(scene, tables)
const guide = createGuide(scene)
fx = createFx(scene, { petalSources: layout.petalSources, firePos: SPOTS.fire, quality: preset.particles })
resize()
createPlayerBody()
syncYawToPlayer()

// The local player as a hub entity (name tag, pads, players list).
const myName = () => {
  const n = bloxity.displayName()
  return n === 'Offline' ? 'You' : n
}
const regionFlag = (() => {
  const loc = navigator.language || 'en-US'
  const r = loc.split('-')[1]?.toUpperCase()
  return COUNTRIES[r] ? r : 'US'
})()
const me = { id: 'me', isPlayer: true, name: myName(), flag: regionFlag, rank: Math.min(8, Math.floor(save.wins / 5)), streak: save.streak, wins: save.wins, color: '#3dff8a', x: SPAWN.x, z: SPAWN.z, y: 0, zone: null }
const boards = createBoards(layout.boardMats, regionFlag)

// --- Player avatar ----------------------------------------------------------
const playerGroup = new Group()
scene.add(playerGroup)
let avatar = null
let animator = null
let generation = 0
let avatarReady = false

function setAvatar(next) {
  if (avatar) playerGroup.remove(avatar)
  disposeAnimator(animator)
  avatar = next
  playerGroup.add(avatar)
  animator = makeAnimator(avatar)
  attachCue(avatar)
}

setAvatar(buildDefaultCharacter()) // visible immediately; replaced once the rig loads

async function loadAvatar() {
  const mine = ++generation
  try {
    const group = await loadBaseCharacter()
    if (mine !== generation) return
    const equipped = bloxity.authState.user ? bloxity.getEquippedAvatar() : null
    await attachEquippedAccessories(group, equipped, { skinTextureUrl: bloxity.getSkinTextureUrl() })
    if (mine !== generation) return
    applyProportions(group, bloxity.authState.user ? bloxity.getProportions() : null)
    setAvatar(group)
  } finally {
    if (mine === generation) avatarReady = true
  }
}

let signedIn = null
bloxity.subscribeAuth((s) => {
  me.name = myName()
  const now = !!s.user
  if (now !== signedIn) {
    signedIn = now
    loadAvatar()
  }
})
bloxity.onAvatarChanged(loadAvatar)
bloxity.onProportionsChanged(() => applyProportions(avatar, bloxity.getProportions()))
bloxity.onRespawnRequest(doRespawn)

// --- HUD + audio -------------------------------------------------------------
installAudio()
function applyAudioSetting(key, v) {
  if (!A.master) return
  if (key === 'sfx') A.sfx.gain.setTargetAtTime(AUDIO.buses.sfx * v, A.ctx.currentTime, 0.05)
  if (key === 'ambience') A.amb.gain.setTargetAtTime(AUDIO.buses.amb * v, A.ctx.currentTime, 0.05)
}
const audioStart = setInterval(() => {
  if (!A.master) return
  clearInterval(audioStart)
  applyAudioSetting('sfx', save.settings.sfx)
  applyAudioSetting('ambience', save.settings.ambience)
}, 250)

const hud = createHud({
  settings: save.settings,
  onSetting(key, value) {
    if (key === '_modal') {
      inMenu = value
      sfx.panel(value)
      return
    }
    save.settings[key] = value
    persist()
    applyAudioSetting(key, value)
    if (key === 'night' && lighting.isNight() !== value) lighting.toggleDayNight()
  },
  onSkip() {
    save.tutorialDone = true
    save.settings.guide = false
    persist()
    hud.showSkip(false)
  },
  onLeave: leavePad,
})
let inMenu = false
if (save.settings.night) lighting.toggleDayNight()
hud.showSkip(!save.tutorialDone)
hud.setCash(save.cash)
hud.setStreak(save.streak)
bloxity.onReservedAreas((areas) => {
  const bar = areas.find((a) => a.id === 'toolbar')
  // a toolbar spanning most of the width (phones) pushes the top HUD down
  hud.setReservedTop(bar && bar.width > window.innerWidth * 0.55 ? bar.top + bar.height : 0)
})

// The player's match (match.js) takes over the camera and input while it runs.
const match = createMatch({ scene, camera, renderer, tables, hud, me, bots })

function addCash(n) {
  save.cash += n
  hud.setCash(save.cash)
  persist()
}

// --- Pads ---------------------------------------------------------------------
let leftZone = null // the pad the player just left via the button: ignored until they step off it
function leavePad() {
  if (!me.zone || match.active) return
  const t = me.zone.table
  leftZone = me.zone
  tables.leave(me)
  bots.cancelFill(t)
  sfx.padLeave()
}
function doRespawn() {
  if (match.active) return
  leavePad()
  respawn()
}

tables.on((type, data) => {
  if (type === 'sounds') {
    for (const ev of data) {
      const { gain, pan } = at(ev.wx, ev.wz)
      if (gain < 0.01) continue
      if (ev.type === 'ball') sfx.ballClack(ev.speed, gain, pan)
      else if (ev.type === 'rail') sfx.railThud(ev.speed, gain, pan)
      else if (ev.type === 'pocket') sfx.pocketDrop(gain, pan)
      else if (ev.type === 'cue') sfx.cueStrike(ev.speed / 5, gain, pan)
    }
    return
  }
  const t = data.table ?? data
  const near = Math.hypot(t.x - me.x, t.z - me.z) < 30
  if (type === 'join' && data.entity !== me && me.zone?.table === t) {
    sfx.botJoined()
    hud.popup(`${data.entity.name} joined`, new Vector3(data.entity.x, 2.8, data.entity.z), '#7cf0ff', 0.6)
  } else if (type === 'countdown' && me.zone?.table === t) {
    sfx.ready()
    hud.popup('READY!', new Vector3(t.x, 2.4, t.padZ), '#3dff8a', 1.2)
    lastTick = Math.ceil(t.timer) + 1
  } else if (type === 'countdown' && near) {
    hud.popup('READY!', new Vector3(t.x, 2.2, t.padZ), '#3dff8a', 0.8)
  } else if (type === 'pot' && near) {
    const { gain, pan } = at(t.x, t.z)
    sfx.niceShot(gain, pan)
    hud.popup(Math.random() < 0.5 ? 'NICE SHOT!' : 'GREAT SHOT!', new Vector3(t.x, 2.3, t.z), '#ffd23d', 1)
  } else if (type === 'end') {
    for (const e of tables.all(t)) {
      if (e.isPlayer) continue
      if (data.winners.includes(e)) {
        e.wins++
        e.streak++
      } else e.streak = 0
    }
    if (near && !tables.all(t).includes(me)) hud.popup(`${data.winners[0]?.name ?? 'Team'} wins!`, new Vector3(t.x, 2.6, t.z), '#ffffff', 0.8)
  } else if (type === 'match') {
    match.start(t)
  }
})
match.onEnd(({ won, reward }) => {
  if (won) {
    save.wins++
    save.streak++
    me.wins = save.wins
    boards.addWin(save.wins)
  } else save.streak = 0
  me.streak = save.streak
  me.rank = Math.min(8, Math.floor(save.wins / 5))
  hud.setStreak(save.streak)
  addCash(reward)
  if (!save.tutorialDone) {
    save.tutorialDone = true
    hud.showSkip(false)
  }
  persist()
})

// --- Modes + keys --------------------------------------------------------------
onModeChanged((mode) => {
  playerGroup.visible = mode !== 'player'
  me.hidden = mode === 'player'
})
onKey('KeyV', toggleMode)
onKey('KeyN', () => lighting.toggleDayNight())
onKey('KeyR', doRespawn)
installTouch({ mode: toggleMode, day: () => lighting.toggleDayNight(), respawn: doRespawn })
bots.seedGames(4)

// --- Loop -------------------------------------------------------------------
const clock = new Clock()
let shownLoading = true
let readySince = 0
let idleTime = 0
let stride = 0
let wasGrounded = true
let fallSpeed = 0
let lastTick = 0
const cardPos = new Vector3()
const entities = [me, ...bots.list]

function nearestTable(x, z, range) {
  let best = null
  let bd = range
  for (const t of tables.list) {
    const d = Math.hypot(t.x - x, t.padZ - 1.2 - z)
    if (d < bd) {
      bd = d
      best = t
    }
  }
  return best
}
// The pad the guide points at: a half-full 1v1 first, else the nearest open one.
function guideZone() {
  let best = null
  let score = Infinity
  for (const t of tables.list) {
    for (const z of t.zones) {
      if (!tables.canJoin(z)) continue
      const d = Math.hypot(z.x - me.x, z.z - me.z) + (t.team > 1 ? 25 : 0) - (tables.members(t) > 0 ? 8 : 0)
      if (d < score) {
        score = d
        best = z
      }
    }
  }
  return best
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1)
  const elapsed = clock.elapsedTime

  stepPhysics(dt)
  interpolatePlayer()

  const p = player.renderPosition
  playerGroup.position.set(p.x, p.y, p.z)
  playerGroup.rotation.y = player.facing
  const speed = Math.hypot(player.velocity.x, player.velocity.z)
  animator?.update(dt, { grounded: player.grounded, speed, verticalVelocity: player.velocity.y, turn: 0 })
  match.pose(avatar, dt)
  me.x = p.x
  me.z = p.z
  me.y = p.y

  // footsteps + landing
  if (player.grounded && speed > 1) {
    stride += speed * dt
    if (stride > AUDIO.steps.stride) {
      stride = 0
      sfx.footstep(Math.min(1, speed / 10), floorAt(p.x, p.z) > 0.1 ? 'wood' : 'tile')
    }
  }
  if (!player.grounded) fallSpeed = Math.min(fallSpeed, player.velocity.y)
  if (player.grounded && !wasGrounded) {
    if (fallSpeed < -4) sfx.land(Math.min(1, -fallSpeed / 12))
    fallSpeed = 0
  }
  if (!player.grounded && wasGrounded && player.velocity.y > 3) sfx.jump()
  wasGrounded = player.grounded

  // pads: stepping on one joins, stepping off leaves
  if (!match.active) {
    const zone = player.grounded ? tables.zoneAt(p.x, p.z) : me.zone
    if (zone !== leftZone) leftZone = null
    if (zone && !me.zone && zone !== leftZone && tables.canJoin(zone)) {
      if (tables.join(zone, me)) {
        sfx.padEnter()
        fx.burst(p.x, 0.3, p.z, PAD.mine)
        bots.fillFor(zone.table)
      }
    } else if (me.zone && zone !== me.zone && !['match'].includes(me.zone.table.state)) {
      const t = me.zone.table
      tables.leave(me)
      bots.cancelFill(t)
      sfx.padLeave()
    }
  }
  const myTable = me.zone?.table

  bots.update(dt, me)
  tables.update(dt, elapsed, me)
  match.update(dt, elapsed)

  // countdown ticks on the player's table
  if (myTable?.state === 'countdown') {
    const n = Math.ceil(myTable.timer)
    if (n !== lastTick && n >= 1) {
      lastTick = n
      sfx.tick(n)
    }
  }

  // tutorial + guide
  if (speed > 0.5) idleTime = 0
  else idleTime += dt
  const target = !myTable && !match.active ? guideZone() : null
  const showGuide = !!target && (!save.tutorialDone || save.settings.guide)
  guide.setTarget(target ? { x: target.x, z: target.z, stop: Math.max(target.hx, target.hz) } : null)
  guide.setVisible(showGuide)
  guide.update(dt, elapsed, p.x, p.z)
  let tut = ''
  if (match.active) tut = ''
  else if (myTable?.state === 'countdown') tut = `Match starts in ${Math.max(1, Math.ceil(myTable.timer))}...`
  else if (myTable) tut = `Waiting for players ${tables.members(myTable)}/${myTable.cap}`
  else if (!save.tutorialDone) tut = idleTime > 6 ? 'Need help? Follow the arrow!' : 'Join a table!'
  hud.setTutorial(tut)
  hud.showLeave(!!myTable && !match.active && myTable.state !== 'match')
  fx.setSparkZone(me.zone ?? (showGuide ? target : null), me.zone ? PAD.mine : PAD.open)

  // floating card over the nearest table
  let card = null
  const ct = myTable ?? (match.active ? null : nearestTable(p.x, p.z, PAD.cardRange))
  if (ct) {
    const n = tables.members(ct)
    const status = ct.state === 'countdown' ? { cls: 'ready', text: 'READY!' } : ct.state === 'waiting' ? { cls: 'waiting', text: 'WAITING' } : ct.state === 'playing' || ct.state === 'match' ? { cls: 'playing', text: 'PLAYING' } : null
    cardPos.set(ct.x, TABLE.height + 1.25, ct.z + 0.2)
    card = { pos: cardPos, title: ct.mode, host: ct.host?.name ?? null, count: `${n}/${ct.cap}`, status }
  }

  if (!match.active) updateCamera(camera, dt)
  world.update(dt, elapsed)
  lighting.update(dt, playerGroup.position)
  roof.facade.emissiveIntensity = lighting.windows()
  layout.showcase.rotation.y += dt * 0.8
  layout.showcase.position.y = 1.05 + Math.sin(elapsed * 1.6) * 0.08
  layout.crate.rotation.y += dt * 0.6
  layout.crate.position.y = 1.6 + Math.sin(elapsed * 1.9 + 1) * 0.1
  fx.update(dt, elapsed, { night: lighting.getNight() })

  // audio listener + ambience levels
  setListener(p.x, p.z, getYaw())
  const fire = at(SPOTS.fire.x, SPOTS.fire.z, AUDIO.ambience.fireNear * 0.3, AUDIO.ambience.fireNear * 2.2)
  const piano = at(SPOTS.piano.x, SPOTS.piano.z, 4, AUDIO.ambience.pianoNear * 2.5)
  const chime = at(0, -26, 6, 34)
  updateAmbience(dt, { night: lighting.getNight(), fire: fire.gain, firePan: fire.pan, piano: piano.gain * AUDIO.ambience.piano, pianoPan: piano.pan, chime: chime.gain, chimePan: chime.pan, pianoOn: save.settings.piano })

  hud.setPlayers(entities, me)
  hud.update(dt, camera, entities, card, save.settings.tags && !match.active)
  postfx.render()

  if (shownLoading) {
    readySince += dt
    if (avatarReady || readySince > 5) {
      shownLoading = false
      bloxity.notifyFirstFrame()
    }
  }
})

window.addEventListener('beforeunload', bloxity.teardown)

if (import.meta.env.DEV) {
  const teleport = (x, y, z, facing = player.facing) => {
    resetPlayer({ x, y, z }, facing)
    syncYawToPlayer()
  }
  window.__game = { player, scene, renderer, camera, postfx, toggleMode, teleport, tables, bots, me, match, save, lighting, isFirstPerson }
}
