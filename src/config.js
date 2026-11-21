// Every tunable constant lives here; the rest of src/ holds no theme values.

// --- Identity -------------------------------------------------------------
export const GAME_SLUG = 'crazy-8-ball' // slug registered on bloxity.io
export const GAME_TITLE = 'Crazy 8 Ball'

// Forces the Bloxity SDK and avatar CDN to be treated as unavailable (see .env.example).
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'

// --- World (metres: +X east, +Z south, +Y up) -------------------------------
export const GROUND_Y = 0
// The ground (world.js): one convex slab of land in a sea. The shoreline sweeps from
// the front edge (-Z) back toward +Z on both wings.
export const BEACH = {
  front: -46, // z of the shoreline at the front edge
  back: 90, // z of the back edge
  halfWidth: 75, // x extent of the wings
  wingZ: 24, // z of the shoreline at the far left/right ends
  gateEdge: 21.5, // half-width of the straight shoreline at the front edge
  depth: 4, // slab thickness above the sea floor
  tile: 18, // m per sand texture tile
  fenceHeight: 3, // invisible wall around the sand so nobody walks into the sea
}
export const WATER = { level: -121, size: 2400, color: '#2a9fd6', shallow: '#7ff0ff' }
export const SPAWN = { x: 0, y: 0.05, z: 25 }
export const SPAWN_FACING = Math.PI // yaw the character faces on spawn (PI = toward -Z)

// --- The hub: a rooftop pool lounge on a skyscraper (src/hub/) --------------------
// Roof floor is y = 0. Tables run their long side along X, the join pad sits on
// their +Z (south) side, where the aisles are.
export const ROOF = {
  halfX: 40, minZ: -34, maxZ: 34, // walkable floor
  towerHeight: 120, // street level is at -towerHeight
  parapet: 0.5, railing: 1.2, // low wall + glass railing on top of it
  tile: 2.4, // m per floor tile texture repeat (2x2 tiles)
  floor: '#e9b096', grout: '#bf8a76',
}
export const CITY = { radius: 420, cell: 34, seed: 88, minH: 18, maxH: 150, towers: 0.08, clearX: 70, clearZ: 62, islands: [[-520, -420, 70], [-610, -230, 48], [-430, -560, 40]] }
export const FACADE = { glass: '#3d6fb4', cellW: 24, cellH: 14.4 } // window grid tile size in metres

