// The player's match against the real players seated at the hub table they joined
// (everyone around sees the balls move). Flow:
//   table full (server tables.ts) -> "WHO BREAKS?" roulette -> turns -> result card.
// Whoever shoots runs the physics and the rules on their own client: mAim while aiming,
// mShot on the strike, mBalls while the balls roll, mEnd with the outcome (next team, groups,
// ball in hand, foul, winner). The server picks the next shooter and answers everyone mTurn,
// which moves every client on (applyTurn). The others' shots are drawn by tablenet.js from that
// stream; this module only shows them (banners, cards, clock, camera).
// My turn: a 3D camera behind the cue ball (wheel / pinch zooms from low behind
// the cue up to a high view), drag to turn the aim, pull the PULL bar (or hold
// Space) and let go to shoot. Spin + cue elevation from the cue-ball widget,
// fine aim toggle, ball in hand ("MOVE") after the opponent fouls. The others'
// turns hand the camera back to the hub chase cam (an overview while their balls roll).
// The first match is a guided tutorial (break, drag, zoom out, zoom in, shoot).
// Potting your balls fills the ABILITY bar; at 100 % press G (or tap the ability
// button) to use the equipped ability (Ability Spin screen; abilityPlay.js runs
// all 15: Fire Shot, Eagle's Eye, Portals, Black Hole, ...). Most arm the next
// shot; Look Over There! makes the next opponent's shot go wild (sent with mEnd).
// 8-ball rules (WPA-style, see resolve()): the breaker has ball in hand behind the
// head string; a legal break pots a ball or drives 4 object balls to a cushion,
// else the table is re-racked for the other team to break. Open table after the
// break; the first legal pot sets solids/stripes. Fouls (scratch, no ball hit,
// wrong ball first, no cushion after contact, shot clock) give the other team ball
// in hand anywhere (behind the head string after a scratch on the break). Once a
// team's group is cleared it must hit the 8 first and call its pocket (tap a pocket
// marker; the guide's pocket is the default): the 8 in the called pocket wins, in
// another pocket, early, or with a foul loses.
// Rewards are cash only (ECONOMY), never premium currency.
import {
  CanvasTexture,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RepeatWrapping,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector2,
  Vector3,
} from 'three'
import { ECONOMY, MATCH, TABLE } from '../config.js'
import { player, resetPlayer } from '../player.js'
import { syncYawToPlayer, update as updateHubCamera } from '../camera.js'
import { setMoveLock } from '../input.js'
import { sfx } from '../audio/index.js'
import './match.css'
import { ballColor } from './paint.js'
import { applyCueLook } from '../cues.js'
import { TABLE_BED_Y } from './props.js'
import { BED, FOOT_SPOT, HEAD_SPOT, POCKETS, pickShot } from './tablesim.js'
import { applyBalls, packBalls, packEvent } from './tablenet.js'
import { net, onServer, request, sendServer } from '../net.js'
import { adScreen, rewardedAvailable, showRewarded } from '../bloxity.js'
import { aimPose } from './stance.js'
import { createMatchFx } from './matchfx.js'
import { TINT, createAbilityPlay } from './abilityPlay.js'
import { equippedId } from './abilityStore.js'
import { ABILITY_BY_ID, RARITY, abilityIcon } from '../abilities.js'
import './abilityPlay.css'

const R = BED.r
const BALL_Y = TABLE_BED_Y + R
const rnd = (a, b) => a + Math.random() * (b - a)
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const lerp = (a, b, k) => a + (b - a) * k
const groupOf = (n) => (n > 0 && n < 8 ? 'solids' : n > 8 ? 'stripes' : null)
const other = (g) => (g === 'solids' ? 'stripes' : 'solids')
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches

// --- icons ---------------------------------------------------------------------------
const ICON = {
  hand: '<svg viewBox="0 0 64 80"><path d="M24 6c4 0 6 3 6 6v23l2-1v-8c0-3 2-5 5-5s5 2 5 5v9h1v-5c0-3 2-5 5-5s5 2 5 5v7c0-3 2-4 4-4s4 2 4 5v14c0 14-9 23-22 23h-4c-9 0-14-4-19-11L4 50c-2-3-1-6 1-7 3-2 6-1 8 1l5 6V12c0-3 2-6 6-6z" fill="#d9f3ff" stroke="#14163a" stroke-width="4" stroke-linejoin="round"/><path d="M30 35v-8M42 36v-6M53 38v-4" stroke="#14163a" stroke-width="3" stroke-linecap="round" opacity=".5"/></svg>',
  grab: '<svg viewBox="0 0 64 64"><path d="M14 30v-9c0-3 2-5 4-5s4 2 4 5v5-12c0-3 2-5 4-5s4 2 4 5v11-14c0-3 2-5 4-5s4 2 4 5v14-10c0-3 2-5 4-5s4 2 4 5v20c0 12-7 19-17 19h-3c-7 0-11-3-15-9l-6-10c-2-3-1-5 1-6s5 0 6 2z" fill="#fff" stroke="#14163a" stroke-width="3.4" stroke-linejoin="round"/></svg>',
  mouse: '<svg viewBox="0 0 60 90"><rect x="6" y="6" width="48" height="78" rx="24" fill="#fff" stroke="#14163a" stroke-width="5"/><path d="M6 36h48M30 6v30" stroke="#14163a" stroke-width="4"/><rect x="25" y="14" width="10" height="16" rx="5" fill="#14163a"/></svg>',
  scroll: '<svg viewBox="0 0 40 170"><path d="M20 4L36 30H4z" fill="#fff" stroke="#14163a" stroke-width="3.5" stroke-linejoin="round"/><path d="M20 166L36 140H4z" fill="#fff" stroke="#14163a" stroke-width="3.5" stroke-linejoin="round"/><g stroke="#14163a" stroke-width="3" fill="#fff">' + [48, 66, 84, 102, 120].map((y) => `<rect x="2" y="${y}" width="36" height="7" rx="3.5"/>`).join('') + '</g></svg>',
  pinch: '<svg viewBox="0 0 80 80"><circle cx="24" cy="24" r="10" fill="#d9f3ff" stroke="#14163a" stroke-width="4"/><circle cx="56" cy="56" r="10" fill="#d9f3ff" stroke="#14163a" stroke-width="4"/><path d="M33 33l14 14" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-dasharray="3 6"/></svg>',
  door: '<svg viewBox="0 0 32 32"><path d="M6 4h14v24H6z" fill="#ff6b6b" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/><path d="M15 16h13M23 11l5 5-5 5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  glass: '<svg viewBox="0 0 24 30"><path d="M3 2h18M3 28h18M5 2c0 8 7 9 7 13S5 20 5 28M19 2c0 8-7 9-7 13s7 5 7 13" fill="none" stroke="#14163a" stroke-width="3.4" stroke-linecap="round"/><path d="M5 2c0 8 7 9 7 13S5 20 5 28M19 2c0 8-7 9-7 13s7 5 7 13" fill="none" stroke="#ffd23d" stroke-width="1.6"/><path d="M8 25c2-3 6-3 8 0z" fill="#ffd23d"/></svg>',
  watch: '<svg viewBox="0 0 32 32"><circle cx="16" cy="18" r="11" fill="#e8f2ff" stroke="#14163a" stroke-width="3"/><path d="M13 3h6M16 3v4M16 18l4-5" stroke="#14163a" stroke-width="3" stroke-linecap="round"/><path d="M25 8l2-2" stroke="#14163a" stroke-width="3" stroke-linecap="round"/><path d="M16 9a9 9 0 0 1 9 9h-9z" fill="#4dabf7" opacity=".6"/></svg>',
  flame: '<svg viewBox="0 0 40 40"><path d="M20 2c2 7 12 10 12 22a12 12 0 0 1-24 0c0-6 4-10 6-12 0 4 2 6 4 6 0-6-2-11 2-16z" fill="#ff6a1a" stroke="#14163a" stroke-width="2.4" stroke-linejoin="round"/><path d="M20 20c2 3 6 5 6 9a6 6 0 0 1-12 0c0-3 2-5 6-9z" fill="#ffd43b"/><circle cx="28" cy="30" r="7" fill="#fff" stroke="#14163a" stroke-width="2"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" stroke="#14163a" stroke-width="7" stroke-linecap="round"/><path d="M5 5l14 14M19 5L5 19" stroke="#ff4f4f" stroke-width="4" stroke-linecap="round"/></svg>',
  cueball: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="15" fill="#ffd23d" stroke="#14163a" stroke-width="3"/><circle cx="14" cy="14" r="4" fill="#fff" opacity=".7"/><path d="M2 14l8 3M4 24l7-2" stroke="#14163a" stroke-width="3" stroke-linecap="round"/></svg>',
  fine: '<svg viewBox="0 0 32 24"><path d="M3 12h18M15 6l6 6-6 6M27 4v16" fill="none" stroke="#14163a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

// --- portraits (top cards + roulette): the player's Boxity profile picture (`e.pfp`), else a
// blocky avatar head painted per entity (also when the picture fails to load) ------------------
function setFace(img, e) {
  const want = e?.pfp || portrait(e)
  if (img.dataset.face === want) return
  img.dataset.face = want
  img.onerror = e?.pfp
    ? () => {
        img.onerror = null
        img.src = portrait(e)
      }
    : null
  img.src = want
}
const portraits = new Map()
function portrait(e) {
  if (portraits.has(e)) return portraits.get(e)
  const c = document.createElement('canvas')
  c.width = c.height = 96
  const g = c.getContext('2d')
  const col = e.colors ?? { skin: '#f5cd8f', hair: '#c96a2a', shirt: '#1d1d22' }
  const bg = g.createLinearGradient(0, 0, 0, 96)
  bg.addColorStop(0, '#bfe6ff')
  bg.addColorStop(1, '#eaf6ff')
  g.fillStyle = bg
  g.fillRect(0, 0, 96, 96)
  g.fillStyle = col.shirt
  g.beginPath()
  g.roundRect(14, 72, 68, 30, 12)
  g.fill()
  g.fillStyle = col.skin
  g.beginPath()
  g.roundRect(26, 26, 44, 44, 12)
  g.fill()
  g.fillStyle = col.hair
  g.beginPath()
  g.roundRect(22, 16, 52, 22, [14, 14, 6, 6])
  g.fill()
  g.fillRect(22, 26, 9, 22)
  // shades or eyes
  const id = String(e.name ?? '').length
  if (id % 2) {
    g.fillStyle = '#2a1a4a'
    g.beginPath()
    g.roundRect(30, 42, 36, 10, 5)
    g.fill()
  } else {
    g.fillStyle = '#14163a'
    g.fillRect(38, 44, 5, 8)
    g.fillRect(54, 44, 5, 8)
  }
  g.strokeStyle = '#14163a'
  g.lineWidth = 2.5
  g.beginPath()
  g.arc(48, 58, 6, 0.2, Math.PI - 0.2)
  g.stroke()
  const url = c.toDataURL()
  portraits.set(e, url)
  return url
}

// --- textures for the guide lines and outlines -------------------------------------------
function dashTexture() {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 8
  const g = c.getContext('2d')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, 34, 8)
  const t = new CanvasTexture(c)
  t.wrapS = RepeatWrapping
  return t
}
function ringTexture(color, w = 7) {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')
  g.strokeStyle = color
  g.lineWidth = w
  g.shadowColor = color
  g.shadowBlur = 6
  g.beginPath()
  g.arc(64, 64, 64 - w - 3, 0, Math.PI * 2)
  g.stroke()
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  return t
}

