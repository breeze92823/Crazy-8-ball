// Ability sounds, synthesised like sfx.js: the Ability Spin screen (reel ticks, reveals by
// rarity, purchases, codes, errors) and the in-match abilities (arming + each effect).
import { A, now, voice } from './core.js'
import { burst, modal, rnd, tone, vary } from './synth.js'

const ok = (s, p = 1) => voice(s, p)
const bell = (t, f, gain, pan = 0, verb = 0.3, bus = A.sfx) => modal({ t, f, modes: [[1, 1, 0.9], [2.76, 0.35, 0.4], [5.4, 0.15, 0.2]], beat: 3, gain, pan, verb, bus })

// --- spin screen ------------------------------------------------------------------------------
// k 0..1: how far the reel has slowed (higher, brighter ticks as it settles)
export function reelTick(k = 0) {
  if (!ok(0.08, 2)) return
  modal({ f: vary(1100 + k * 900, 0.03), modes: [[1, 1, 0.025], [2.7, 0.35, 0.012]], strike: 0.25, gain: 0.09 + k * 0.05, bus: A.ui })
}
// rank: 0 common .. 5 mythic. Brighter, longer fanfares for rarer pulls.
export function reveal(rank = 0) {
  if (!ok(1.5 + rank * 0.3)) return
  const t = now()
  const base = [523, 587, 659, 784, 880, 988][rank] ?? 523
  const steps = [1, 1.26, 1.5, 2, 2.52, 3].slice(0, 3 + Math.min(3, rank))
  steps.forEach((r, i) => bell(t + i * 0.07, base * r, 0.06, (i - steps.length / 2) * 0.15, 0.4))
  burst({ t, noise: 'pink', f: 600, f2: 6000, q: 0.8, a: 0.02, d: 0.4 + rank * 0.12, gain: 0.05 + rank * 0.015, verb: 0.4 })
  if (rank >= 3) {
    tone({ t, f: 110, f2: 220, glide: 0.4, d: 0.8, gain: 0.08, lp: 1200 })
    for (let i = 0; i < 10 + rank * 3; i++) bell(t + 0.3 + i * 0.045, vary(1800 + rank * 300, 0.25), 0.025, rnd(-0.7, 0.7), 0.5)
  }
}
export function buy() {
  if (!ok(1)) return
  const t = now()
  for (let i = 0; i < 6; i++) modal({ t: t + i * 0.05, f: vary(2400, 0.08), modes: [[1, 1, 0.08], [2.4, 0.4, 0.05]], strike: 0.4, gain: 0.07, bus: A.ui })
  bell(t + 0.3, 1568, 0.05)
}
export function redeem() {
  if (!ok(1)) return
  const t = now()
  ;[784, 988, 1175, 1568, 1976].forEach((f, i) => bell(t + i * 0.06, f, 0.05, 0, 0.35))
}
export function error() {
  if (!ok(0.4, 2)) return
  const t = now()
  tone({ t, type: 'square', f: 196, d: 0.09, gain: 0.04, lp: 900, bus: A.ui })
  tone({ t: t + 0.1, type: 'square', f: 165, d: 0.14, gain: 0.04, lp: 800, bus: A.ui })
}
export function equip() {
  if (!ok(0.4, 2)) return
  const t = now()
  bell(t, 988, 0.05, 0, 0.2, A.ui)
  bell(t + 0.06, 1319, 0.045, 0, 0.2, A.ui)
}
export function lock(on) {
  if (!ok(0.2, 2)) return
  const t = now()
  modal({ t, f: on ? 900 : 1300, modes: [[1, 1, 0.04], [3.2, 0.4, 0.02]], strike: 0.5, gain: 0.12, bus: A.ui })
  burst({ t, noise: 'brown', type: 'lowpass', f: 700, d: 0.04, gain: 0.1, bus: A.ui })
}

// --- match: arming ------------------------------------------------------------------------------
// A shimmer that every ability shares, coloured by a pitch per ability.
const ARM_PITCH = { eaglesEye: 880, superBounce: 660, magnet: 330, rewind: 523, portals: 440, lookOverThere: 740, verity: 988, catchABall: 392, timeStop: 294, chainLightning: 1175, steelBall: 220, blackFlash: 185, blackHole: 110, guangdongTiger: 147 }
export function arm(id) {
  if (!ok(1.2)) return
  const t = now()
  const f = ARM_PITCH[id] ?? 523
  burst({ t, noise: 'pink', f: 300, f2: 5000, q: 1, a: 0.15, d: 0.35, gain: 0.08, verb: 0.4 })
  ;[1, 1.5, 2].forEach((r, i) => bell(t + 0.12 + i * 0.07, f * r, 0.05, 0, 0.45))
  tone({ t, f: f / 2, f2: f, glide: 0.25, d: 0.4, gain: 0.07, lp: 1800 })
}

