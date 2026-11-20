// One-shot sounds, all synthesised (synth.js). Pool sounds are physical recipes:
// phenolic balls ring high and short with inharmonic modes, the leather cue tip
// is a dull "tock" with a body thump, cushions are muffled rubber thuds, and a
// pocket is a drop + a few rolling rattles down the leather.
import { A, now, voice } from './core.js'
import { burst, modal, pick, rnd, tone, vary } from './synth.js'

const ok = (s, p = 1) => voice(s, p)

// --- UI ---------------------------------------------------------------------------------
export function click(pan = 0) {
  if (!ok(0.08, 2)) return
  const t = now()
  modal({ t, f: vary(1900, 0.04), modes: [[1, 1, 0.03], [2.4, 0.4, 0.018]], gain: 0.13, pan, bus: A.ui })
  burst({ t, f: 5200, q: 1.5, d: 0.012, gain: 0.05, pan, bus: A.ui })
}
export function press(pan = 0) {
  if (!ok(0.12, 2)) return
  const t = now()
  tone({ t, f: 480, f2: 760, glide: 0.05, d: 0.08, gain: 0.12, pan, bus: A.ui })
  modal({ t, f: 1400, modes: [[1, 1, 0.04], [2.1, 0.3, 0.02]], gain: 0.1, pan, bus: A.ui })
}
export function toggle(on) {
  if (!ok(0.15, 2)) return
  const t = now()
  tone({ t, f: on ? 660 : 520, d: 0.06, gain: 0.1, bus: A.ui })
  tone({ t: t + 0.06, f: on ? 990 : 390, d: 0.09, gain: 0.1, bus: A.ui })
}
export function panel(open = true) {
  if (!ok(0.3, 2)) return
  burst({ noise: 'pink', f: open ? 500 : 2400, f2: open ? 2600 : 450, q: 0.9, a: 0.02, d: 0.2, gain: 0.12, bus: A.ui })
}

// --- Lobby ---------------------------------------------------------------------------------
const bell = (t, f, gain, pan = 0, verb = 0.25) => modal({ t, f, modes: [[1, 1, 0.9], [2.76, 0.35, 0.4], [5.4, 0.15, 0.2]], beat: 3, gain, pan, verb, bus: A.sfx })
export function padEnter() {
  if (!ok(1.2)) return
  const t = now()
  ;[784, 988, 1175, 1568].forEach((f, i) => bell(t + i * 0.07, f, 0.09))
  burst({ t, noise: 'white', type: 'highpass', f: 6000, a: 0.08, d: 0.5, gain: 0.04, verb: 0.3 })
  tone({ t, f: 220, f2: 330, glide: 0.2, d: 0.3, gain: 0.06, lp: 900 })
}
export function padLeave() {
  if (!ok(0.6)) return
  const t = now()
  bell(t, 880, 0.07)
  bell(t + 0.09, 659, 0.07)
}
export function botJoined() {
  if (!ok(0.5)) return
  const t = now()
  bell(t, 1047, 0.07)
  bell(t + 0.08, 1319, 0.06)
}
export function tick(n = 1) {
  if (!ok(0.2)) return
  modal({ f: n > 0 ? 1250 : 1650, modes: [[1, 1, 0.07], [2.9, 0.35, 0.03]], strike: 0.3, gain: 0.22, verb: 0.15 })
}
export function ready() {
  if (!ok(1.6)) return
  const t = now()
  for (const f of [523, 659, 784, 1047]) bell(t, f, 0.06, 0, 0.35)
  burst({ t, noise: 'pink', f: 800, f2: 5000, a: 0.25, d: 0.5, gain: 0.05, verb: 0.4 })
}
export function matchStart() {
  if (!ok(1.8)) return
  const t = now()
  ;[[523, 0], [659, 0.1], [784, 0.2], [1047, 0.32]].forEach(([f, dt]) => {
    tone({ t: t + dt, type: 'triangle', f, d: 0.35, gain: 0.08, lp: 3000 })
    bell(t + dt, f * 2, 0.04)
  })
}
export function cash(n = 3) {
  if (!ok(0.8)) return
  const t = now()
  for (let i = 0; i < n; i++) modal({ t: t + i * 0.075 + rnd(0, 0.02), f: vary(2600, 0.06), modes: [[1, 1, 0.25], [2.3, 0.5, 0.15], [3.9, 0.3, 0.08]], beat: 8, strike: 0.2, gain: 0.08, pan: rnd(-0.3, 0.3), verb: 0.2 })
}
export function win() {
  if (!ok(2)) return
  const t = now()
  ;[523, 659, 784, 1047, 1319, 1568].forEach((f, i) => bell(t + i * 0.09, f, 0.07, (i - 2.5) * 0.15, 0.4))
  cash(5)
}
export function lose() {
  if (!ok(1.5)) return
  const t = now()
  ;[392, 370, 330].forEach((f, i) => tone({ t: t + i * 0.18, type: 'triangle', f, d: 0.3, gain: 0.08, lp: 1500 }))
}
export function sparkle(gain = 0.05) {
  if (!ok(0.6, 1.5)) return
  const t = now()
  for (let i = 0; i < 5; i++) bell(t + i * 0.035, pick([2093, 2349, 2637, 3136, 3520]), gain * rnd(0.5, 1), rnd(-0.5, 0.5), 0.3)
}

