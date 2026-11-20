// The rooftop's background: wind across the roof with gusts, a far-off city
// rumble with the odd horn, birds by day and crickets by night, the fire pit's
// crackle and someone noodling on the lounge piano (positional, fades with
// distance). A scheduler tick places the next events a little ahead.
import { AUDIO } from '../config.js'
import { A, onStart } from './core.js'
import { burst, env, modal, rnd, tone } from './synth.js'

const C = AUDIO.ambience
let wind = null
let windFilter = null
let city = null
let fireBed = null
let state = { night: 0, fire: 0, firePan: 0, piano: 0, pianoPan: 0, chime: 0, chimePan: 0, pianoOn: true }
let nextBird = 2
let nextHorn = 8
let nextChime = 5
let clock = 0
let pianoAt = 0
let pianoStep = 0

function loop(buf, gain, filter) {
  const ctx = A.ctx
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  const f = ctx.createBiquadFilter()
  Object.assign(f, {})
  f.type = filter.type
  f.frequency.value = filter.f
  f.Q.value = filter.q ?? 0.7
  const g = ctx.createGain()
  g.gain.value = gain
  src.connect(f).connect(g).connect(A.amb)
  src.start()
  return { src, f, g }
}

onStart(() => {
  wind = loop(A.noise.pinkStereo, 0, { type: 'bandpass', f: 500, q: 0.6 })
  windFilter = wind.f
  city = loop(A.noise.brownStereo, 0, { type: 'lowpass', f: 260 })
  fireBed = loop(A.noise.brownStereo, 0, { type: 'lowpass', f: 380 })
  wind.g.gain.setTargetAtTime(C.wind, A.ctx.currentTime, 1.5)
  city.g.gain.setTargetAtTime(C.city, A.ctx.currentTime, 2)
})

// Calm progression for the lounge piano (MIDI notes): Dmaj9 - Bm9 - Gmaj9 - A6/9
const CHORDS = [[50, 57, 61, 64, 66], [47, 54, 57, 61, 62], [43, 50, 54, 57, 59], [45, 52, 57, 59, 61]]
const SCALE = [62, 64, 66, 69, 71, 74, 76, 78, 81]
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)
function pianoNote(t, midi, vel, pan) {
  const f = mtof(midi)
  // slightly stretched partials, faster decay up high, a soft hammer
  modal({ t, f, modes: [[1, 1, 2.6], [2.003, 0.45, 1.6], [3.01, 0.22, 1], [4.02, 0.12, 0.6], [5.04, 0.06, 0.4]], beat: 1.2, decay: midi > 70 ? 0.6 : 1, gain: 0.06 * vel, pan, verb: 0.35, bus: A.amb })
  burst({ t, noise: 'pink', type: 'bandpass', f: Math.min(4000, f * 3), q: 1, d: 0.02, gain: 0.015 * vel, pan, bus: A.amb })
}
function schedulePiano(t0) {
  const g = state.piano
  if (!state.pianoOn || g < 0.02) {
    pianoAt = t0 + 0.5
    return
  }
  const bar = Math.floor(pianoStep / 8) % CHORDS.length
  const beat = pianoStep % 8
  const t = Math.max(t0, pianoAt)
  if (beat === 0) CHORDS[bar].forEach((m, i) => pianoNote(t + i * 0.035, m, g * (i ? 0.55 : 0.8), state.pianoPan))
  if (beat !== 0 && Math.random() < 0.62) pianoNote(t + rnd(0, 0.04), SCALE[Math.floor(rnd(0, SCALE.length))], g * rnd(0.45, 0.8), state.pianoPan)
  pianoStep++
  pianoAt = t + 0.42 + (Math.random() < 0.15 ? 0.21 : 0)
}

function bird(t) {
  const pan = rnd(-0.8, 0.8)
  const n = 2 + Math.floor(rnd(0, 4))
  const base = rnd(2800, 4200)
  for (let i = 0; i < n; i++) {
    const at = t + i * rnd(0.08, 0.14)
    tone({ t: at, f: base * rnd(0.95, 1.1), f2: base * rnd(1.15, 1.5), glide: 0.05, a: 0.005, d: 0.06, gain: 0.02, pan, verb: 0.3, bus: A.amb })
  }
}
function cricket(t) {
  const f = rnd(4300, 5200)
  const pan = rnd(-0.7, 0.7)
  for (let i = 0; i < 3; i++) tone({ t: t + i * 0.045, f, a: 0.004, d: 0.025, gain: 0.01, pan, bus: A.amb })
}
function horn(t) {
  const f = rnd(330, 440)
  const g = 0.012
  for (const d of [0, 1.26]) tone({ t, type: 'sawtooth', f: f * (d ? 1.26 : 1), a: 0.03, hold: rnd(0.2, 0.5), d: 0.3, gain: g, pan: rnd(-0.8, 0.8), verb: 0.6, lp: 900, bus: A.amb })
}
function chime(t) {
  const notes = [1568, 1760, 2093, 2349, 2637, 3136]
  const n = 3 + Math.floor(rnd(0, 4))
  for (let i = 0; i < n; i++) {
    modal({ t: t + i * rnd(0.12, 0.3), f: notes[Math.floor(rnd(0, notes.length))], modes: [[1, 1, 2.2], [2.76, 0.3, 1], [5.4, 0.12, 0.5]], beat: 2, gain: 0.025 * state.chime, pan: state.chimePan, verb: 0.4, bus: A.amb })
  }
}
function crackle(t, g) {
  const n = Math.floor(rnd(0, 4 * g + 1))
  for (let i = 0; i < n; i++) burst({ t: t + rnd(0, C.tick), f: rnd(1500, 6000), q: rnd(1, 4), a: 0.0005, d: rnd(0.004, 0.02), gain: rnd(0.05, 0.16) * g, pan: state.firePan, bus: A.amb })
}

// Called every frame; levels come from main (distances to the fire, piano, pavilion).
export function update(dt, s) {
  if (!A.master) return
  Object.assign(state, s)
  clock += dt
  const ctx = A.ctx
  const t = ctx.currentTime
  // gusts
  if (wind && Math.random() < dt * 0.35) {
    wind.g.gain.setTargetAtTime(C.wind * rnd(0.5, 1.6), t, rnd(0.8, 2.5))
    windFilter.frequency.setTargetAtTime(rnd(350, 900), t, 1.5)
  }
  fireBed?.g.gain.setTargetAtTime(state.fire * C.fire * 0.35, t, 0.3)
  if (clock < C.tick) return
  clock = 0
  const day = 1 - state.night
  nextBird -= C.tick
  nextHorn -= C.tick
  nextChime -= C.tick
  if (nextBird <= 0) {
    nextBird = rnd(...C.birdEvery)
    if (Math.random() < day) bird(t + 0.05)
    else for (let i = 0; i < 4; i++) cricket(t + i * rnd(0.3, 0.6))
  }
  if (state.night > 0.5 && Math.random() < 0.5) cricket(t + rnd(0, 0.2))
  if (nextHorn <= 0) {
    nextHorn = rnd(...C.hornEvery)
    horn(t + 0.05)
  }
  if (nextChime <= 0) {
    nextChime = rnd(...C.chimeEvery)
    if (state.chime > 0.05) chime(t + 0.05)
  }
  if (state.fire > 0.02) crackle(t + 0.03, state.fire)
  while (pianoAt < t + C.tick * 2) schedulePiano(t + 0.03)
}