// A flat strip lying on the cloth from `a` to `b` (world x/z), width `w`.
function makeStrip(mat, w) {
  const geo = new PlaneGeometry(1, 1)
  geo.rotateX(-Math.PI / 2)
  geo.translate(0.5, 0, 0)
  const m = new Mesh(geo, mat)
  m.renderOrder = 9
  m.frustumCulled = false
  m.visible = false
  m.userData.w = w
  return m
}
function setStrip(m, ax, az, bx, bz, y = TABLE_BED_Y + 0.004) {
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  if (len < 1e-4) {
    m.visible = false
    return 0
  }
  m.position.set(ax, y, az)
  m.rotation.set(0, -Math.atan2(dz, dx), 0)
  m.scale.set(len, 1, m.userData.w)
  m.visible = true
  return len
}

export function createMatch({ scene, camera, tables, hud, me, fx: hubFx, save, persist, addCash, getMyGroup, entityOf, mySid, forfeit }) {
  const endListeners = []
  const M = { active: false, table: null, freeCam: false, onEnd: (fn) => endListeners.push(fn) }
  const mfx = createMatchFx(scene, TABLE_BED_Y)
  // the 15 abilities' physics + visuals; ctx reads this match's live state
  const play = createAbilityPlay({
    scene,
    bedY: TABLE_BED_Y,
    mfx,
    ctx: {
      sim: () => sim,
      phase: () => phase,
      aim: () => aim,
      setAim: (a) => (aim = a),
      power: () => power,
      spin: () => spin,
      elev: () => elev,
      speedFor: (p) => MATCH.minSpeed + p * (MATCH.maxSpeed - MATCH.minSpeed),
      legal: (n) => legalFor(turn)(n),
      mine: (n) => n !== 0 && n !== 8 && (!groups[myTeam] || groupOf(n) === groups[myTeam]),
      popup: (text, x, z, color) => hud.popup(text, new Vector3(t.x + x, TABLE_BED_Y + 0.45, t.z + z), color, 1.1),
      banner: (kind, title, sub, secs) => banner(kind, title, sub, secs),
      shake: (k) => (shake = Math.max(shake, k)),
      flash: (color) => flashScreen(color),
    },
  })

  // --- state ---
  let t = null
  let sim = null
  let phase = 'off' // roulette | intro | aim | strike | rolling | ai | over
  let turn = 0
  let myTeam = 0
  let groups = [null, null]
  let breakShot = true
  let ballInHand = false
  let kitchen = false // ball in hand only behind the head string (the break, a scratch on the break)
  let callPocket = -1 // the pocket called for the 8 ball (0..5), mine or the shooter's (mAim k)
  let callPicked = false // I tapped a pocket this turn (else the call follows the guide's pocket)
  let shotPre = null // the table before my shot: { onEight, kitchen, call }
  let moveTimer = 0
  let grabbed = false // dragged the cue ball this turn (hides the hand hint on it)
  // this match on the server: its id, the turn number, whose shot it is, the seated teams (sessionIds)
  let matchId = 0
  let seq = 0
  let shooterSid = ''
  let teams = [[], []]
  let room = null // the server room the match runs in (losing it ends the match)
  let distracted = false // Look Over There! hit me: my next shot goes wild
  let oppDistracted = false // I used it: the next opponent's shot goes wild
  let remoteAb = '' // the ability on the shot in flight of another player (its aura)
  let sendAt = 0 // performance.now() of the last mAim / mBalls
  let aimKey = ''
  const outbox = [] // sound/fx events of my rolling shot, for the next mBalls
  let clock = 0
  let aim = 0
  let power = 0
  let charging = false
  let spaceCharge = false
  let chargeT = 0
  let lastTickPower = 0
  let fineDir = 0
  let fine = false
  const spin = { x: 0, y: 0 }
  let elev = 0 // 0..1 cue elevation
  let zoom = 0.35
  let zoomTarget = 0.35
  let aiTimer = 0 // s left of the pause after a foul
  let pending = null // { angle, speed, t, fromPower, mods } my stroke
  let shotByMe = false
  let armed = '' // the ability armed for my next shot ('' = none)
  let shotAb = '' // the ability riding on the shot in flight
  let abKind = '' // the equipped ability this match (abilityStore)
  let rollT = 0 // s the balls have been rolling (a safety stop at 16 s)
  let lastScorch = null
  let streakCount = 0
  let lastClockTick = 0
  let roulette = null
  let introTimer = 0
  let ability = clamp(save.ability ?? 0, 0, 100)
  let tut = null // { step, t, drag }
  let matchTutorial = false

  // --- camera ---
  const hubCam = new PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1200)
  const rig = new PerspectiveCamera()
  let view = 'hub'
  let camRate = 3
  const camGoal = { p: new Vector3(), look: new Vector3(), fov: 55 }
  const camLook = new Vector3()
  const saved = { near: camera.near, fov: camera.fov }
  function setView(v) {
    if (v === view) return
    if (v !== 'hub' && view === 'hub') sfx.whoosh(1)
    view = v
    camRate = 2.4
    M.freeCam = v === 'hub'
  }

  // --- aim visuals ---
  const lineMat = new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })
  const dashMap = dashTexture()
  const dashMat = new MeshBasicMaterial({ color: '#ffffff', map: dashMap, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })
  const badMat = new MeshBasicMaterial({ color: '#ff4f6a', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })
  const tubeL = makeStrip(lineMat, 0.008)
  const tubeR = makeStrip(lineMat, 0.008)
  const dash = makeStrip(dashMat, 0.012)
  const objLine = makeStrip(lineMat, 0.009)
  const cueLine = makeStrip(lineMat, 0.009)
  const bounce = makeStrip(lineMat, 0.008)
  const xA = makeStrip(badMat, 0.012)
  const xB = makeStrip(badMat, 0.012)
  const ghost = new Mesh(new RingGeometry(R * 0.86, R, 40), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, side: DoubleSide }))
  ghost.rotation.x = -Math.PI / 2
  const handRing = new Mesh(new RingGeometry(R * 1.55, R * 1.85, 40), new MeshBasicMaterial({ color: '#4d7cff', transparent: true, depthWrite: false, side: DoubleSide }))
  handRing.rotation.x = -Math.PI / 2
  // the head string, shown while the ball in hand must stay behind it
  const headLine = makeStrip(new MeshBasicMaterial({ color: '#4d7cff', transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }), 0.012)
  const guide = [tubeL, tubeR, dash, objLine, cueLine, bounce, xA, xB, ghost, handRing, headLine]
  for (const o of guide) {
    o.renderOrder = 9
    o.visible = false
    o.frustumCulled = false
    scene.add(o)
  }
  // outlines round the balls you may hit (green) / the illegal one you aim at (red)
  const okRing = ringTexture('#3dff6a')
  const badRing = ringTexture('#ff4f4f')
  const outlines = []
  for (let i = 0; i < 16; i++) {
    const s = new Sprite(new SpriteMaterial({ map: okRing, transparent: true, depthWrite: false, depthTest: true }))
    s.scale.setScalar(R * 2.5)
    s.visible = false
    s.renderOrder = 8
    scene.add(s)
    outlines.push(s)
  }
  const hideGuide = () => {
    for (const o of guide) o.visible = false
    for (const s of outlines) s.visible = false
  }

  // --- DOM ---
  const layer = document.createElement('div')
  layer.className = 'match-layer'
  layer.innerHTML = `
    <div class="mt-input"></div>
    <div class="mt-top">
      <div class="mt-card left"><div class="pf"><img alt=""><svg class="ring" viewBox="0 0 50 50"><circle class="arc" cx="25" cy="25" r="22" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg><i class="on"></i></div><div class="mt-rack"></div></div>
      <div class="mt-clock hidden">${ICON.watch}<b>30</b></div>
      <div class="mt-card right"><div class="mt-rack"></div><div class="pf"><img alt=""><svg class="ring" viewBox="0 0 50 50"><circle class="arc" cx="25" cy="25" r="22" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg><i class="on"></i></div></div>
      <button class="mt-exit" aria-label="Leave match">${ICON.door}</button>
    </div>
    <div class="mt-move hidden">${ICON.grab}<span>MOVE 10s</span></div>
    <div class="mt-banner hidden"><div class="row"><span class="ic"></span><span class="tt hud-outline"></span></div><div class="sub hud-outline"></div></div>
    <div class="mt-streak hidden"><span class="burst"></span><span class="txt">STREAK x1</span></div>
    <div class="mt-tut hud-outline hidden"></div>
    <button class="mt-skip hud-outline hidden">Skip tutorial</button>
    <div class="mt-pocket hidden"></div>
    <div class="mt-calls">${POCKETS.map((_, i) => `<button class="mt-call hidden" data-pk="${i}" aria-label="Call pocket ${i + 1}"><span>8</span></button>`).join('')}</div>
    <div class="mt-callhint hud-outline hidden">${COARSE ? 'TAP' : 'CLICK'} A POCKET TO CALL THE 8</div>
    <div class="mt-movelbl hud-outline hidden">MOVE</div>
    <div class="mt-hint-ball hidden"><div class="hand">${ICON.hand}</div></div>
    <div class="mt-hint-drag hidden"><div class="hand">${ICON.hand}</div></div>
    <div class="mt-hint-scroll hidden"><div class="mouse">${COARSE ? ICON.pinch : ICON.mouse}</div><div class="arrows">${COARSE ? '' : ICON.scroll}</div></div>
    <div class="mt-power" data-silent>
      <div class="lbl hud-outline">PULL</div>
      <div class="well"><div class="fill"></div><div class="cue"></div></div>
      <div class="hand">${ICON.hand}</div>
    </div>
    <div class="mt-spin-wrap">
      <button class="mt-spin" aria-label="Spin"><i class="dot"></i></button>
      <button class="mt-fine" aria-label="Fine aim">${ICON.fine}</button>
    </div>
    <div class="mt-invalid hidden">${ICON.x}<span class="hud-outline">INVALID FIRST TARGET</span></div>
    <div class="mt-bip hidden">${ICON.grab}<span class="hud-outline">Drag the cue ball anywhere</span></div>
    <div class="mt-ability">
      <div class="mt-activate hidden"><span>${COARSE ? 'TAP' : 'PRESS'}</span>${COARSE ? '' : '<kbd>G</kbd>'}<span>${COARSE ? 'THE BUTTON' : 'TO ACTIVATE'}</span><div class="hand">${ICON.hand}</div></div>
      <div class="mt-gain hud-outline"></div>
      <div class="ball"><span>8</span></div>
      <div class="lbl hud-outline">ABILITY</div>
      <div class="bar"><div class="fill"></div><b class="hud-outline">0%</b></div>
      <button class="fire" aria-label="Use ability">${ICON.flame}<i>i</i></button>
    </div>
    <div class="mt-armed hidden"><span class="ic">${ICON.flame}</span><span class="hud-outline tx">FIRE SHOT: NEXT SHOT</span></div>
    <div class="mt-info hidden"><h3><span class="ic">${ICON.flame}</span><span class="hud-outline nm">FIRE SHOT</span></h3><p class="d"></p><p class="how">Fill the bar by potting your own balls. At 100% press G or tap the ability button. Spin for new abilities in the hub!</p></div>
    <div class="mt-flash"></div>
    <div class="mt-spinpanel hidden"><div class="box">
      <div class="top"><div class="big"><i class="c1"></i><i class="c2"></i><i class="h"></i><i class="v"></i><i class="dot"></i></div>
      <div class="elev"><div class="track"><div class="knob"></div></div><b>4°</b></div></div>
      <div class="btns"><button class="center">Center</button><button class="done">Done</button></div>
    </div></div>
    <div class="mt-roulette hidden"><div class="box"><h2>WHO BREAKS?</h2><div class="face"><img alt=""></div><div class="nm hud-outline"></div></div></div>
    <div class="mt-confirm hidden"><div class="box"><h3>Leave the match?</h3><p>Leaving now counts as a forfeit.</p><div class="btns"><button class="stay">Stay</button><button class="leave">Leave</button></div></div></div>
    <div class="mt-result hidden"><div class="mt-res-card"><h2 class="hud-outline"></h2><div class="reward"></div><p></p><button class="mt-ad hidden"><span class="play">&#9654;</span><span class="tx"></span></button><button class="mt-continue">Continue</button></div></div>`
  document.body.appendChild(layer)
  const $ = (s) => layer.querySelector(s)
  const show = (el, on) => el.classList.toggle('hidden', !on)
  const els = {
    input: $('.mt-input'),
    cards: [$('.mt-card.left'), $('.mt-card.right')],
    clock: $('.mt-clock'),
    clockNum: $('.mt-clock b'),
    move: $('.mt-move'),
    moveTxt: $('.mt-move span'),
    banner: $('.mt-banner'),
    streak: $('.mt-streak'),
    tut: $('.mt-tut'),
    skip: $('.mt-skip'),
    pocket: $('.mt-pocket'),
    calls: [...layer.querySelectorAll('.mt-call')],
    callHint: $('.mt-callhint'),
    moveLbl: $('.mt-movelbl'),
    hintBall: $('.mt-hint-ball'),
    hintDrag: $('.mt-hint-drag'),
    hintScroll: $('.mt-hint-scroll'),
    power: $('.mt-power'),
    powerLbl: $('.mt-power .lbl'),
    powerFill: $('.mt-power .fill'),
    powerCue: $('.mt-power .cue'),
    spinBtn: $('.mt-spin'),
    spinDot: $('.mt-spin .dot'),
    fineBtn: $('.mt-fine'),
    invalid: $('.mt-invalid'),
    bip: $('.mt-bip'),
    ability: $('.mt-ability'),
    abFill: $('.mt-ability .fill'),
    abTxt: $('.mt-ability .bar b'),
    abGain: $('.mt-gain'),
    activate: $('.mt-activate'),
    armed: $('.mt-armed'),
    info: $('.mt-info'),
    fireBtn: $('.mt-ability .fire'),
    flash: $('.mt-flash'),
    spinPanel: $('.mt-spinpanel'),
    bigBall: $('.mt-spinpanel .big'),
    bigDot: $('.mt-spinpanel .big .dot'),
    elevTrack: $('.mt-spinpanel .track'),
    elevKnob: $('.mt-spinpanel .knob'),
    elevTxt: $('.mt-spinpanel .elev b'),
    roulette: $('.mt-roulette'),
    rouletteImg: $('.mt-roulette img'),
    rouletteName: $('.mt-roulette .nm'),
    confirm: $('.mt-confirm'),
    result: $('.mt-result'),
  }

  // --- banners / streak / tutorial line ---
  let bannerTimer = 0
  let bannerSticky = false
  function banner(kind, title, sub = '', secs = 2.2) {
    const b = els.banner
    b.className = `mt-banner ${kind}`
    const icon = kind === 'foul' ? ICON.cueball : kind === 'wait' ? ICON.glass : kind === 'group' ? `<span class="gball" style="--c:${ballColor(groups[myTeam] === 'stripes' ? 9 : 1)}">${groups[myTeam] === 'stripes' ? 9 : 1}</span>` : ''
    b.querySelector('.ic').innerHTML = icon
    b.querySelector('.tt').textContent = title
    b.querySelector('.sub').textContent = sub
    void b.offsetWidth
    b.classList.add('show')
    bannerTimer = secs
    bannerSticky = secs <= 0
  }
  const hideBanner = () => {
    els.banner.className = 'mt-banner hidden'
    bannerTimer = 0
    bannerSticky = false
  }
  let streakTimer = 0
  function showStreak(n) {
    const s = els.streak
    s.querySelector('.txt').textContent = `STREAK x${n}`
    s.className = 'mt-streak'
    void s.offsetWidth
    s.classList.add('pop')
    streakTimer = 3
  }
  let tutText = ''
  function setTut(text) {
    if (text === tutText) return
    tutText = text
    show(els.tut, !!text)
    if (text) {
      els.tut.textContent = text
      els.tut.classList.remove('pop')
      void els.tut.offsetWidth
      els.tut.classList.add('pop')
    }
  }

  // --- input: aim drag, ball in hand, zoom (wheel + pinch) ---
  const ray = new Raycaster()
  const ndc = new Vector2()
  const plane = new Plane(new Vector3(0, 1, 0), -BALL_Y)
  const hit = new Vector3()
  const proj = new Vector3()
  function tablePoint(x, y) {
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    if (!ray.ray.intersectPlane(plane, hit)) return null
    return { x: hit.x - t.x, z: hit.z - t.z }
  }
  function screenOf(wx, wy, wz) {
    proj.set(wx, wy, wz).project(camera)
    if (proj.z > 1) return null
    return [(proj.x * 0.5 + 0.5) * window.innerWidth, (-proj.y * 0.5 + 0.5) * window.innerHeight]
  }
  const pointers = new Map()
  let drag = null // 'aim' | 'ball'
  const grabOff = { x: 0, z: 0 }
  let pinchD = 0
  const myShot = () => phase === 'aim'
  // Grab zone: a finger-sized circle round the ball on screen, at least ~2.5 ball radii when it looks big.
  function nearCueBall(x, y) {
    const c = sim.balls[0]
    const s = screenOf(t.x + c.x, BALL_Y, t.z + c.z)
    if (!s) return false
    const e = screenOf(t.x + c.x, BALL_Y + R, t.z + c.z)
    const rPx = e ? Math.hypot(e[0] - s[0], e[1] - s[1]) : 0
    const p = tablePoint(x, y)
    return Math.hypot(s[0] - x, s[1] - y) < Math.max(COARSE ? 72 : 56, rPx * 2.6) || (p && Math.hypot(p.x - c.x, p.z - c.z) < R * 3.2)
  }
  els.input.addEventListener('pointerdown', (e) => {
    if (!M.active || !myShot()) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    els.input.setPointerCapture(e.pointerId)
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      pinchD = Math.hypot(a.x - b.x, a.y - b.y)
      drag = null
      return
    }
    if (ballInHand && moveTimer > 0 && nearCueBall(e.clientX, e.clientY)) {
      drag = 'ball'
      grabbed = true
      els.input.style.cursor = 'grabbing'
      // keep the grab offset (the zone is wider than the ball), so a near miss doesn't make it jump
      const p = tablePoint(e.clientX, e.clientY)
      const c = sim.balls[0]
      grabOff.x = p ? c.x - p.x : 0
      grabOff.z = p ? c.z - p.z : 0
    } else drag = 'aim'
  })
  els.input.addEventListener('pointermove', (e) => {
    if (!M.active) return
    const prev = pointers.get(e.pointerId)
    if (!prev) {
      if (myShot() && ballInHand && moveTimer > 0 && e.pointerType === 'mouse') els.input.style.cursor = nearCueBall(e.clientX, e.clientY) ? 'grab' : ''
      return
    }
    const dx = e.clientX - prev.x
    prev.x = e.clientX
    prev.y = e.clientY
    if (!myShot()) return
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinchD > 0) zoomTarget = clamp(zoomTarget - (d - pinchD) / 260, 0, 1)
      pinchD = d
      return
    }
    if (drag === 'ball') {
      const p = tablePoint(e.clientX, e.clientY)
      if (p) placeInHand(p.x + grabOff.x, p.z + grabOff.z)
    } else if (drag === 'aim' && !charging) {
      const sens = (fine ? 0.0007 : 0.0038) * (0.45 + zoom * 0.75)
      aim += dx * sens
      if (tut?.step === 'drag') tut.drag += Math.abs(dx)
    }
  })
  const endPointer = (e) => {
    pointers.delete(e.pointerId)
    if (drag === 'ball') {
      sfx.placeBall()
      if (tut?.step === 'move' && tut.moved > 0.25) tutGo('shoot')
    }
    if (pointers.size < 2) pinchD = 0
    drag = null
    els.input.style.cursor = ''
  }
  els.input.addEventListener('pointerup', endPointer)
  els.input.addEventListener('pointercancel', endPointer)
  els.input.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      if (!myShot()) return
      const k = e.deltaMode === 1 ? 0.06 : e.deltaMode === 2 ? 0.5 : 0.0016
      zoomTarget = clamp(zoomTarget + e.deltaY * k, 0, 1)
    },
    { passive: false },
  )
  function placeInHand(x, z) {
    // behind the head string (the line through the head spot) on the break / after a break scratch
    x = clamp(x, -BED.hx + R, kitchen ? HEAD_SPOT.x : BED.hx - R)
    z = clamp(z, -BED.hz + R, BED.hz - R)
    for (const b of sim.balls) if (b.on && b.n !== 0 && Math.hypot(b.x - x, b.z - z) < R * 2.05) return
    const c = sim.balls[0]
    if (tut) tut.moved = (tut.moved ?? 0) + Math.hypot(x - c.x, z - c.z)
    sim.placeCue(x, z)
    t.dirty = true
  }

  // --- calling the 8 ball's pocket: a marker on each pocket, tap one to call it ---
  for (const b of els.calls) {
    b.addEventListener('pointerdown', (e) => e.stopPropagation())
    b.addEventListener('click', () => {
      if (!myShot() || !cleared(turn)) return
      const k = Number(b.dataset.pk)
      if (k !== callPocket) sfx.placeBall()
      callPocket = k
      callPicked = true
    })
  }

  // --- power bar ---
  let powerStart = 0
  els.power.addEventListener('pointerdown', (e) => {
    if (!myShot() || !powerAllowed()) return
    charging = true
    powerStart = e.clientY
    els.power.setPointerCapture(e.pointerId)
    e.preventDefault()
  })
  els.power.addEventListener('pointermove', (e) => {
    if (!charging) return
    const well = els.power.querySelector('.well')
    power = clamp((e.clientY - powerStart) / (well.clientHeight * 0.85), 0, 1)
  })
  els.power.addEventListener('pointerup', () => release())
  els.power.addEventListener('pointercancel', () => {
    charging = false
    power = 0
  })
  function release() {
    if (!charging && !spaceCharge) return
    charging = false
    spaceCharge = false
    if (!myShot()) return (power = 0)
    if (tut?.step === 'break' && power < 0.9) {
      power = 0
      setTut('')
      tutText = ''
      setTut('Pull the power bar all the way down!')
      return
    }
    if (power > 0.03) takeShot()
    else power = 0
  }
  const powerAllowed = () => !tut || tut.step === 'break' || tut.step === 'shoot'

  // --- spin widget + panel ---
  els.spinBtn.addEventListener('click', () => {
    if (!M.active) return
    show(els.spinPanel, true)
    renderSpin()
  })
  els.fineBtn.addEventListener('click', () => {
    fine = !fine
    els.fineBtn.classList.toggle('on', fine)
    sfx.toggle(fine)
  })
  let spinDrag = false
  const setSpinFrom = (e) => {
    const r = els.bigBall.getBoundingClientRect()
    let x = ((e.clientX - r.left) / r.width) * 2 - 1
    let y = -(((e.clientY - r.top) / r.height) * 2 - 1)
    const l = Math.hypot(x, y)
    if (l > 0.78) {
      x *= 0.78 / l
      y *= 0.78 / l
    }
    spin.x = x / 0.78
    spin.y = y / 0.78
    renderSpin()
  }
  els.bigBall.addEventListener('pointerdown', (e) => {
    spinDrag = true
    els.bigBall.setPointerCapture(e.pointerId)
    setSpinFrom(e)
  })
  els.bigBall.addEventListener('pointermove', (e) => spinDrag && setSpinFrom(e))
  els.bigBall.addEventListener('pointerup', () => {
    if (spinDrag) sfx.spinSet()
    spinDrag = false
  })
  let elevDrag = false
  const setElevFrom = (e) => {
    const r = els.elevTrack.getBoundingClientRect()
    elev = clamp(1 - (e.clientY - r.top) / r.height, 0, 1)
    renderSpin()
  }
  els.elevTrack.addEventListener('pointerdown', (e) => {
    elevDrag = true
    els.elevTrack.setPointerCapture(e.pointerId)
    setElevFrom(e)
  })
  els.elevTrack.addEventListener('pointermove', (e) => elevDrag && setElevFrom(e))
  els.elevTrack.addEventListener('pointerup', () => (elevDrag = false))
  $('.mt-spinpanel .center').addEventListener('click', () => {
    spin.x = spin.y = 0
    elev = 0
    renderSpin()
  })
  $('.mt-spinpanel .done').addEventListener('click', () => show(els.spinPanel, false))
  els.spinPanel.addEventListener('pointerdown', (e) => {
    if (e.target === els.spinPanel) show(els.spinPanel, false)
  })
  function renderSpin() {
    const px = 50 + spin.x * 34
    const py = 50 - spin.y * 34
    els.spinDot.style.left = `${px}%`
    els.spinDot.style.top = `${py}%`
    els.bigDot.style.left = `${50 + spin.x * 39}%`
    els.bigDot.style.top = `${50 - spin.y * 39}%`
    els.elevKnob.style.height = `${elev * 100}%`
    els.elevTxt.textContent = `${Math.round(4 + elev * 34)}°`
  }

  // --- ability ---
  $('.mt-ability .fire').addEventListener('click', (e) => {
    if (e.target.closest('i')) return toggleInfo()
    if (ability >= 100) activateAbility()
    else toggleInfo()
  })
  const toggleInfo = () => show(els.info, els.info.classList.contains('hidden'))
  els.info.addEventListener('click', () => show(els.info, false))
  function activateAbility() {
    if (!M.active || !myShot() || ability < 100 || armed || tut || !abKind) return
    if (play.isInstant(abKind) && play.distract) return
    ability = 0
    save.ability = 0
    save.abilityHintDone = true
    persist()
    play.arm(abKind)
    if (!play.isInstant(abKind)) armed = abKind
    if (abKind === 'fireShot') sfx.fireArm()
    renderAbility()
  }
  // The equipped ability's button icon, info card and armed pill (set at match start).
  function renderAbilityKind() {
    const a = ABILITY_BY_ID[abKind]
    if (!a) return
    els.fireBtn.innerHTML = `${abilityIcon(abKind)}<i>i</i>`
    els.fireBtn.setAttribute('aria-label', `Use ${a.name}`)
    els.info.querySelector('.ic').innerHTML = abilityIcon(abKind)
    els.info.querySelector('.nm').textContent = a.name.toUpperCase()
    els.info.querySelector('h3').style.color = RARITY[a.rarity].color
    els.info.querySelector('.d').textContent = a.desc
    els.armed.querySelector('.ic').innerHTML = abilityIcon(abKind)
    els.armed.style.setProperty('--ab', a.color)
  }
  function flashScreen(color) {
    els.flash.style.background = color
    els.flash.classList.remove('go')
    void els.flash.offsetWidth
    els.flash.classList.add('go')
  }
  function gainAbility(n) {
    if (armed) return
    const was = ability
    ability = clamp(ability + n, 0, 100)
    save.ability = ability
    persist()
    els.abGain.textContent = `+${n}`
    els.abGain.classList.remove('go')
    void els.abGain.offsetWidth
    els.abGain.classList.add('go')
    if (was < 100 && ability >= 100) setTimeout(() => sfx.abilityReady(), 350)
    else sfx.abilityGain()
    renderAbility()
  }
  function renderAbility() {
    const ready = ability >= 100
    els.ability.classList.toggle('ready', ready)
    const distracted = abKind === 'lookOverThere' && play.distract
    show(els.ability, !armed && !distracted && !!abKind)
    show(els.armed, !!armed || distracted)
    if (armed || distracted) els.armed.querySelector('.tx').textContent = distracted ? "OPPONENT'S NEXT SHOT: DISTRACTED" : `${ABILITY_BY_ID[armed].name.toUpperCase()}: NEXT SHOT`
    els.abFill.style.width = `${ability}%`
    els.abTxt.textContent = ready ? 'READY! 100%' : `${Math.round(ability)}%`
    show(els.activate, ready && !armed && phase === 'aim' && !tut)
  }

  // --- buttons ---
  $('.mt-exit').addEventListener('click', () => {
    if (phase !== 'over' && M.active) show(els.confirm, true)
  })
  $('.mt-confirm .stay').addEventListener('click', () => show(els.confirm, false))
  $('.mt-confirm .leave').addEventListener('click', () => {
    show(els.confirm, false)
    if (phase !== 'over' && M.active) {
      forfeit()
      finish(1 - myTeam, 'You left the match', true)
    }
  })
  els.skip.addEventListener('click', () => {
    if (!tut) return
    endTutorial()
    sfx.toggle(false)
  })
  $('.mt-result .mt-continue').addEventListener('click', exit)
  // Rewarded ad on the result card: watch one to double the match cash (Boxity runs the ad; the game
  // server checks its single-use token, backend adReward). Cash only, never premium currency.
  onServer('adRewardResult', () => {})
  const adBtn = $('.mt-ad')
  let adCash = 0
  let adBusy = false
  const adLabel = (text) => (adBtn.querySelector('.tx').textContent = text)
  adBtn.addEventListener('click', async () => {
    if (adBusy || !adCash) return
    adBusy = true
    adBtn.disabled = true
    const r = await showRewarded('double-cash')
    if (r.status === 'completed') {
      const v = await request('adReward', { rewardToken: r.rewardToken }, 'adRewardResult')
      if (v.ok || v.reason === 'offline') {
        addCash(adCash)
        sfx.cash(3)
        $('.mt-res-card .reward').textContent = `+$${adCash * 2}`
        show(adBtn, false)
        adCash = 0
      } else adLabel('Ad reward unavailable')
    } else {
      adLabel(r.status === 'skipped' ? 'Watch it all to double!' : 'No ad right now, try later')
      adBtn.disabled = false
    }
    adBusy = false
  })
  window.addEventListener('keydown', (e) => {
    if (!M.active || e.target instanceof HTMLInputElement) return
    if (e.code === 'Space' && !e.repeat && myShot() && powerAllowed()) {
      spaceCharge = true
      chargeT = 0
    }
    if (e.code === 'KeyA' || e.code === 'ArrowLeft') fineDir = -1
    if (e.code === 'KeyD' || e.code === 'ArrowRight') fineDir = 1
    if (e.code === 'KeyW' || e.code === 'ArrowUp') zoomTarget = clamp(zoomTarget - 0.15, 0, 1)
    if (e.code === 'KeyS' || e.code === 'ArrowDown') zoomTarget = clamp(zoomTarget + 0.15, 0, 1)
    if (e.code === 'KeyG' && !e.repeat) activateAbility()
  })
  window.addEventListener('keyup', (e) => {
    if (!M.active) return
    if (e.code === 'Space' && spaceCharge) release()
    if (['KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight'].includes(e.code)) fineDir = 0
  })

  // --- tutorial ---
  const TUT = {
    break: 'Pull the power bar all the way down!',
    drag: 'Drag to adjust your aim!',
    zoomOut: COARSE ? 'Pinch to zoom out and see the angle better!' : 'Scroll to zoom out and see the angle better!',
    zoomIn: COARSE ? 'Now pinch to zoom all the way in!' : 'Now scroll to zoom all the way in!',
    anytime: 'You can zoom in and out any time.',
    move: 'Ball in hand! Drag the cue ball anywhere!',
    shoot: 'Now pull the power bar to shoot!',
  }
  function tutGo(step) {
    if (!tut) return
    if (tut.step && tut.step !== step) sfx.stepDone()
    tut.step = step
    tut.t = 0
    tut.drag = 0
    if (step === 'move') tut.moved = 0
    setTut(TUT[step] ?? '')
    sfx.tutStep()
  }
  function endTutorial() {
    tut = null
    matchTutorial = false
    setTut('')
    save.tutorialDone = true
    persist()
    show(els.skip, false)
  }
  function updateTutorial(dt) {
    if (!tut) {
      show(els.hintDrag, false)
      show(els.hintScroll, false)
      els.power.classList.remove('tutor')
      return
    }
    tut.t += dt
    const s = tut.step
    const mine = phase === 'aim'
    show(els.hintDrag, mine && s === 'drag')
    show(els.hintScroll, mine && (s === 'zoomOut' || s === 'zoomIn'))
    els.hintScroll.classList.toggle('up', s === 'zoomIn')
    els.power.classList.toggle('tutor', mine && (s === 'break' || s === 'shoot'))
    els.power.classList.toggle('full', s === 'break')
    if (!mine) return
    if (s === 'drag' && tut.drag > 160 && tut.t > 0.8) tutGo('zoomOut')
    else if (s === 'zoomOut' && zoom > 0.93) tutGo('zoomIn')
    else if (s === 'zoomIn' && zoom < 0.06) tutGo('anytime')
    else if (s === 'anytime' && tut.t > 2.2) tutGo(ballInHand ? 'move' : 'shoot')
  }

  // --- turns ---
  const stand = new Map() // sessionId -> placeholder for a player whose roster entry is gone
  const who = (sid) => (sid === mySid() ? me : entityOf(sid) ?? stand.get(sid) ?? stand.set(sid, { id: sid, name: 'Player' }).get(sid))
  const teamMembers = (team) => (teams[team] ?? []).map(who)
  const shooter = () => (shooterSid ? who(shooterSid) : null)
  const myTurn = () => shooterSid === mySid()
  const cleared = (team) => groups[team] && sim.balls.every((b) => !b.on || groupOf(b.n) !== groups[team])
  const legalFor = (team) => (n) => {
    const g = groups[team]
    if (!g) return n !== 8
    return cleared(team) ? n === 8 : groupOf(n) === g
  }
  const nearestPocket = (b) => {
    let best = 0
    POCKETS.forEach(([px, pz], i) => {
      if (Math.hypot(px - b.x, pz - b.z) < Math.hypot(POCKETS[best][0] - b.x, POCKETS[best][1] - b.z)) best = i
    })
    return best
  }
  function beginTurn() {
    clock = tut ? MATCH.tutorClock : MATCH.shotClock
    lastClockTick = 0
    power = 0
    const s = shooter()
    if (ballInHand) moveTimer = 10
    grabbed = false
    aimKey = ''
    callPocket = -1
    callPicked = false
    renderCards()
    if (myTurn()) {
      phase = 'aim'
      setView('aim')
      if (!breakShot) {
        const shot = pickShot(sim, legalFor(turn), 1)
        aim = shot.angle
        // on the 8: the suggested shot's pocket is the call until I tap another one
        if (cleared(turn)) callPocket = shot.pocket >= 0 ? shot.pocket : nearestPocket(sim.balls[8])
      } else aim = 0
      zoomTarget = breakShot ? 0.15 : zoomTarget
      if (distracted) banner('foul', 'DISTRACTED!', 'Look Over There! Your shot goes wild', 2)
      else if (!tut) banner('turn', 'YOUR TURN', ballInHand ? 'Ball in hand' : '', 1.4)
      else hideBanner()
      sfx.yourTurn()
      if (tut && breakShot && tut.step === 'pending') tutGo('break')
      if (tut && !breakShot && tut.step === 'pending') tutGo('drag')
      standAtWaitSpot(false)
    } else {
      phase = 'remote'
      setView('hub')
      remoteAb = ''
      shotByMe = false
      banner('wait', turn === myTeam ? "TEAMMATE'S TURN" : "OPPONENT'S TURN", s?.name ?? '', 0)
      sfx.opponentTurn()
      standAtWaitSpot(true)
      syncYawToPlayer()
    }
    renderAbility()
  }
  // Where I wait while the others shoot: on my side of the table, facing it.
  function standAtWaitSpot(snap) {
    const side = myTeam ? -1 : 1
    const idx = Math.max(0, teams[myTeam]?.indexOf(mySid()) ?? 0) // teammates stand side by side
    const x = t.x + (myTeam ? 1 : -1) * (1.4 - idx * 1.3)
    const z = t.z + side * (TABLE.width / 2 + 0.75)
    const facing = side > 0 ? Math.PI : 0
    if (snap || Math.hypot(player.position.x - x, player.position.z - z) > 0.05) resetPlayer({ x, y: 0.05, z }, facing)
    player.facing = facing
  }
  function takeShot() {
    let speed = MATCH.minSpeed + power * (MATCH.maxSpeed - MATCH.minSpeed)
    shotAb = armed
    const ab = play.shoot(shotAb, speed)
    speed = ab.speed
    let angle = aim
    if (distracted) {
      // Look Over There!: the shot goes wild
      distracted = false
      angle += rnd(0.18, 0.55) * (Math.random() < 0.5 ? -1 : 1)
      speed *= rnd(0.45, 1.15)
      hud.popup('HUH?!', new Vector3(t.x + sim.balls[0].x, TABLE_BED_Y + 0.45, t.z + sim.balls[0].z), '#ffb02e', 1.1)
    }
    pending = { angle, speed, t: 0, fromPower: power, mods: ab.mods }
    // the rules judge the shot by the table as it was before it (is the team on the 8, the call)
    shotPre = { onEight: !breakShot && !!cleared(turn), kitchen, bih: ballInHand, call: callPocket }
    const c = sim.balls[0]
    sendServer('mShot', { seq, a: angle, s: speed, sx: spin.x, sy: spin.y, el: elev, ab: shotAb, x: c.x, z: c.z })
    lastTickPower = 0
    show(els.spinPanel, false)
    t.aim = { angle, speed, t: 0.7, shooter: me }
    phase = 'strike'
    shotByMe = true
    if (tut) {
      if (tut.step === 'break') {
        tut.step = 'pending'
        setTut('')
        sfx.stepDone()
      } else if (tut.step === 'shoot') {
        sfx.stepDone()
        endTutorial()
      }
    }
  }
  function stanceFor(angle) {
    const c = sim.balls[0]
    const dx = -Math.cos(angle)
    const dz = -Math.sin(angle)
    const ex = (TABLE.length / 2 + 0.55 - Math.sign(dx) * c.x) / Math.max(1e-3, Math.abs(dx))
    const ez = (TABLE.width / 2 + 0.55 - Math.sign(dz) * c.z) / Math.max(1e-3, Math.abs(dz))
    const k = Math.min(ex, ez)
    return { x: t.x + c.x + dx * k, z: t.z + c.z + dz * k, facing: Math.atan2(-dx, -dz) }
  }

  // My shot settled: the rules decide the outcome, the server passes it on (mEnd -> mTurn).
  function resolve() {
    const pre = shotPre ?? { onEight: false, kitchen: false, bih: false, call: -1 }
    shotPre = null
    const sunk = sim.sunkThisShot
    const potted = sunk.filter((n) => n !== 0) // object balls (the 8 too)
    const scratch = !sim.balls[0].on
    const first = sim.firstHit
    const g = groups[turn]
    // a legal break pots a ball or drives at least 4 object balls to a cushion
    const badBreak = breakShot && !potted.length && sim.railBalls.size < 4
    let foul = scratch || first < 0
    let why = scratch ? 'Scratched the white ball' : first < 0 ? 'No ball was hit' : ''
    if (!foul && g && (pre.onEight ? first !== 8 : first === 8 || groupOf(first) !== g)) {
      foul = true
      why = pre.onEight ? 'You must hit the 8 ball first' : 'Hit the wrong ball first'
    }
    if (!foul && !g && first === 8 && !breakShot) {
      foul = true
      why = 'Hit the 8 ball first'
    }
    // after the first contact a ball must be potted or some ball must touch a cushion
    if (!foul && !breakShot && !potted.length && !sim.railAfter) {
      foul = true
      why = 'No ball hit a cushion after contact'
    }
    const ball8 = sim.balls[8]
    const won8 = sunk.includes(8) && !breakShot && !foul && pre.onEight && ball8.pocket === pre.call
    // Rewind: my shot that fouls, loses on the 8 or pots nothing of mine goes back
    if (shotAb === 'rewind') {
      const ownPot = sunk.some((n) => n !== 0 && n !== 8 && (!g || groupOf(n) === g))
      if (!won8 && play.rewind(foul || badBreak || sunk.includes(8) || !ownPot)) {
        shotAb = ''
        play.endShot()
        t.dirty = true
        return sendEnd({ turn, bih: pre.bih, note: 'rewind' })
      }
    }
    const timeStop = play.keepsTurn()
    shotAb = ''
    play.endShot()
    t.dirty = true
    // an illegal break: re-racked, the other team breaks (ball in hand behind the head string)
    if (badBreak) {
      sim.rack(Math.random())
      return sendEnd({ turn: 1 - turn, bih: true, note: 'rerack', foul: 'Illegal break: 4 balls must reach a cushion. Re-racked' })
    }
    if (scratch) sim.placeCue(HEAD_SPOT.x, HEAD_SPOT.z)
    if (sunk.includes(8)) {
      if (breakShot) {
        // the 8 on the break is spotted again
        Object.assign(ball8, { on: true, x: FOOT_SPOT.x, z: FOOT_SPOT.z, vx: 0, vz: 0, pocket: -1 })
      } else {
        const lost = scratch ? 'Scratched on the 8 ball' : !pre.onEight ? 'The 8 ball went down early' : foul ? `Foul on the 8 ball: ${why}` : 'The 8 ball went in the wrong pocket'
        return sendEnd({ turn, winner: won8 ? turn : 1 - turn, why: won8 ? 'Sank the 8 ball!' : lost })
      }
    }
    const own = sunk.filter((n) => n !== 0 && n !== 8)
    const next = [...groups]
    let note = ''
    if (!g && !foul && !breakShot && own.length) {
      // open table: a shot that pots one group takes it; potting both, the first ball hit decides if it went down
      const both = own.some((n) => n < 8) && own.some((n) => n > 8)
      next[turn] = groupOf(both && own.includes(first) ? first : own[0])
      next[1 - turn] = other(next[turn])
      note = 'group'
    }
    const potOwn = own.some((n) => !next[turn] || groupOf(n) === next[turn])
    // a scratch on the break: ball in hand behind the head string
    if (foul) return sendEnd({ turn: 1 - turn, groups: next, bih: true, foul: why, note: breakShot && scratch ? 'kitchen' : '' })
    // potting any ball on a legal break (the spotted 8 too) keeps the breaker at the table
    if ((own.length && potOwn) || (breakShot && potted.length)) return sendEnd({ turn, groups: next, note })
    if (timeStop) return sendEnd({ turn, groups: next, note: note || 'timeStop' })
    sendEnd({ turn: 1 - turn, groups: next, note })
  }
  // The outcome of my turn to the server; every client (me too) moves on when its mTurn comes back.
  function sendEnd(o) {
    phase = 'wait'
    t.cue.visible = false
    hideGuide()
    const passes = o.turn !== turn
    sendServer('mEnd', {
      seq,
      balls: packBalls(sim),
      turn: o.turn,
      groups: (o.groups ?? groups).map((x) => x ?? ''),
      bih: !!o.bih,
      foul: o.foul ?? '',
      note: o.note ?? '',
      winner: o.winner ?? -1,
      why: o.why ?? '',
      distract: passes && !!play.distract,
    })
  }
  // The server's mTurn: the settled balls, the next shooter, and what happened.
  function applyTurn(msg) {
    if (msg.matchId !== matchId || !(msg.seq > seq)) return
    seq = msg.seq
    if (Array.isArray(msg.teams)) teams = msg.teams
    applyBalls(sim, msg.balls)
    t.dirty = true
    pending = null
    t.aim = null
    remoteAb = ''
    sfx.setRoll(0)
    layer.classList.remove('ab-timestop')
    const was = turn
    if (Array.isArray(msg.groups)) groups = msg.groups.map((x) => x || null)
    if (msg.winner === 0 || msg.winner === 1) return finish(msg.winner, msg.why || (msg.winner === myTeam ? 'You won!' : 'You lost'))
    // a re-rack is a new break; a rewind takes the same shot again
    if (msg.note !== 'rewind' && msg.note !== 'rerack') breakShot = false
    turn = msg.turn
    shooterSid = msg.shooter
    ballInHand = !!msg.bih
    if (msg.note !== 'rewind') kitchen = ballInHand && (msg.note === 'kitchen' || msg.note === 'rerack')
    if (was === myTeam && turn !== myTeam) streakCount = 0
    if (msg.distract) {
      if (turn === myTeam) distracted = true
      else oppDistracted = true
    }
    renderCards()
    if (msg.foul) {
      t.cue.visible = false
      hideGuide()
      banner('foul', msg.note === 'rerack' ? 'ILLEGAL BREAK!' : 'FOUL!', msg.foul, 2.4)
      sfx.foul()
      phase = 'pause'
      aiTimer = 1.4
      return
    }
    beginTurn()
    if (msg.note === 'group') {
      banner('group', `YOU ARE ${groups[myTeam].toUpperCase()}`, '', 2.2)
      sfx.groupAssigned()
    } else if (msg.note === 'rewind') banner('turn', 'REWIND!', myTurn() ? 'Take that shot again' : 'They take that shot again', 1.6)
    else if (msg.note === 'timeStop') banner('turn', 'TIME STOP!', myTurn() ? 'Still your turn' : 'They shoot again', 1.6)
  }
  // Another player's shot left the cue (tablenet.js draws it).
  function remoteShot(msg) {
    if (phase !== 'remote') return
    hideBanner()
    phase = 'remoteRoll'
    setView('watch')
    remoteAb = ABILITY_BY_ID[msg.ab] ? msg.ab : ''
    if (remoteAb) banner('turn', `${ABILITY_BY_ID[remoteAb].name.toUpperCase()}!`, shooter()?.name ?? '', 1.4)
    if (oppDistracted && turn !== myTeam) {
      oppDistracted = false
      play.aiShot({ angle: 0, speed: 0 }) // HUH?! (clears my Look Over There!)
      renderAbility()
    }
  }
  M.showingResult = () => M.active && !els.result.classList.contains('hidden')
  M.shooting = () => M.active && (phase === 'aim' || phase === 'strike' || phase === 'rolling' || phase === 'wait')
  M.onNet = (type, msg) => {
    if (!M.active || phase === 'over' || phase === 'off') return
    if (type === 'mTurn') return applyTurn(msg)
    if (type === 'mTeams') {
      if (msg.matchId === matchId && Array.isArray(msg.teams)) teams = msg.teams
      return renderCards()
    }
    if (msg.seq !== seq) return
    if (type === 'mShot') remoteShot(msg)
    if (type === 'mAim' && !myTurn() && Number.isInteger(msg.k)) callPocket = msg.k // the shooter's call for the 8
  }

  function finish(winner, why, forfeit = false) {
    phase = 'over'
    armed = ''
    t.aim = null
    t.cue.visible = false
    hideGuide()
    hideBanner()
    setTut('')
    tut = null
    setView('watch')
    const won = winner === myTeam
    const reward = won ? ECONOMY.winReward * t.team : forfeit ? 0 : ECONOMY.lossReward
    $('.mt-res-card h2').textContent = won ? 'YOU WIN!' : 'YOU LOSE'
    $('.mt-res-card h2').style.color = won ? '#3dff8a' : '#ff6b6b'
    $('.mt-res-card .reward').textContent = reward ? `+$${reward}` : 'No reward'
    $('.mt-res-card p').textContent = why
    adCash = reward
    adBusy = false
    adBtn.disabled = false
    adLabel(`Watch an ad: 2x cash (+$${reward})`)
    show(adBtn, reward > 0 && rewardedAvailable())
    setTimeout(() => {
      show(els.result, true)
      adScreen('results') // Boxity's banners around the result card
    }, won ? 900 : 500)
    if (won) {
      sfx.win()
      hubFx?.burst(t.x, TABLE.height + 0.2, t.z, '#ffd23d')
    } else {
      sfx.lose()
      if (reward) setTimeout(() => sfx.cash(2), 500)
    }
    M.winner = winner
    for (const fn of endListeners) fn({ won, reward, tutorial: matchTutorial })
  }

  function exit() {
    show(els.result, false)
    document.body.classList.remove('in-match')
    setMoveLock(false)
    hideGuide()
    mfx.clear()
    mfx.clearScorch()
    play.clear()
    sfx.setRoll(0)
    restoreGhosts()
    const myGroup = getMyGroup?.()
    if (myGroup) myGroup.visible = true
    camera.near = saved.near
    camera.fov = saved.fov
    camera.updateProjectionMatrix()
    const table = t
    M.active = false
    M.table = null
    M.freeCam = false
    phase = 'off'
    room = null
    resetPlayer({ x: table.x + 3.2, y: 0.05, z: table.padZ + 2.6 }, Math.PI)
    syncYawToPlayer()
  }

  // msg = the server's matchStart { matchId, seq, seed, teams, turn, shooter }
  M.start = (table, msg) => {
    t = table
    sim = t.sim
    matchId = msg.matchId
    seq = msg.seq
    teams = msg.teams
    shooterSid = msg.shooter
    turn = msg.turn
    room = net.room
    distracted = oppDistracted = false
    remoteAb = ''
    shotByMe = false
    stand.clear()
    M.table = t
    M.active = true
    M.winner = null
    document.body.classList.add('in-match')
    setMoveLock(true)
    sim.rack(msg.seed)
    t.dirty = true
    myTeam = Math.max(0, teams.findIndex((m) => m.includes(mySid())))
    groups = [null, null]
    breakShot = true
    // the breaker places the cue ball behind the head string (not in the first-match tutorial)
    ballInHand = kitchen = !!save.tutorialDone
    callPocket = -1
    shotPre = null
    moveTimer = 0
    streakCount = 0
    armed = ''
    shotAb = ''
    abKind = equippedId()
    play.begin(t, abKind)
    renderAbilityKind()
    spin.x = spin.y = 0
    elev = 0
    fine = false
    els.fineBtn.classList.remove('on')
    renderSpin()
    zoom = zoomTarget = 0.3
    matchTutorial = !save.tutorialDone
    tut = matchTutorial ? { step: 'pending', t: 0, drag: 0 } : null
    show(els.skip, matchTutorial)
    camera.near = 0.03
    camera.updateProjectionMatrix()
    camGoal.p.copy(camera.position)
    camera.getWorldDirection(camLook)
    camLook.multiplyScalar(10).add(camera.position)
    camGoal.look.copy(camLook)
    view = 'hub'
    M.freeCam = true
    camRate = 3
    hideBanner()
    show(els.streak, false)
    standAtWaitSpot(true)
    syncYawToPlayer()
    // who breaks?
    const a = teamMembers(myTeam)[0] ?? me
    const b = teamMembers(1 - myTeam)[0] ?? a
    const winner = shooter() ?? a
    roulette = { faces: [a, b], winner, t: 0, next: 0, idx: 0, done: false }
    phase = 'roulette'
    show(els.roulette, true)
    els.roulette.classList.remove('picked')
    sfx.matchStart()
    renderCards()
    renderAbility()
  }
  function updateRoulette(dt) {
    const r = roulette
    r.t += dt
    if (!r.done) {
      if (r.t >= r.next) {
        // ticks slow down like a wheel settling
        const k = Math.min(1, r.t / 2.3)
        r.next = r.t + 0.06 + k * k * 0.32
        r.idx++
        let face = r.faces[r.idx % 2]
        if (k >= 1) {
          face = r.winner
          r.done = true
          r.doneAt = r.t
          els.roulette.classList.add('picked')
          sfx.breakerPicked()
        } else sfx.rouletteTick(k)
        setFace(els.rouletteImg, face)
        els.rouletteName.textContent = face === me ? 'You' : face.name
      }
    } else if (r.t - r.doneAt > 1.1) {
      show(els.roulette, false)
      roulette = null
      phase = 'intro'
      introTimer = 0.6
      if (!tut) banner('turn', myTurn() ? 'YOU BREAK!' : `${shooter()?.name ?? 'Opponent'} breaks`, '', 1.4)
    }
  }

  // --- top cards ---
  function renderCards() {
    if (!t) return
    for (const team of [0, 1]) {
      const card = els.cards[team === myTeam ? 0 : 1]
      const m = teamMembers(team)
      const face = (team === turn ? shooter() : m[0]) ?? m[0]
      if (face) setFace(card.querySelector('img'), face)
      card.classList.toggle('turn', team === turn && phase !== 'over' && phase !== 'roulette')
      const g = groups[team]
      const rack = card.querySelector('.mt-rack')
      if (!g) {
        rack.innerHTML = `<span class="open hud-outline">OPEN TABLE</span><span class="mini s1"></span><span class="mini s2"></span><span class="mini s3"></span>`
      } else {
        const nums = g === 'solids' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15]
        rack.innerHTML = nums.map((n) => (sim.balls[n].on ? `<span class="rb${n > 8 ? ' st' : ''}" style="--c:${ballColor(n)}"><i>${n}</i></span>` : `<span class="rb gone">${ICON.x}</span>`)).join('') + `<span class="rb eight${cleared(team) ? ' live' : ''}" style="--c:#141414"><i>8</i></span>`
      }
    }
  }

  // --- ghosting: avatars between the camera and the cue ball fade out ---
  const ghosted = new Map() // root -> current alpha
  function setGhost(root, alpha) {
    if (!root) return
    const cur = ghosted.get(root) ?? 1
    if (Math.abs(cur - alpha) < 0.01) return
    ghosted.set(root, alpha)
    root.traverse((o) => {
      if (!o.isMesh || !o.material) return
      if (!o.userData.ghostMat) {
        o.userData.ghostOrig = o.material
        o.userData.ghostMat = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone()
      }
      const mats = Array.isArray(o.userData.ghostMat) ? o.userData.ghostMat : [o.userData.ghostMat]
      if (alpha >= 0.99) {
        o.material = o.userData.ghostOrig
        return
      }
      for (const m of mats) {
        m.transparent = true
        m.opacity = alpha
        m.depthWrite = false
      }
      o.material = o.userData.ghostMat
    })
  }
  function restoreGhosts() {
    for (const root of ghosted.keys()) setGhost(root, 1)
    ghosted.clear()
  }
  const segP = new Vector3()
  function updateGhosts(dt) {
    const myGroup = getMyGroup?.()
    const close = view === 'aim' || view === 'watch'
    const cb = sim.balls[0]
    const bx = t.x + cb.x
    const bz = t.z + cb.z
    const want = (root, x, z) => {
      if (!root) return
      let a = 1
      if (close) {
        // distance from the camera->cue ball segment (on the floor plane)
        const ax = camera.position.x
        const az = camera.position.z
        const dx = bx - ax
        const dz = bz - az
        const l2 = dx * dx + dz * dz || 1
        const k = clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1)
        segP.set(ax + dx * k - x, 0, az + dz * k - z)
        const d = segP.length()
        a = d < 0.9 ? 0.25 : d < 1.6 ? 0.25 + ((d - 0.9) / 0.7) * 0.75 : 1
        if (view === 'watch' && camera.position.y > 3) a = Math.max(a, 0.5)
      }
      const cur = ghosted.get(root) ?? 1
      setGhost(root, cur + (a - cur) * Math.min(1, dt * 8))
    }
    for (const e of tables.all(t)) if (e !== me && e.group) want(e.group, e.x, e.z)
  }

  // --- aim guide ---
  function toCushion(x, z, dx, dz) {
    const sx = dx > 0 ? (BED.hx - R - x) / dx : dx < 0 ? (-BED.hx + R - x) / dx : Infinity
    const sz = dz > 0 ? (BED.hz - R - z) / dz : dz < 0 ? (-BED.hz + R - z) / dz : Infinity
    return { s: Math.max(0, Math.min(sx, sz)), xWall: sx < sz }
  }
  let aimTarget = null
  let aimPocket = -1
  function updateGuide() {
    const c = sim.balls[0]
    const dx = Math.cos(aim)
    const dz = Math.sin(aim)
    let best = Infinity
    let target = null
    const phases = armed === 'blackFlash' ? legalFor(turn) : null // Black Flash passes through the wrong balls
    for (const b of sim.balls) {
      if (!b.on || b.n === 0 || (phases && !phases(b.n))) continue
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
    const wall = toCushion(c.x, c.z, dx, dz)
    const hitBall = target && best < wall.s
    const travel = hitBall ? best : wall.s
    const gx = c.x + dx * travel
    const gz = c.z + dz * travel
    const fire = play.longGuide(armed)
    const col = armed ? ABILITY_BY_ID[armed].color : '#ffffff'
    lineMat.color.set(col)
    dashMat.color.set(col)
    ghost.material.color.set(col)
    // tube: two rails a ball wide + a dashed centre line
    const nx = -dz * R * 0.92
    const nz = dx * R * 0.92
    const ox = t.x
    const oz = t.z
    const sx = c.x + dx * R * 0.9
    const sz = c.z + dz * R * 0.9
    setStrip(tubeL, ox + sx + nx, oz + sz + nz, ox + gx + nx, oz + gz + nz)
    setStrip(tubeR, ox + sx - nx, oz + sz - nz, ox + gx - nx, oz + gz - nz)
    const len = setStrip(dash, ox + sx, oz + sz, ox + gx - dx * R, oz + gz - dz * R)
    dashMap.repeat.set(len / 0.07, 1)
    ghost.visible = true
    ghost.position.set(ox + gx, BALL_Y, oz + gz)
    aimTarget = hitBall ? target : null
    aimPocket = -1
    const legal = hitBall ? legalFor(turn)(target.n) : true
    xA.visible = xB.visible = false
    objLine.visible = cueLine.visible = bounce.visible = false
    if (hitBall && !legal) {
      const k = R * 0.6
      setStrip(xA, ox + gx - k, oz + gz - k, ox + gx + k, oz + gz + k, BALL_Y)
      setStrip(xB, ox + gx - k, oz + gz + k, ox + gx + k, oz + gz - k, BALL_Y)
    } else if (hitBall) {
      // object ball heads along the line of centres; the cue ball along the tangent (+ follow/draw)
      const ux = (target.x - gx) / (2 * R)
      const uz = (target.z - gz) / (2 * R)
      const cut = dx * ux + dz * uz // cos of the cut angle
      const objLen = fire ? toCushion(target.x, target.z, ux, uz).s : 0.25 + cut * 0.55
      setStrip(objLine, ox + target.x + ux * R, oz + target.z + uz * R, ox + target.x + ux * (R + objLen), oz + target.z + uz * (R + objLen))
      let tx = dx - ux * cut
      let tz = dz - uz * cut
      tx += dx * spin.y * 0.62 * cut
      tz += dz * spin.y * 0.62 * cut
      const tl = Math.hypot(tx, tz)
      if (tl > 0.02) {
        tx /= tl
        tz /= tl
        const cueLen = fire ? toCushion(gx, gz, tx, tz).s : clamp(tl * 0.5, 0.08, 0.45)
        setStrip(cueLine, ox + gx, oz + gz, ox + gx + tx * cueLen, oz + gz + tz * cueLen)
      }
      // the pocket the object ball is heading for
      let bestP = Infinity
      POCKETS.forEach(([px, pz, pr], i) => {
        const qx = px - target.x
        const qz = pz - target.z
        const along = qx * ux + qz * uz
        if (along <= 0) return
        const perp = Math.abs(qx * uz - qz * ux)
        if (perp < pr * 0.75 && along < bestP) {
          bestP = along
          aimPocket = i
        }
      })
    } else {
      // straight into a cushion: show the rebound
      const rx = wall.xWall ? -dx : dx
      const rz = wall.xWall ? dz : -dz
      const bl = fire ? toCushion(gx, gz, rx, rz).s : 0.35
      setStrip(bounce, ox + gx, oz + gz, ox + gx + rx * bl, oz + gz + rz * bl)
    }
    // outlines
    const legalFn = legalFor(turn)
    let k = 0
    for (const b of sim.balls) {
      if (!b.on || b.n === 0) continue
      const isTarget = b === aimTarget
      const ring = (groups[turn] && legalFn(b.n)) || isTarget
      if (!ring) continue
      const s = outlines[k++]
      s.visible = true
      s.material.map = isTarget && !legalFn(b.n) ? badRing : okRing
      s.position.set(ox + b.x, BALL_Y, oz + b.z)
    }
    for (; k < outlines.length; k++) outlines[k].visible = false
    show(els.invalid, hitBall && !legal)
    // ball in hand ring
    handRing.visible = ballInHand && moveTimer > 0
    handRing.position.set(ox + c.x, TABLE_BED_Y + 0.004, oz + c.z)
    if (handRing.visible && kitchen) setStrip(headLine, ox + HEAD_SPOT.x, oz - BED.hz, ox + HEAD_SPOT.x, oz + BED.hz)
    else headLine.visible = false
  }

  // Cue along the shot, its tip `gap` behind the cue ball, offset for spin, tilted by elevation.
  const up = new Vector3(0, 1, 0)
  const cdir = new Vector3()
  function placeMyCue(angle, gap) {
    const c = sim.balls[0]
    const tilt = 0.07 + elev * 0.6
    cdir.set(Math.cos(angle) * Math.cos(tilt), -Math.sin(tilt), Math.sin(angle) * Math.cos(tilt)).normalize()
    t.cue.quaternion.setFromUnitVectors(up, cdir)
    applyCueLook(t.cue, save.cue) // my equipped cue (cues.js / Cues window)
    const len = 1.45
    const px = -Math.sin(angle) * spin.x * R * 0.55
    const pz = Math.cos(angle) * spin.x * R * 0.55
    const py = spin.y * R * 0.55
    const tipX = t.x + c.x + px - cdir.x * (gap + R)
    const tipY = BALL_Y + py - cdir.y * (gap + R)
    const tipZ = t.z + c.z + pz - cdir.z * (gap + R)
    t.cue.position.set(tipX - cdir.x * len, tipY - cdir.y * len, tipZ - cdir.z * len)
    t.cue.visible = true
  }

  // --- camera goals per view ---
  const look = new Vector3()
  const camBall = { x: 0, z: 0 }
  function goalFor(dt) {
    const c = sim.balls[0]
    // while a ball-in-hand drag is on, the camera holds still (else the ball would chase the pointer)
    if (drag !== 'ball') {
      camBall.x = c.x
      camBall.z = c.z
    }
    const bx = t.x + camBall.x
    const bz = t.z + camBall.z
    if (view === 'aim') {
      const z = zoom
      const dx = Math.cos(aim)
      const dz = Math.sin(aim)
      const dist = lerp(0.78, 3.3, z)
      const h = lerp(0.25, 2.9, z * z * 0.6 + z * 0.4)
      camGoal.p.set(bx - dx * dist, BALL_Y + h, bz - dz * dist)
      const ahead = lerp(1.05, 1.3, z)
      look.set(bx + dx * ahead, TABLE_BED_Y + lerp(0.02, -0.25, z), bz + dz * ahead)
      camGoal.fov = MATCH.aimFov
    } else if (view === 'watch') {
      const aspect = window.innerWidth / window.innerHeight
      const tanV = Math.tan((MATCH.watchFov * Math.PI) / 360)
      const tanH = tanV * aspect
      const side = myTeam ? -1 : 1
      const D = Math.max((TABLE.length / 2 + 0.25) / tanH, (TABLE.width / 2 + 0.6) / tanV)
      camGoal.p.set(t.x, TABLE_BED_Y + D * 0.92, t.z + side * D * 0.42)
      look.set(t.x, TABLE_BED_Y, t.z + side * 0.12)
      camGoal.fov = MATCH.watchFov
    } else {
      hubCam.aspect = window.innerWidth / window.innerHeight
      updateHubCamera(hubCam, dt)
      camGoal.p.copy(hubCam.position)
      // the chase cam looks at the player: aim the blended look point there too
      hubCam.getWorldDirection(rig.position)
      const d = hubCam.position.distanceTo(player.renderPosition)
      camGoal.look.copy(hubCam.position).addScaledVector(rig.position, Math.max(2, d))
      camGoal.fov = hubCam.fov
      return
    }
    camGoal.look.copy(look)
  }
  let shake = 0
  function updateCamera(dt) {
    goalFor(dt)
    camRate = Math.min(view === 'aim' ? 26 : 9, camRate + dt * 14)
    const k = 1 - Math.exp(-camRate * dt)
    camera.position.lerp(camGoal.p, k)
    camLook.lerp(camGoal.look, k)
    camera.lookAt(camLook)
    if (shake > 0) {
      shake = Math.max(0, shake - dt * 2.5)
      camera.position.x += (Math.random() - 0.5) * shake * 0.05
      camera.position.y += (Math.random() - 0.5) * shake * 0.05
    }
    const fov = camera.fov + (camGoal.fov - camera.fov) * k
    if (Math.abs(fov - camera.fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }

  // --- table events: particles, rewards, streaks ---
  tables.on((type, data) => {
    if (type !== 'sounds' || !M.active) return
    for (const ev of data) {
      if (ev.table !== t) continue
      play.event(ev)
      const wx = ev.wx
      const wz = ev.wz
      if (ev.type === 'cue') {
        mfx.cueHit(wx, BALL_Y, wz, Math.cos(aim), Math.sin(aim), Math.min(1, ev.speed / 7))
        if (shotAb === 'fireShot') sfx.fireShot(Math.min(1, ev.speed / 10))
        if (ev.speed > 6) shake = 0.6
      } else if (ev.type === 'ball') {
        mfx.ballHit(wx, BALL_Y, wz, ev.speed)
        if (ev.speed > 3) shake = Math.max(shake, 0.35)
      } else if (ev.type === 'rail') mfx.railHit(wx, BALL_Y, wz, ev.speed)
      else if (ev.type === 'pocket') onPocket(ev)
    }
  })
  function onPocket(ev) {
    const n = ev.n
    mfx.pocket(ev.wx, ev.wz, ballColor(n), n === 8)
    renderCards()
    if (!shotByMe || n === 0 || n === 8) return
    const g = groups[myTeam]
    if (g && groupOf(n) !== g) return
    // one of mine: streak, cash, ability
    streakCount++
    const reward = ECONOMY.potReward * Math.min(5, streakCount)
    addCash(reward)
    sfx.coin()
    showStreak(streakCount)
    sfx.streak(streakCount)
    hud.popup(Math.random() < 0.5 ? 'NICE SHOT!' : 'GREAT SHOT!', new Vector3(ev.wx, TABLE_BED_Y + 0.35, ev.wz), '#ffd23d', 1.15)
    hud.popup(`+$${reward}`, new Vector3(ev.wx, TABLE_BED_Y + 0.15, ev.wz), '#7dff8a', 0.8)
    gainAbility(13 * Math.min(3, streakCount))
  }

  // --- per frame ---
  M.update = (dt, elapsed) => {
    if (!M.active) return
    // the server went away: the match can't go on
    if (phase !== 'over' && room && net.room !== room) finish(1 - myTeam, 'Lost the connection to the server', true)
    if (bannerTimer > 0 && !bannerSticky) {
      bannerTimer -= dt
      if (bannerTimer <= 0) els.banner.classList.remove('show')
    }
    if (streakTimer > 0) {
      streakTimer -= dt
      if (streakTimer <= 0) els.streak.classList.add('hidden')
    }
    zoom += (zoomTarget - zoom) * (1 - Math.exp(-9 * dt))
    const c = sim.balls[0]
    const mine = phase === 'aim'
    layer.classList.toggle('my-turn', mine)
    layer.classList.toggle('charging', charging || spaceCharge)
    els.power.classList.toggle('off', !mine || !powerAllowed())
    if (phase === 'roulette') updateRoulette(dt)
    else if (phase === 'intro') {
      introTimer -= dt
      if (introTimer <= 0) beginTurn()
    } else if (phase === 'pause') {
      aiTimer -= dt
      if (aiTimer <= 0) beginTurn()
    } else if (phase === 'aim') {
      aim += fineDir * MATCH.fineAim * (fine ? 0.25 : 1) * dt
      if (spaceCharge) {
        chargeT += dt
        power = 0.5 - 0.5 * Math.cos(chargeT * 2.6)
      }
      if (Math.abs(power - lastTickPower) > 0.05) {
        sfx.powerTick(power)
        lastTickPower = power
      }
      // on the 8: until I tap a pocket, the call follows the pocket the guide aims at
      if (cleared(turn) && !callPicked && aimPocket >= 0) callPocket = aimPocket
      {
        clock -= dt
        const n = Math.ceil(clock)
        if (n <= 5 && n !== lastClockTick && n > 0) {
          lastClockTick = n
          sfx.clockTick(true)
        }
        if (clock <= 0) {
          charging = spaceCharge = false
          power = 0
          sendEnd({ turn: 1 - turn, bih: true, foul: 'Ran out of time' })
        }
      }
      if (phase === 'aim') {
        updateGuide()
        placeMyCue(aim, 0.035 + power * 0.36)
        const st = stanceFor(aim)
        if (Math.hypot(player.position.x - st.x, player.position.z - st.z) > 0.05) resetPlayer({ x: st.x, y: 0.05, z: st.z }, st.facing)
        player.facing = st.facing
        // the others see my cue turn (and the cue ball move in hand)
        const now = performance.now()
        if (now - sendAt > 100) {
          const q = { seq, a: Math.round(aim * 1000) / 1000, p: Math.round(power * 100) / 100, k: cleared(turn) ? callPocket : -1 }
          if (ballInHand) {
            q.x = Math.round(c.x * 1e4) / 1e4
            q.z = Math.round(c.z * 1e4) / 1e4
          }
          const key = `${q.a}|${q.p}|${q.x}|${q.z}|${q.k}`
          if (key !== aimKey) {
            aimKey = key
            sendAt = now
            sendServer('mAim', q)
          }
        }
      }
    } else if (phase === 'remote' || phase === 'remoteRoll') {
      hideGuide()
      if (phase === 'remote') clock -= dt
    } else if (phase === 'strike') {
      hideGuide()
      pending.t += dt
      t.aim.t = pending.t
      // my stroke: from where the power bar left it, a quick ease-in thrust
      const pull = 0.035 + pending.fromPower * 0.36
      const k = Math.min(1, pending.t / 0.085)
      placeMyCue(pending.angle, Math.max(0, pull * (1 - k * k)))
      if (k >= 1) {
        sim.shoot(pending.angle, pending.speed, { x: spin.x, y: spin.y, elev }, pending.mods)
        rollT = 0
        outbox.length = 0
        sendAt = 0
        layer.classList.toggle('ab-timestop', shotAb === 'timeStop')
        armed = ''
        renderAbility()
        ballInHand = false
        moveTimer = 0
        setView('watch')
        t.aim = null
        power = 0
        phase = 'rolling'
        pending = null
        lastScorch = null
        setTimeout(() => {
          if (t && phase === 'rolling') t.cue.visible = false
        }, 120)
      }
    } else if (phase === 'rolling') {
      const e0 = sim.events.length
      sim.step(dt)
      rollT += dt
      // the others watch it: ball positions + sound/fx events, ~15 a second
      for (let i = e0; i < sim.events.length; i++) packEvent(sim.events[i], outbox)
      const now = performance.now()
      if (now - sendAt > 66) {
        sendAt = now
        sendServer('mBalls', { seq, b: packBalls(sim), ev: outbox.splice(0, 200) })
      }
      if (shotAb && c.on) {
        const sp = Math.hypot(c.vx, c.vz)
        if (sp > 0.05) {
          mfx.fireTrail(t.x + c.x, BALL_Y, t.z + c.z, c.vx, c.vz, dt, shotAb === 'fireShot' ? null : TINT[shotAb])
          if (shotAb === 'fireShot' && (!lastScorch || Math.hypot(c.x - lastScorch.x, c.z - lastScorch.z) > R * 0.5)) {
            mfx.scorch(t.x + c.x, t.z + c.z, R)
            lastScorch = { x: c.x, z: c.z }
          }
        }
      }
      const stuck = rollT > 16 // safety: nothing may roll forever
      if (stuck) for (const b of sim.balls) b.vx = b.vz = 0
      if (!sim.moving() && (stuck || !play.settle())) {
        sfx.setRoll(0)
        layer.classList.remove('ab-timestop')
        if (outbox.length) sendServer('mBalls', { seq, b: packBalls(sim), ev: outbox.splice(0, 200) })
        resolve()
      }
    }
    // rolling rumble
    if (phase === 'rolling') {
      let s = 0
      for (const b of sim.balls) if (b.on) s += Math.hypot(b.vx, b.vz)
      sfx.setRoll(Math.min(1, s / 6))
    }
    // fire aura on the armed cue ball
    if (armed && (phase === 'aim' || phase === 'strike')) mfx.setAura(true, t.x + c.x, BALL_Y, t.z + c.z, R, elapsed, armed === 'fireShot' ? null : TINT[armed])
    else if (shotAb && phase === 'rolling' && c.on) mfx.setAura(true, t.x + c.x, BALL_Y, t.z + c.z, R * 0.8, elapsed, shotAb === 'fireShot' ? null : TINT[shotAb])
    else if (remoteAb && phase === 'remoteRoll' && c.on) mfx.setAura(true, t.x + c.x, BALL_Y, t.z + c.z, R * 0.8, elapsed, remoteAb === 'fireShot' ? null : TINT[remoteAb])
    else mfx.setAura(false)
    play.update(dt, elapsed, armed)

    updateTutorial(dt)
    if (phase !== 'off' && phase !== 'over') updateCamera(dt)
    else if (phase === 'over') updateCamera(dt)
    updateGhosts(dt)
    // my own avatar: hidden while the camera is inside or right next to it
    const myGroup = getMyGroup?.()
    if (myGroup) {
      const near = Math.hypot(camera.position.x - player.renderPosition.x, camera.position.z - player.renderPosition.z)
      myGroup.visible = !(view === 'aim' || view === 'watch' || near < 1.2)
    }
    mfx.setScale((window.innerHeight * Math.min(2, window.devicePixelRatio || 1)) / (2 * Math.tan((camera.fov * Math.PI) / 360)))
    mfx.update(dt)
    updateHud()
  }

  // --- HUD per frame ---
  function updateHud() {
    // power bar
    const p = power
    els.powerFill.style.height = `${p * 100}%`
    els.powerFill.style.background = p > 0.94 ? 'linear-gradient(180deg,#a855f7,#ff3d7f 25%,#ff9f1a 45%,#ffe03d 60%,#45e06a 78%,#3d8bff)' : `hsl(${Math.round(130 - p * 135)}, 95%, 55%)`
    els.powerCue.style.transform = `translateY(${p * 46}%)`
    els.powerLbl.textContent = p > 0.005 ? `${Math.round(p * 100)}%` : 'PULL'
    // clock pill + card arcs
    const timed = phase === 'aim' || phase === 'remote'
    show(els.clock, timed && clock <= 20)
    if (timed) els.clockNum.textContent = String(Math.max(0, Math.ceil(clock)))
    els.clock.classList.toggle('urgent', clock <= 5)
    const frac = timed ? clamp(clock / (tut ? MATCH.tutorClock : MATCH.shotClock), 0, 1) : 1
    for (const card of els.cards) {
      const arc = card.querySelector('.arc')
      arc.setAttribute('stroke-dashoffset', String(card.classList.contains('turn') ? 100 * (1 - frac) : 0))
    }
    // ball in hand
    const bip = ballInHand && moveTimer > 0 && (phase === 'aim' || phase === 'remote')
    show(els.move, bip)
    if (bip) els.moveTxt.textContent = kitchen ? 'BALL IN HAND: BEHIND THE LINE' : 'BALL IN HAND'
    show(els.bip, bip && phase === 'aim')
    els.bip.querySelector('span').textContent = kitchen ? 'Drag the cue ball behind the line' : 'Drag the cue ball anywhere'
    // the 8 ball's call: a marker on each pocket (tap one) on my turn, the called one for the others
    const shooting8 = (phase === 'aim' || phase === 'remote') && cleared(turn) && !breakShot
    show(els.callHint, shooting8 && phase === 'aim' && !charging && els.invalid.classList.contains('hidden'))
    for (let i = 0; i < els.calls.length; i++) {
      const b = els.calls[i]
      const p = POCKETS[i]
      const ps = shooting8 && (phase === 'aim' || i === callPocket) ? screenOf(t.x + p[0], TABLE_BED_Y, t.z + p[1]) : null
      show(b, !!ps)
      if (!ps) continue
      b.classList.toggle('on', i === callPocket)
      b.classList.toggle('ro', phase !== 'aim')
      b.style.transform = `translate(-50%, -50%) translate(${ps[0]}px, ${ps[1]}px)`
    }
    // projected labels: MOVE under the cue ball, the target pocket ring
    const c = sim.balls[0]
    let s = bip && phase === 'aim' ? screenOf(t.x + c.x, TABLE_BED_Y - 0.02, t.z + c.z) : null
    show(els.moveLbl, !!s)
    if (s) els.moveLbl.style.transform = `translate(-50%, 0) translate(${s[0]}px, ${s[1] + 8}px)`
    // a hand on the cue ball until it has been grabbed this turn: "you can pick this up"
    s = bip && phase === 'aim' && !grabbed && drag !== 'ball' && !charging ? screenOf(t.x + c.x, BALL_Y, t.z + c.z) : null
    show(els.hintBall, !!s)
    if (s) els.hintBall.style.transform = `translate(${s[0]}px, ${s[1]}px)`
    s = phase === 'aim' && aimPocket >= 0 ? screenOf(t.x + POCKETS[aimPocket][0], TABLE_BED_Y, t.z + POCKETS[aimPocket][1]) : null
    show(els.pocket, !!s)
    if (s) {
      const d = camera.position.distanceTo(proj.set(t.x + POCKETS[aimPocket][0], TABLE_BED_Y, t.z + POCKETS[aimPocket][1]))
      const size = clamp(260 / d, 34, 150)
      els.pocket.style.width = els.pocket.style.height = `${size}px`
      els.pocket.style.transform = `translate(-50%, -50%) translate(${s[0]}px, ${s[1]}px)`
    }
    if (phase !== 'aim') show(els.invalid, false)
    // tutorial: hint the ability once
    if (!tut && phase === 'aim' && ability >= 100 && !armed && !save.abilityHintDone) setTut(COARSE ? 'Tap the ability button to use it!' : 'Press G to use your ability!')
    else if (!tut && tutText && (phase !== 'aim' || armed || ability < 100 || save.abilityHintDone)) setTut('')
    show(els.activate, ability >= 100 && !armed && phase === 'aim' && !tut)
  }

  // my avatar leans in over the cue while it's my shot
  M.pose = (avatar, dt) => {
    if (!M.active || !avatar) return
    const k = phase === 'aim' || phase === 'strike' ? 1 : 0
    M.lean = (M.lean ?? 0) + (k - (M.lean ?? 0)) * Math.min(1, dt * 8)
    aimPose(avatar, M.lean, power)
  }
  renderSpin()
  renderAbility()
  // dev-only hooks for testing states quickly
  if (import.meta.env.DEV) {
    M.debug = {
      state: () => ({ phase, view, turn, myTeam, groups: [...groups], ballInHand, moveTimer, ability, armed, tut: tut?.step ?? null, zoom, seq, matchId, shooterSid, teams, clock, breakShot, kitchen, callPocket, callPicked }),
      // aim my shot (radians, table plane) for scripted rule tests
      aim: (a) => (aim = a),
      // arm any ability for testing: M.debug.give('blackHole') then G
      give: (id) => {
        abKind = id
        play.begin(t, id)
        renderAbilityKind()
        ability = 100
        renderAbility()
      },
      ability: (n) => {
        ability = n
        renderAbility()
      },
      ballInHand: () => {
        ballInHand = true
        moveTimer = 10
        grabbed = false
      },
      endTutorial,
    }
  }
  return M
}