export const TABLE = {
  length: 4.3, width: 2.5, height: 0.95, // outer size, rail-top height
  bedL: 3.6, bedW: 1.8, // playing area inside the cushion noses
  ballR: 0.06,
  wood: '#5a2f1c', woodLight: '#7a4428',
}
// Felt colour per mode; capacity = team * 2.
export const TABLE_MODES = {
  '1v1': { team: 1, felt: '#16a6de', label: '1v1' },
  '2v2': { team: 2, felt: '#d41c5a', label: '2v2' },
  '3v3': { team: 3, felt: '#3b3f47', label: '3v3' },
}
export const TABLE_GRID = {
  cols: [-26, -13, 0, 13, 26],
  rows: [-16, -6, 4, 14],
  // modes[row][col]
  modes: [
    ['2v2', '2v2', '3v3', '3v3', '1v1'],
    ['2v2', '2v2', '1v1', '1v1', '1v1'],
    ['1v1', '1v1', '1v1', '1v1', '1v1'],
    ['1v1', '1v1', '1v1', '1v1', '1v1'],
  ],
}
export const PAD = {
  depth: 2.5, gap: 0.35, // pad size along Z, gap between the table and the pad
  open: '#36b9ff', mine: '#3dff8a', playing: '#ffd23d',
  cardRange: 9, // m: the floating table card shows for the nearest table within this
  arrowRange: 15, // m: JOIN arrows float over open pads this close
}
// Lobbies run on the server (backend tables.ts: TABLE_TEAMS, TABLE_COUNTDOWN_MS): every seat is a real player.
// Default looks for players without a Bloxity avatar (remotePlayers.js), picked per session.
export const BOTS = {
  shirts: ['#1d1d22', '#e94f37', '#3a86ff', '#ffbe0b', '#8338ec', '#2ec4b6', '#f4f1de', '#ff70a6', '#38b000', '#6c757d'],
  pants: ['#1b1b1f', '#2b2d42', '#3d405b', '#5c4033', '#264653'],
  hair: ['#2b1b12', '#4a2f1c', '#c96a2a', '#e8c070', '#111111', '#7a4b2a'],
  skin: ['#f2c79a', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'],
}
export const ECONOMY = { startCash: 0, storageKey: 'crazy-8-ball.save', winReward: 150, lossReward: 25, potReward: 20 } // $ per match (Wins/money only, never premium currency)
// --- Game server (net.js; ../Crazy-8-ball-backend) ------------------------------------
// Dev talks to a local backend (VITE_SERVER_URL_DEV overrides); production resolves the pod
// through the Bloxity SDK. Without a server the game plays on the browser save.
export const SERVER_URL = import.meta.env.DEV ? import.meta.env.VITE_SERVER_URL_DEV || 'ws://localhost:2567' : ''
export const NET = { saveEvery: 4, requestTimeout: 8, retry: 3, retryMax: 60, rejoin: 2 } // s
// Other players in the room (remotePlayers.js): pose updates a second, how fast a drawn remote eases
// to its relayed pose (1/s), dead reckoning cap (s), and how many are drawn (nearest first).
export const REMOTES = { poseHz: 10, lerp: 12, predictMax: 0.4, max: 24, maxTouch: 12 }

// --- Free rewards (hub/menus.js). Server-authoritative timers/claims (backend daily.ts / gifts.ts);
// the client grants the prize. A reward: { cash } | { block, n } | { cue } | { ability }.
export const DAILY = {
  days: [{ cash: 5000 }, { block: 'rare', n: 1, badge: 'RARE!' }, { block: 'mystery', n: 1 }, { cash: 30000 }, { block: 'mystery', n: 2 }, { block: 'epic', n: 1, badge: 'EPIC!' }, { cue: 'chroma' }],
  unlockAllPrice: 250000, // cash: unlocks every remaining day this week (never premium currency)
}
export const TRACK = { days: 28, milestones: [{ day: 8, block: 'mystery', n: 1 }, { day: 14, block: 'rare', n: 1 }, { day: 21, cash: 50000 }, { day: 28, block: 'epic', n: 1 }] }
export const GIFTS = [{ min: 5, cash: 250 }, { min: 15, cash: 250 }, { min: 30, cash: 500 }, { min: 45, cash: 500 }, { min: 60, cash: 1000, ability: true }]
// One-off rewards: the Bonus tab, the Starter Cue after the first match, the Time Gift every new player gets.
export const BONUS = { wins: 8, cue: 'eightBall' }
export const STARTER = { cue: 'starter', timeGiftHours: 8.5 }
export const BAG = { hotbar: 6, max: 200 }

// --- Ranked (hub/menus.js): win matches for XP; each tier has 5 divisions (Legend has 1).
// Reaching a division pays `cash`; division 1 of a tier also gives a lucky block, the tier's
// chat tag (shown on the name tag) and the tier's cue.
export const RANKED = {
  winXp: 100, streakXp: 10, streakXpMax: 50, lossXp: 0,
  tiers: [
    { id: 'bronze', name: 'Bronze', color: '#d08a4a', dark: '#7a4416', xp: 200, cash: 2500, block: 'uncommon' },
    { id: 'silver', name: 'Silver', color: '#c8d0dc', dark: '#6a7486', xp: 300, cash: 4000, block: 'uncommon' },
    { id: 'gold', name: 'Gold', color: '#f2c94c', dark: '#8a6a10', xp: 400, cash: 6000, block: 'rare' },
    { id: 'platinum', name: 'Platinum', color: '#a8c4e8', dark: '#4a6488', xp: 500, cash: 9000, block: 'rare' },
    { id: 'diamond', name: 'Diamond', color: '#6ad8ea', dark: '#1a7486', xp: 650, cash: 13000, block: 'epic' },
    { id: 'expert', name: 'Expert', color: '#ff6a6a', dark: '#a01a24', xp: 800, cash: 18000, block: 'epic' },
    { id: 'veteran', name: 'Veteran', color: '#6ad87a', dark: '#1a7a2a', xp: 1000, cash: 25000, block: 'legendary' },
    { id: 'master', name: 'Master', color: '#b88aff', dark: '#5a2aa8', xp: 1200, cash: 35000, block: 'legendary' },
    { id: 'grandmaster', name: 'Grandmaster', color: '#ffd23d', dark: '#3a3a44', xp: 1500, cash: 50000, block: 'legendary' },
    { id: 'legend', name: 'Legend', color: '#ff7ab8', dark: '#5a1a48', xp: 2500, cash: 100000, block: 'legendary', divisions: 1, sub: 'The King' },
  ],
}
// The player's match (hub/match.js)
export const MATCH = {
  shotClock: 30, // s per shot before it counts as a foul (the server's backstop is TURN_MS 50 s)
  tutorClock: 40, // s per shot while the first-match tutorial runs
  minSpeed: 0.8, maxSpeed: 7, // m/s cue ball speed at no / full power
  fineAim: 0.35, // rad/s with the fine-aim buttons / A-D keys
  fov: 34, // narrow top-down lens so the players round the table don't loom
  aimFov: 55, // behind-the-cue camera
  watchFov: 42, // overview while the balls roll
}

// --- Player modes (modes.js) -------------------------------------------------
// 'character' = third-person chase cam with the avatar on screen.
// 'player' = first-person, the camera is the player's eyes and the avatar is hidden.
export const MODES = ['character', 'player']
export const START_MODE = 'character'

// --- Physics (physics.js, player.js) ------------------------------------------
export const PHYSICS = {
  gravity: -22, // m/s^2 for dynamic bodies and the player
  fixedStep: 1 / 60, // s per physics tick; rendering interpolates between ticks
  maxSubSteps: 5, // a long frame never runs more ticks than this
  walkSpeed: 8, // m/s
  sprintSpeed: 14, // m/s with Shift held
  accel: 70, // m/s^2 toward the target velocity on the ground
  airAccel: 22, // m/s^2 steering while airborne
  decel: 60, // m/s^2 when no key is held
  turnSpeed: 12, // rad/s the body turns toward its heading
  jumpSpeed: 8.5, // m/s
  coyoteTime: 0.1, // s after leaving a ledge a jump still counts
  jumpBuffer: 0.12, // s a jump pressed before landing is remembered
  stepHeight: 0.45, // m autostep
  maxSlope: 50, // degrees the player can walk up
  snapToGround: 0.4, // m the controller stays glued to downward steps and slopes
  pushMass: 80, // kg the character weighs when shoving crates
  killY: -6, // sank this far: respawn
}
export const PLAYER_DIMS = { radius: 0.75, height: 1.8 } // capsule the character controller moves

// --- Look ------------------------------------------------------------------
export const RENDER = { exposure: 1.0 }
export const FOG = { near: 140, far: 720 }
// The two lighting moods lighting.js blends between (key N toggles).
export const TIME_OF_DAY = {
  transition: 2.5, // s to blend day <-> night
  // Golden hour: a low sun behind the lounge (north), violet zenith, peach horizon.
  day: {
    zenith: '#5b47b8',
    horizon: '#ffb98f',
    sunColor: '#ffd9ae',
    sunIntensity: 2.3,
    sunElevation: 24, // degrees above the horizon
    sunAzimuth: 205, // degrees, 0 = from +Z
    hemiSky: '#ffe8d6',
    hemiGround: '#c99a85',
    hemiIntensity: 0.8,
    envIntensity: 0.5,
    lampIntensity: 0,
    stars: 0,
    exposure: 0.9,
    windows: 0.18, // city window glow
  },
  night: {
    zenith: '#080726',
    horizon: '#3a2a66',
    sunColor: '#a9b8ff', // the moon
    sunIntensity: 0.5,
    sunElevation: 40,
    sunAzimuth: -60,
    hemiSky: '#45508e',
    hemiGround: '#24182a',
    hemiIntensity: 0.45,
    envIntensity: 0.3,
    lampIntensity: 26,
    stars: 1,
    exposure: 1.2,
    windows: 1.6,
  },
}
export const LIGHT = {
  shadowRange: 40, // half-width of the sun's shadow box around the player
  lampColor: '#ffb35c',
  lampDistance: 22,
}

// Default (fallback) character look, used only when player.glb cannot load.
export const CHARACTER_COLORS = { skin: '#f2c79a', suit: '#2f6fd0', hair: '#4a2f1c' }

export const MATERIAL_PBR = {
  PLAYER: { roughness: 0.7, metalness: 0 },
  GROUND: { roughness: 0.95, metalness: 0 },
}

// --- Graphics presets, picked by the Bloxity graphics_quality setting ----------
export const GRAPHICS_PRESETS = {
  Low: { shadows: false, shadowMap: 512, antialias: false, dpr: 1, bloom: false, particles: 0.35 },
  Medium: { shadows: true, shadowMap: 1024, antialias: false, dpr: 1.25, bloom: false, particles: 0.6 },
  High: { shadows: true, shadowMap: 2048, antialias: true, dpr: 2, bloom: true, particles: 1 },
  Ultra: { shadows: true, shadowMap: 4096, antialias: true, dpr: 2, bloom: true, particles: 1 },
}

// Bloom (postfx.js): only HDR-bright pixels (above threshold, linear, before
// tone mapping) glow: neon rails, waterfall, VIP gate, particles. Sunlit sand
// stays under the threshold.
export const BLOOM = { strength: 0.6, radius: 0.35, threshold: 2.0 }
// Neon materials (propkit.js): k = HDR colour multiplier with bloom on; with
// bloom off they are capped at plainMax so they stay coloured, not white.
export const NEON = { k: 3.5, plainMax: 1.2 }

// Phones and tablets default to a lighter preset when the portal sends no value,
// and any preset is capped there (a phone at DPR 3 renders 9x the pixels; bloom
// is a full-screen multi-pass blur, so it stays off on phones).
export const COARSE_POINTER = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
export const DEFAULT_GRAPHICS = COARSE_POINTER ? 'Medium' : 'High'
export const MOBILE_GRAPHICS_CAP = { dpr: 1.5, shadowMap: 1024, particles: 0.6 }

// The preset to render with on this device.
export function graphicsPreset(name) {
  const p = GRAPHICS_PRESETS[name] ?? GRAPHICS_PRESETS[DEFAULT_GRAPHICS]
  if (!COARSE_POINTER) return p
  const cap = MOBILE_GRAPHICS_CAP
  return { ...p, dpr: Math.min(p.dpr, cap.dpr), shadowMap: Math.min(p.shadowMap, cap.shadowMap), bloom: false, particles: Math.min(p.particles, cap.particles) }
}

// --- Touch controls (touch.js) --------------------------------------------------
export const TOUCH = {
  deadZone: 0.12, // fraction of the joystick radius that does nothing
  lookScale: 1.5, // touch drag pixels -> look, relative to a mouse pixel
  pinchPixelsPerNotch: 30, // finger spread change that equals one wheel notch
}

// --- Camera (camera.js) -------------------------------------------------------
export const CAMERA = {
  fov: 70,
  near: 0.1,
  far: 1200,
  startPitch: 0.34, // radians above the horizon
  minPitch: -0.35,
  maxPitch: 1.25,
  firstPersonPitch: 1.45, // |pitch| limit looking up/down in player mode
  eyeHeight: 0.92, // eye height as a fraction of player height (player mode)
  distance: 11.5, // resting boom length, m
  minDistance: 2.5, // wheel in past this enters player mode
  maxDistance: 26,
  followLerp: 14, // 1/s: the one smoothing stage, on the point the camera follows
  targetHeight: 1.2, // look-at point as a fraction of player height
  lookSensitivity: 0.0026, // rad per pixel of mouse movement
  zoomStep: 0.9, // m per wheel notch
  zoomEase: 12, // 1/s the zoom glides to its target
  speedFov: 6, // degrees the FOV widens at sprint speed
  speedEase: 3, // 1/s the speed framing eases in and out
  clearEase: 6, // 1/s the boom eases back out once a wall stops blocking it
}

// --- Bloxity (bloxity.js, avatar/) -------------------------------------------------
// SDK setting keys this game listens for; registering a listener makes the control
// appear in the portal's settings menu.
// Every key listened to (bloxity.js) is enabled in Boxity's menu; values arrive as strings.
export const SETTINGS = {
  master_volume: { def: '80', type: 'number', min: 0, max: 100 },
  music_volume: { def: '80', type: 'number', min: 0, max: 100 },
  graphics_quality: { def: DEFAULT_GRAPHICS, type: 'enum', values: ['Low', 'Medium', 'High', 'Ultra'] },
  camera_sensitivity: { def: '1', type: 'number', min: 0.1, max: 5 },
  show_fps: { def: 'false', type: 'bool' },
}

// The base rig, measured from player.glb: origin at the feet, 6.4 units tall at bind pose.
export const RIG_HEIGHT = 6.4
// Bind-pose values of the rig nodes the SDK proportions drive.
export const RIG = { armOffsetX: 2, legOffsetX: 0.6, neckOffsetY: 0.6 }
// getProportions() ranges, straight from the SDK spec; clamped before they reach the scene graph.
export const PROPORTIONS = {
  height: { def: 1, min: 0.5, max: 1.6 },
  shoulderWidth: { def: 1, min: 0.5, max: 1.5 },
  armLength: { def: 1, min: 0.05, max: 3 },
  legOffsetX: { def: 1, min: -0.7, max: 5 },
  torsoScaleX: { def: 1, min: 0.3, max: 2 },
  neckHeight: { def: 1, min: 0.94, max: 1.2 },
  headScale: { def: 1, min: 0.3, max: 2.6 },
}

// Procedural animation (avatar/animator.js), ported from Clean Leaves for Loot.
// Rotations are radians in CHARACTER space: +X swings a limb backward, +Y yaws, +Z rolls.
const deg = (d) => (d * Math.PI) / 180
export const ANIM = {
  airborneDelay: 0.07, // s off the ground before the air pose (ignores a step down a ledge)
  // Walk -> run is one cycle at two depths; phase advances with distance travelled.
  locomotion: {
    minFrequency: 0.7,
    maxFrequency: 3.6,
    strideDistance: 3.8, // m per cycle
    idleSpeed: 0.6,
    walkSpeed: 2.5,
    runSpeed: 8,
    sprintSpeed: 13,
    hipSwing: { walk: deg(22), run: deg(42), sprint: deg(56) },
    kneeBend: { walk: deg(30), run: deg(58), sprint: deg(72) },
    armSwing: { walk: deg(18), run: deg(36), sprint: deg(52) },
    elbowBend: { walk: deg(14), run: deg(44), sprint: deg(70) },
    torsoTwist: { walk: deg(4), run: deg(7), sprint: deg(9) },
    torsoLean: { walk: deg(3), run: deg(10), sprint: deg(18) },
    headCounterTwist: { walk: deg(2), run: deg(4), sprint: deg(5) },
    torsoRoll: { walk: deg(2), run: deg(3), sprint: deg(3) },
    bob: { walk: 0.03, run: 0.07, sprint: 0.09 }, // m, on the avatar root
    bankAngle: deg(9),
    bankRate: 8,
  },
  idle: {
    breathFrequency: 0.35,
    breathAmount: deg(1.8),
    breathBob: 0.007,
    basePose: {
      ArmL1: { x: deg(-4), z: deg(8) },
      ArmL2: { x: deg(12) },
      ArmR1: { x: deg(-4), z: deg(-8) },
      ArmR2: { x: deg(12) },
      LegL1: { x: deg(-4) },
      LegR1: { x: deg(4) },
    },
  },
  airborne: {
    rise: {
      LegL1: { x: deg(-38) }, LegR1: { x: deg(8) }, LegL2: { x: deg(62) }, LegR2: { x: deg(40) },
      ArmL1: { x: deg(-40), z: deg(34) }, ArmR1: { x: deg(-30), z: deg(-34) },
      ArmL2: { x: deg(30) }, ArmR2: { x: deg(30) }, Spine1: { x: deg(6) },
    },
    fall: {
      LegL1: { x: deg(-14) }, LegR1: { x: deg(10) }, LegL2: { x: deg(22) }, LegR2: { x: deg(18) },
      ArmL1: { x: deg(-70), z: deg(40) }, ArmR1: { x: deg(-60), z: deg(-40) },
      ArmL2: { x: deg(20) }, ArmR2: { x: deg(20) }, Spine1: { x: deg(-4) },
    },
    velocityReference: 8, // m/s vertical speed that reads as fully rising / falling
  },
  landing: {
    duration: 0.16,
    pose: {
      LegL1: { x: deg(-34) }, LegR1: { x: deg(-34) }, LegL2: { x: deg(58) }, LegR2: { x: deg(58) },
      ArmL1: { x: deg(-18), z: deg(20) }, ArmR1: { x: deg(-18), z: deg(-20) }, Spine1: { x: deg(14) },
    },
    bobY: -0.2,
  },
  transitions: { toLocomotion: 0.14, toAirborne: 0.12, toLanding: 0.06 }, // s to blend a pose change
}

export const FONT_FAMILY = 'Fredoka'

export function clamp(n, min, max) {
  return n < min ? min : n > max ? max : n
}

// Coerce one raw SDK string against its SETTINGS entry.
export function coerceSetting(key, raw) {
  const spec = SETTINGS[key]
  if (!spec) return raw
  const value = raw === '' || raw == null ? spec.def : raw
  if (spec.type === 'bool') return value === 'true' || value === true
  if (spec.type === 'enum') return spec.values.includes(value) ? value : spec.def
  const n = Number(value)
  return clamp(Number.isFinite(n) ? n : Number(spec.def), spec.min, spec.max)
}

// --- Audio (src/audio/) ------------------------------------------------------------
// Everything is synthesised at runtime (no sound files).
export const AUDIO = {
  volume: 0.8,
  storageKey: 'crazy-8-ball.sound',
  buses: { ui: 0.75, sfx: 0.9, amb: 0.6, engine: 0.5, music: 1 }, // per-bus levels before the master
  duck: 0.45, // world (ambience) level while a menu window is open
  musicDuck: 0.75, // background music level while a menu window is open
  maxVoices: 56,
  maxVoicesTouch: 28,
  latency: 0.04,
  latencyTouch: 0.07,
  lead: 0.02,
  // Open-air rooftop: short, bright early reflections off the pavilion and the glass railing.
  reverb: { seconds: 1.6, preDelay: 0.01, early: [[13, 0.4], [23, 0.3], [41, 0.22], [67, 0.15], [89, 0.1]], decay: 1.1, tail: 0.14, darken: 1.8, send: 0.8 },
  // Positional one-shots: full level within near m, silent past far m.
  near: 3, far: 34,
  // ambience.js: scheduler tick s, wind / city levels, bird and horn gaps (s), fire + piano reach (m)
  // Wind and city sit well under the music: a soft bed, not a hiss.
  ambience: { tick: 0.25, wind: 0.05, gust: [0.75, 1.25], windBand: [280, 560], city: 0.07, birdEvery: [6, 16], hornEvery: [30, 70], fire: 0.5, fireNear: 10, piano: 0.32, pianoNear: 16, chimeEvery: [12, 28] },
  // music.js: calm generative background music. bpm, level in a match, how much it steps
  // back next to the lounge piano (so the two never play over each other), and the bus
  // filters that keep it warm (nothing harsh up top, no mud at the bottom).
  music: { bpm: 70, inMatch: 0.7, pianoDuck: 0.9, lowCut: 70, highCut: 3200, echo: 0.24, fadeIn: 6 },
  steps: { stride: 1.35 }, // m walked per footstep
}
