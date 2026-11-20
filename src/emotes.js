// Emotes: the catalog the Emotes panel lists (hub/emotemenu.js), played by the procedural
// animator (avatar/animator.js playEmote) on the player, the bots and remote players. Synced
// through the roster (`emote` { id } -> PlayerState.emote / emoteSeq); ids must match the
// backend's ID_PATTERN. All emotes are free (never sold for premium currency).
//
// pose(o, t) writes a full pose into PoseBuffer `o` (already reset) at t seconds in, in CHARACTER
// space (rig.js: +X swings a limb backward, +Z rolls a left limb outward / a right limb inward),
// may set o.bobY (m, root lift) and returns the root's extra yaw (rad, e.g. a spin).
// `loop` emotes play until the player moves; the others stop after `dur` s. `thumb` = the moment
// drawn as the panel's silhouette.

const TAU = Math.PI * 2
const s = Math.sin
const c = Math.cos
const d = (deg) => (deg * Math.PI) / 180
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
const ease = (v) => v * v * (3 - 2 * v)
// 0 -> 1 over the first `a` s, 1 -> 0 over the last `a` s of `dur`: an in-out envelope.
const env = (t, dur, a = 0.25) => ease(clamp01(t / a)) * ease(clamp01((dur - t) / a))
// Elbow bend: positive folds the forearm forward/up.
const ELBOW = -1

// Arms down by the sides, a soft idle.
function rest(o) {
  o.set('ArmL1', d(-4), 0, d(8))
  o.set('ArmR1', d(-4), 0, d(-8))
}