// --- match: effects -------------------------------------------------------------------------------
export function zap(gain = 1) {
  if (!ok(0.6)) return
  const t = now()
  for (let i = 0; i < 5; i++) burst({ t: t + i * 0.025, noise: 'white', type: 'bandpass', f: vary(3200, 0.4), q: 2, a: 0.001, d: 0.03, gain: 0.12 * gain })
  tone({ t, type: 'sawtooth', f: 900, f2: 120, glide: 0.18, d: 0.2, gain: 0.05 * gain, lp: 3000 })
}
export function warp(gain = 1) {
  if (!ok(0.5)) return
  const t = now()
  tone({ t, f: 300, f2: 1400, glide: 0.18, d: 0.22, gain: 0.08 * gain })
  burst({ t, noise: 'pink', f: 500, f2: 4000, q: 2, a: 0.01, d: 0.2, gain: 0.06 * gain })
}
export function swallow() {
  if (!ok(0.8)) return
  const t = now()
  tone({ t, f: 520, f2: 40, glide: 0.5, d: 0.55, gain: 0.14, lp: 1500 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 600, f2: 80, a: 0.02, d: 0.5, gain: 0.25 })
}
export function holeOpen() {
  if (!ok(1.2)) return
  const t = now()
  tone({ t, f: 40, f2: 70, glide: 0.8, d: 1.4, gain: 0.18, lp: 400 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 200, f2: 900, a: 0.3, d: 1.2, gain: 0.25 })
}
export function roar() {
  if (!ok(1.5)) return
  const t = now()
  tone({ t, type: 'sawtooth', f: 140, f2: 70, glide: 0.7, d: 0.9, gain: 0.1, lp: 900 })
  tone({ t, type: 'sawtooth', f: 147, f2: 74, glide: 0.7, d: 0.9, gain: 0.08, lp: 700 })
  burst({ t, noise: 'brown', type: 'bandpass', f: 400, f2: 180, q: 0.8, a: 0.05, d: 0.9, gain: 0.35 })
}
export function clank() {
  if (!ok(0.4)) return
  const t = now()
  modal({ t, f: vary(620, 0.05), modes: [[1, 1, 0.5], [2.41, 0.6, 0.35], [3.93, 0.4, 0.25], [5.4, 0.25, 0.15]], strike: 0.6, gain: 0.16, verb: 0.3 })
}
export function flash() {
  if (!ok(1)) return
  const t = now()
  burst({ t, noise: 'white', type: 'highpass', f: 2000, a: 0.001, d: 0.12, gain: 0.25 })
  tone({ t, f: 90, f2: 40, glide: 0.25, d: 0.35, gain: 0.2 })
  zap(0.8)
}
export function rewind() {
  if (!ok(1)) return
  const t = now()
  for (let i = 0; i < 8; i++) tone({ t: t + i * 0.05, f: 1400 - i * 120, d: 0.05, gain: 0.04, bus: A.ui })
  burst({ t, noise: 'pink', f: 5000, f2: 400, q: 1, a: 0.02, d: 0.5, gain: 0.07 })
}
export function timeStop() {
  if (!ok(1)) return
  const t = now()
  modal({ t, f: 1760, modes: [[1, 1, 1.2], [2.76, 0.3, 0.6]], strike: 0.2, gain: 0.08, verb: 0.6 })
  tone({ t, f: 400, f2: 100, glide: 0.6, d: 0.7, gain: 0.06, lp: 1200 })
}
export function caught() {
  if (!ok(0.5)) return
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: 500, d: 0.08, gain: 0.3 })
  bell(t + 0.05, 1319, 0.05)
}
export function magnet() {
  if (!ok(0.8)) return
  const t = now()
  tone({ t, f: 110, d: 0.6, gain: 0.07, lp: 600 })
  tone({ t, f: 113, d: 0.6, gain: 0.07, lp: 600 })
  tone({ t, f: 220, f2: 880, glide: 0.4, d: 0.45, gain: 0.04 })
}
export function distract() {
  if (!ok(0.8)) return
  const t = now()
  tone({ t, type: 'triangle', f: 660, f2: 990, glide: 0.08, d: 0.12, gain: 0.07 })
  tone({ t: t + 0.14, type: 'triangle', f: 990, f2: 1320, glide: 0.08, d: 0.16, gain: 0.07 })
}