// --- Movement ------------------------------------------------------------------------------
// surface: 'tile' | 'wood'
export function footstep(level = 1, surface = 'tile', pan = 0) {
  if (!ok(0.12, 1.5)) return
  const t = now()
  if (surface === 'wood') {
    modal({ t, f: vary(170, 0.08), modes: [[1, 1, 0.07], [2.6, 0.4, 0.03]], gain: 0.16 * level, pan, bus: A.sfx })
    burst({ t, noise: 'pink', type: 'lowpass', f: 1400, d: 0.04, gain: 0.1 * level, pan })
  } else {
    burst({ t, noise: 'pink', type: 'lowpass', f: vary(900, 0.15), d: 0.05, gain: 0.16 * level, pan })
    burst({ t, f: vary(3400, 0.2), q: 2, d: 0.012, gain: 0.05 * level, pan })
  }
}
export function jump() {
  if (!ok(0.25)) return
  burst({ noise: 'pink', f: 500, f2: 1500, q: 0.8, a: 0.01, d: 0.16, gain: 0.08 })
}
export function land(level = 1) {
  if (!ok(0.25)) return
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: 400, d: 0.12, gain: 0.28 * level })
  burst({ t, noise: 'pink', type: 'lowpass', f: 1600, d: 0.05, gain: 0.08 * level })
}

// --- Pool (positional: gain 0..1 and pan come from the listener) ------------------------------
export function cueStrike(power = 0.5, gain = 1, pan = 0) {
  if (gain < 0.01 || !ok(0.15, 1.2)) return
  const t = now()
  const g = Math.min(1, 0.35 + power * 0.65) * gain
  modal({ t, f: vary(1250, 0.05), modes: [[1, 1, 0.03], [2.7, 0.45, 0.018], [5.2, 0.2, 0.01]], strike: 0.4, gain: 0.3 * g, pan, verb: 0.15 })
  tone({ t, f: 190, f2: 120, glide: 0.04, d: 0.05, gain: 0.18 * g, pan })
}
export function ballClack(speed = 1, gain = 1, pan = 0) {
  if (gain < 0.01 || !ok(0.1, 0.9)) return
  const g = Math.min(1, speed / 3) * gain
  if (g < 0.01) return
  const f = vary(3000, 0.12)
  modal({ f, modes: [[1, 1, 0.045], [2.32, 0.55, 0.028], [4.25, 0.28, 0.016], [6.6, 0.12, 0.01]], strike: 0.5, gain: 0.32 * g, pan, verb: 0.18 })
}
export function railThud(speed = 1, gain = 1, pan = 0) {
  if (gain < 0.01 || !ok(0.12, 0.9)) return
  const g = Math.min(1, speed / 2.5) * gain
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: 320, d: 0.09, gain: 0.35 * g, pan })
  tone({ t, f: vary(115, 0.1), d: 0.07, gain: 0.12 * g, pan })
  burst({ t, noise: 'pink', type: 'bandpass', f: 1300, q: 1.2, d: 0.02, gain: 0.05 * g, pan })
}
export function pocketDrop(gain = 1, pan = 0) {
  if (gain < 0.01 || !ok(0.6)) return
  const t = now()
  tone({ t, f: 150, f2: 85, glide: 0.1, d: 0.14, gain: 0.25 * gain, pan })
  burst({ t, noise: 'brown', type: 'lowpass', f: 600, d: 0.08, gain: 0.25 * gain, pan })
  // rolling down the pocket / return channel
  for (let i = 0; i < 5; i++) {
    const at = t + 0.09 + i * (0.06 + i * 0.012)
    modal({ t: at, f: vary(1500 - i * 140, 0.08), modes: [[1, 1, 0.03], [2.4, 0.4, 0.015]], gain: 0.07 * gain * (1 - i * 0.15), pan })
  }
}
export function niceShot(gain = 1, pan = 0) {
  if (gain < 0.02 || !ok(0.8)) return
  const t = now()
  bell(t, 1319 * 1, 0.05 * gain, pan, 0.3)
  bell(t + 0.08, 1760, 0.05 * gain, pan, 0.3)
}