export const EMOTES = [
  {
    id: 'wave', name: 'Wave', kind: 'Greeting', dur: 2.4, thumb: 0.9,
    pose(o, t) {
      rest(o)
      const k = env(t, 2.4, 0.3)
      o.set('ArmR1', d(-20) * k, 0, d(-150) * k + s(t * 9) * d(14) * k)
      o.set('ArmR2', ELBOW * d(25) * k)
      o.set('Neck1', 0, d(-8) * k, d(6) * k)
      o.set('Spine1', 0, 0, d(-3) * k)
    },
  },
  {
    id: 'cheer', name: 'Cheer', kind: 'Celebrate', loop: true, thumb: 0.15,
    pose(o, t) {
      const pump = Math.abs(s(t * 6))
      o.set('ArmL1', 0, 0, d(150 + pump * 18))
      o.set('ArmR1', 0, 0, d(-150 - pump * 18))
      o.set('ArmL2', ELBOW * d(20 - pump * 18))
      o.set('ArmR2', ELBOW * d(20 - pump * 18))
      o.set('Spine1', d(-6))
      o.set('Neck1', d(-14))
      o.set('LegL2', d(20 * (1 - pump)))
      o.set('LegR2', d(20 * (1 - pump)))
      o.bobY = pump * 0.16
    },
  },
  {
    id: 'clap', name: 'Clap', kind: 'Celebrate', loop: true, thumb: 0.2,
    pose(o, t) {
      const open = 0.5 + 0.5 * s(t * 11)
      o.set('ArmL1', d(-62), d(10), d(-14 + open * 26))
      o.set('ArmR1', d(-62), d(-10), d(14 - open * 26))
      o.set('ArmL2', ELBOW * d(38))
      o.set('ArmR2', ELBOW * d(38))
      o.set('Neck1', d(4) + s(t * 5.5) * d(3))
      o.bobY = Math.abs(s(t * 5.5)) * 0.03
    },
  },
  {
    id: 'salute', name: 'Salute', kind: 'Respect', dur: 2.2, thumb: 1,
    pose(o, t) {
      rest(o)
      const k = env(t, 2.2, 0.35)
      // upper arm out to the side and a little forward, forearm folded up and in to the brow
      o.set('ArmR1', d(-25) * k, 0, d(-80) * k)
      o.set('ArmR2', ELBOW * d(25) * k, 0, d(-125) * k)
      o.set('Spine1', d(-4) * k)
      o.set('Neck1', d(-6) * k)
    },
  },
  {
    id: 'flex', name: 'Flex', kind: 'Show off', dur: 2.8, thumb: 1.2,
    pose(o, t) {
      const k = env(t, 2.8, 0.3)
      const squeeze = 0.5 + 0.5 * s(t * 7)
      // upper arms out level, forearms folded straight up (a sideways arm folds about Z)
      o.set('ArmL1', 0, 0, d(86) * k)
      o.set('ArmR1', 0, 0, d(-86) * k)
      o.set('ArmL2', 0, 0, d(95 + squeeze * 15) * k)
      o.set('ArmR2', 0, 0, d(-95 - squeeze * 15) * k)
      o.set('Spine1', d(-6) * k, s(t * 3.5) * d(8) * k)
      o.set('LegL1', 0, 0, d(6) * k)
      o.set('LegR1', 0, 0, d(-6) * k)
    },
  },
  {
    id: 'shrug', name: 'Shrug', kind: 'Reaction', dur: 1.8, thumb: 0.9,
    pose(o, t) {
      const k = env(t, 1.8, 0.3)
      o.set('ArmL1', d(-10) * k, 0, d(30) * k)
      o.set('ArmR1', d(-10) * k, 0, d(-30) * k)
      o.set('ArmL2', ELBOW * d(80) * k, d(-30) * k)
      o.set('ArmR2', ELBOW * d(80) * k, d(30) * k)
      o.set('Neck1', d(-4) * k, 0, d(14) * k)
      o.set('Spine1', 0, 0, d(-3) * k)
      o.bobY = 0.03 * k
    },
  },
  {
    id: 'bow', name: 'Take a Bow', kind: 'Respect', dur: 2.4, thumb: 1.1,
    pose(o, t) {
      rest(o)
      const k = env(t, 2.4, 0.6)
      o.set('Spine1', d(55) * k)
      o.set('Spine2', d(10) * k)
      o.set('Neck1', d(10) * k)
      o.set('ArmR1', d(-55) * k, 0, d(18) * k)
      o.set('ArmR2', ELBOW * d(70) * k)
      o.set('ArmL1', d(30) * k, 0, d(10) * k)
      o.set('LegR1', d(-8) * k)
      o.set('LegL1', d(14) * k)
    },
  },
  {
    id: 'disco', name: 'Disco Point', kind: 'Dance', loop: true, thumb: 0.05,
    pose(o, t) {
      const beat = s(t * TAU * 0.9)
      const up = beat > 0 ? 1 : 0
      const k = Math.abs(beat) ** 0.5
      o.set('ArmR1', d(-30), 0, d(-150) * k * up + d(-25) * k * (1 - up))
      o.set('ArmL1', d(10), 0, d(40))
      o.set('ArmL2', ELBOW * d(100))
      o.set('Spine1', 0, beat * d(12), beat * d(-8))
      o.set('Neck1', 0, beat * d(-10), 0)
      o.set('LegL1', d(-10) * up, 0, d(8))
      o.set('LegL2', d(25) * up)
      o.set('LegR1', d(-10) * (1 - up), 0, d(-8))
      o.set('LegR2', d(25) * (1 - up))
      o.bobY = Math.abs(beat) * 0.04
    },
  },
  {
    id: 'shuffle', name: 'Shuffle', kind: 'Dance', loop: true, thumb: 0.3,
    pose(o, t) {
      const p = t * TAU * 1.6
      const kick = s(p)
      o.set('LegL1', d(-35) * Math.max(0, kick), 0, d(6))
      o.set('LegR1', d(-35) * Math.max(0, -kick), 0, d(-6))
      o.set('LegL2', d(30) * Math.max(0, kick))
      o.set('LegR2', d(30) * Math.max(0, -kick))
      o.set('ArmL1', d(-30) * kick, 0, d(20))
      o.set('ArmR1', d(30) * kick, 0, d(-20))
      o.set('ArmL2', ELBOW * d(70))
      o.set('ArmR2', ELBOW * d(70))
      o.set('Spine1', d(6), kick * d(10))
      o.bobY = Math.abs(c(p)) * 0.06
      return kick * d(10)
    },
  },
  {
    id: 'robot', name: 'Robot', kind: 'Dance', loop: true, thumb: 0.6,
    pose(o, t) {
      const step = Math.floor(t * 2.5) % 4 // snap between four stiff frames
      const L = [0, 1, 0, -1][step]
      const R = [1, 0, -1, 0][step]
      o.set('ArmL1', d(-90), 0, d(10))
      o.set('ArmR1', d(-90), 0, d(-10))
      o.set('ArmL2', ELBOW * d(45 + L * 45))
      o.set('ArmR2', ELBOW * d(45 + R * 45))
      o.set('Neck1', 0, d(25) * (L - R) * 0.5, 0)
      o.set('Spine1', 0, d(10) * (R - L) * 0.5, 0)
      return 0
    },
  },
  {
    id: 'chalk', name: 'Chalk Up', kind: 'Pool', dur: 2.6, thumb: 1,
    pose(o, t) {
      rest(o)
      const k = env(t, 2.6, 0.35)
      const rub = s(t * 16)
      o.set('ArmR1', d(-75) * k, d(-10) * k, d(20) * k)
      o.set('ArmR2', ELBOW * d(60) * k)
      o.set('ArmL1', d(-70) * k + rub * d(5) * k, d(10) * k, d(-18) * k + rub * d(6) * k)
      o.set('ArmL2', ELBOW * d(75) * k)
      o.set('Neck1', d(18) * k)
      o.set('Spine1', d(6) * k)
    },
  },
  {
    id: 'spin', name: 'Victory Spin', kind: 'Celebrate', dur: 2.1, thumb: 0.5,
    pose(o, t) {
      const turn = ease(clamp01(t / 1.1))
      const end = ease(clamp01((t - 1.1) / 0.35)) * ease(clamp01((2.1 - t) / 0.35))
      const out = s(turn * Math.PI)
      o.set('ArmL1', 0, 0, d(80) * out + d(150) * end)
      o.set('ArmR1', 0, 0, d(-80) * out - d(150) * end)
      o.set('LegL2', d(20) * out)
      o.set('Neck1', d(-12) * end)
      o.bobY = out * 0.12
      return turn * TAU
    },
  },
  {
    id: 'sway', name: 'Lounge Sway', kind: 'Chill', loop: true, thumb: 0.6,
    pose(o, t) {
      const w = s(t * 2.6)
      o.set('ArmL1', d(-8), 0, d(12) + w * d(8))
      o.set('ArmR1', d(-8), 0, d(-12) + w * d(8))
      o.set('ArmL2', ELBOW * d(25))
      o.set('ArmR2', ELBOW * d(25))
      o.set('Spine1', 0, w * d(6), w * d(7))
      o.set('Neck1', Math.abs(s(t * 5.2)) * d(8), 0, -w * d(6))
      o.set('LegL2', d(14) * Math.max(0, w))
      o.set('LegR2', d(14) * Math.max(0, -w))
      o.bobY = -Math.abs(w) * 0.03
    },
  },
  {
    id: 'jacks', name: 'Jumping Jacks', kind: 'Workout', loop: true, thumb: 0.32,
    pose(o, t) {
      const k = 0.5 - 0.5 * c(t * TAU * 1.3)
      o.set('ArmL1', 0, 0, d(10 + 160 * k))
      o.set('ArmR1', 0, 0, d(-10 - 160 * k))
      o.set('LegL1', 0, 0, d(18) * k)
      o.set('LegR1', 0, 0, d(-18) * k)
      o.bobY = s(k * Math.PI) * 0.18
    },
  },
  {
    id: 'facepalm', name: 'Scratch!', kind: 'Reaction', dur: 2.4, thumb: 1.1,
    pose(o, t) {
      rest(o)
      const k = env(t, 2.4, 0.3)
      // left hand over the eyes: upper arm forward and in, forearm folded up to the face
      o.set('ArmL1', d(-50) * k, 0, d(-12) * k)
      o.set('ArmL2', ELBOW * d(115) * k)
      o.set('Neck1', d(22) * k + s(t * 4) * d(4) * k, 0, 0)
      o.set('Spine1', d(10) * k)
      o.set('ArmR1', d(-4), 0, d(-8))
    },
  },
  {
    id: 'ponder', name: 'Ponder', kind: 'Chill', loop: true, thumb: 1,
    pose(o, t) {
      const tap = Math.max(0, s(t * 6)) * d(6)
      // left hand to the chin, right arm folded across the belly
      o.set('ArmL1', d(-35), 0, d(-8))
      o.set('ArmL2', ELBOW * d(125) - tap)
      o.set('ArmR1', d(-20), 0, d(18))
      o.set('ArmR2', ELBOW * d(95))
      o.set('Neck1', d(-8), d(8), d(10) + s(t * 0.8) * d(4))
      o.set('Spine1', 0, 0, d(-3))
    },
  },
  {
    id: 'aircue', name: 'Air Cue Solo', kind: 'Dance', loop: true, thumb: 0.25,
    pose(o, t) {
      const strum = s(t * 14)
      const head = Math.abs(s(t * 4.5))
      o.set('Spine1', d(-14) + head * d(4), d(-12))
      o.set('ArmL1', d(-60), d(-10), d(30))
      o.set('ArmL2', ELBOW * d(40))
      o.set('ArmR1', d(-30) + strum * d(14), d(10), d(-10))
      o.set('ArmR2', ELBOW * d(85))
      o.set('Neck1', d(-10) + head * d(22))
      o.set('LegL1', d(-18), 0, d(10))
      o.set('LegL2', d(25))
      o.bobY = -0.04 - head * 0.02
    },
  },
  {
    id: 'hype', name: 'Hype Hop', kind: 'Celebrate', loop: true, thumb: 0.2,
    pose(o, t) {
      const p = t * TAU * 1.2
      const hop = Math.abs(s(p))
      const side = s(p / 2) > 0 ? 1 : 0
      o.set('ArmL1', d(-30), 0, d(140) * side + d(20) * (1 - side))
      o.set('ArmR1', d(-30), 0, d(-140) * (1 - side) - d(20) * side)
      o.set('ArmL2', ELBOW * d(side ? 20 : 100))
      o.set('ArmR2', ELBOW * d(side ? 100 : 20))
      o.set('LegL2', d(30) * hop)
      o.set('LegR2', d(30) * hop)
      o.set('LegL1', d(-14) * hop)
      o.set('LegR1', d(-14) * hop)
      o.set('Neck1', d(-8))
      o.bobY = hop * 0.2
    },
  },
]

export const EMOTE_BY_ID = Object.fromEntries(EMOTES.map((e) => [e.id, e]))
// Emotes the bots pick from when they idle or win.
export const BOT_IDLE_EMOTES = ['wave', 'sway', 'chalk', 'ponder', 'shrug', 'clap', 'disco']
export const BOT_WIN_EMOTES = ['cheer', 'spin', 'hype', 'flex']