// --- Match UI + juice (hub/match.js) ---------------------------------------------------------
// Power bar ratchet: a dry wooden click that climbs in pitch as the cue is drawn back.
export function powerTick(k = 0) {
  if (!ok(0.04, 1.5)) return
  const t = now()
  modal({ t, f: vary(900 + k * 1300, 0.03), modes: [[1, 1, 0.018], [2.6, 0.35, 0.01]], strike: 0.12, gain: 0.07 + k * 0.05, bus: A.ui })
}
// Who-breaks roulette: one tick per face, then a bright chord when it lands.
export function rouletteTick(k = 0) {
  if (!ok(0.05, 1.5)) return
  modal({ f: vary(1500 + k * 500, 0.02), modes: [[1, 1, 0.03], [3.1, 0.3, 0.015]], strike: 0.2, gain: 0.12, bus: A.ui })
}
export function breakerPicked() {
  if (!ok(1.2)) return
  const t = now()
  ;[659, 831, 988, 1319].forEach((f, i) => bell(t + i * 0.05, f, 0.07, 0, 0.35))
  burst({ t, noise: 'pink', f: 1200, f2: 6000, a: 0.02, d: 0.4, gain: 0.05, verb: 0.3 })
}
// Tutorial: a soft two-note "here's the next thing" and a sparkle when a step is done.
export function tutStep() {
  if (!ok(0.5)) return
  const t = now()
  bell(t, 1047, 0.05, 0, 0.3)
  bell(t + 0.09, 1568, 0.045, 0, 0.3)
}
export function stepDone() {
  sparkle(0.06)
}
export function yourTurn() {
  if (!ok(0.6)) return
  const t = now()
  tone({ t, type: 'triangle', f: 587, d: 0.12, gain: 0.07, lp: 2600, bus: A.ui })
  tone({ t: t + 0.08, type: 'triangle', f: 880, d: 0.2, gain: 0.07, lp: 2600, bus: A.ui })
}
export function opponentTurn() {
  if (!ok(0.5)) return
  const t = now()
  tone({ t, type: 'triangle', f: 523, d: 0.14, gain: 0.05, lp: 1800, bus: A.ui })
  tone({ t: t + 0.1, type: 'triangle', f: 392, d: 0.22, gain: 0.05, lp: 1800, bus: A.ui })
}
export function foul() {
  if (!ok(1)) return
  const t = now()
  tone({ t, type: 'square', f: 220, f2: 180, d: 0.18, gain: 0.05, lp: 900 })
  tone({ t: t + 0.17, type: 'square', f: 165, f2: 120, d: 0.32, gain: 0.05, lp: 700 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 300, d: 0.2, gain: 0.12 })
}
export function groupAssigned() {
  if (!ok(0.8)) return
  const t = now()
  ;[784, 988, 1175].forEach((f, i) => bell(t + i * 0.07, f, 0.06, 0, 0.3))
}
// Streak: an arpeggio that climbs one step higher for every pot in a row.
export function streak(n = 1) {
  if (!ok(1)) return
  const t = now()
  const base = 523 * Math.pow(1.122, Math.min(8, n - 1))
  ;[1, 1.26, 1.5, 2].forEach((r, i) => bell(t + i * 0.055, base * r, 0.055, (i - 1.5) * 0.2, 0.35))
  burst({ t, noise: 'pink', f: 600, f2: 4000, q: 0.7, a: 0.03, d: 0.35, gain: 0.06, verb: 0.25 })
}
export function coin() {
  cash(2)
}
// Ability: a bubbly blip as it fills, a rising shimmer when it is ready.
export function abilityGain() {
  if (!ok(0.3)) return
  const t = now()
  tone({ t, f: 600, f2: 1400, glide: 0.12, d: 0.14, gain: 0.05, bus: A.ui })
}
export function abilityReady() {
  if (!ok(1.5)) return
  const t = now()
  burst({ t, noise: 'pink', f: 400, f2: 7000, q: 1.2, a: 0.5, d: 0.3, gain: 0.08, verb: 0.4 })
  ;[1047, 1319, 1568, 2093].forEach((f, i) => bell(t + 0.3 + i * 0.06, f, 0.05, 0, 0.4))
}
// Fire shot: a "fwoomp" of air and a crackle of embers.
export function fireArm() {
  if (!ok(1.2)) return
  const t = now()
  burst({ t, noise: 'pink', type: 'lowpass', f: 300, f2: 3200, a: 0.12, d: 0.45, gain: 0.3 })
  tone({ t, f: 80, f2: 160, glide: 0.3, d: 0.4, gain: 0.12 })
  crackle(t + 0.1, 0.6, 0.08)
}
export function fireShot(power = 1) {
  if (!ok(1)) return
  const t = now()
  burst({ t, noise: 'brown', type: 'lowpass', f: 900, f2: 200, a: 0.01, d: 0.5, gain: 0.35 * power })
  burst({ t, noise: 'pink', type: 'bandpass', f: 2500, f2: 600, q: 0.8, a: 0.01, d: 0.4, gain: 0.12 * power })
  crackle(t, 0.5, 0.07)
}
function crackle(t, dur, gain) {
  for (let i = 0; i < 14; i++) burst({ t: t + Math.random() * dur, f: vary(3500, 0.5), q: 3, a: 0.0005, d: 0.008, gain: gain * rnd(0.4, 1) })
}
// Camera moves get a soft air sweep.
export function whoosh(k = 1) {
  if (!ok(0.4, 0.8)) return
  burst({ noise: 'pink', f: 350, f2: 1800, q: 0.7, a: 0.12, d: 0.3, gain: 0.035 * k, bus: A.ui })
}
export function spinSet() {
  click()
}
export function clockTick(urgent = false) {
  if (!ok(0.1)) return
  modal({ f: urgent ? 1900 : 1400, modes: [[1, 1, 0.04], [2.7, 0.3, 0.02]], strike: 0.25, gain: urgent ? 0.14 : 0.08, bus: A.ui })
}
export function placeBall() {
  if (!ok(0.15)) return
  const t = now()
  modal({ t, f: vary(2600, 0.05), modes: [[1, 1, 0.03], [2.3, 0.4, 0.015]], strike: 0.3, gain: 0.12 })
  burst({ t, noise: 'brown', type: 'lowpass', f: 500, d: 0.04, gain: 0.12 })
}

// Rolling rumble: a looped brown-noise bed under the cloth whose level and
// brightness follow how fast the balls are rolling (setRoll every frame).
let roll = null
export function setRoll(level = 0) {
  if (!A.ctx) return
  if (!roll) {
    const src = A.ctx.createBufferSource()
    src.buffer = A.noise.brown ?? A.noise.white
    if (!src.buffer) return
    src.loop = true
    const lp = A.ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 200
    const g = A.ctx.createGain()
    g.gain.value = 0
    src.connect(lp).connect(g).connect(A.sfx)
    src.start()
    roll = { g, lp }
  }
  const k = Math.max(0, Math.min(1, level))
  const t = A.ctx.currentTime
  roll.g.gain.setTargetAtTime(k * 0.22, t, 0.08)
  roll.lp.frequency.setTargetAtTime(160 + k * 500, t, 0.08)
}
