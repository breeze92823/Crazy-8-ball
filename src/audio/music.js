// Background music: a calm, generative lo-fi loop, synthesised live (no files), in D major
// like the lounge piano so the two always agree.
//   pad    warm detuned sine/triangle chords, slow swells, crossfading every two bars
//   bass   a soft round sine on the downbeats
//   keys   a sparse electric-piano melody on the major pentatonic (it can't clash with
//          any chord), phrased in short lines with rests, through a dark echo
// Rules that keep it from ever being harsh or crackly:
//   - everything is sines/triangles under a lowpass; the music bus also cuts below 70 Hz
//     and above ~3 kHz (core.js), so there is no hiss, fizz or rumble to pile up
//   - envelopes are ramps, never steps, so no clicks; every voice is stopped when silent
//   - the melody has a hard voice cap, and the scheduler skips (never bursts) after a stall
//   - it steps back next to the lounge piano and a little during a match
import { AUDIO } from '../config.js'
import { A, onStart } from './core.js'
import { rnd } from './synth.js'

const M = AUDIO.music
const EIGHTH = 60 / M.bpm / 2
const CHORD_STEPS = 16 // two bars of eighths per chord
const AHEAD = 0.35 // s scheduled in advance
const MAX_KEYS = 4

// Dmaj9 - F#m7 - Gmaj9 - A9sus4: bass root + a close, smoothly voice-led pad
const CHORDS = [
  { bass: 38, pad: [54, 57, 61, 64] },
  { bass: 42, pad: [52, 57, 61, 64] },
  { bass: 43, pad: [54, 57, 59, 62] },
  { bass: 45, pad: [55, 59, 62, 64] },
]
const MELODY = [66, 69, 71, 74, 76, 78, 81] // D major pentatonic, F#4..A5
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12)

let out = null // level (fade-in, piano / match duck) -> A.musicIn
let padBus = null
let padFilter = null
let keysBus = null
let level = 0
let step = 0
let nextAt = 0
let keysOn = 0
let mel = 3 // index into MELODY
let phrase = 0 // eighths left in the current melodic line (0 = resting)
let rest = 8 // eighths of rest before the next line
let started = 0

onStart((ctx) => {
  out = ctx.createGain()
  out.gain.value = 0
  out.connect(A.musicIn)

  padFilter = ctx.createBiquadFilter()
  padFilter.type = 'lowpass'
  padFilter.frequency.value = 1100
  padFilter.Q.value = 0.5
  padBus = ctx.createGain()
  padBus.gain.value = 1
  padFilter.connect(padBus).connect(out)

  // keys: dry + a dotted-eighth echo whose repeats get darker and quieter
  keysBus = ctx.createGain()
  keysBus.gain.value = 1
  keysBus.connect(out)
  const delay = ctx.createDelay(2)
  delay.delayTime.value = EIGHTH * 3
  const fb = ctx.createGain()
  fb.gain.value = 0.3
  const dark = ctx.createBiquadFilter()
  dark.type = 'lowpass'
  dark.frequency.value = 1600
  const thin = ctx.createBiquadFilter()
  thin.type = 'highpass'
  thin.frequency.value = 280
  const wet = ctx.createGain()
  wet.gain.value = M.echo
  keysBus.connect(delay)
  delay.connect(dark).connect(thin).connect(fb).connect(delay)
  thin.connect(wet).connect(out)

  started = ctx.currentTime
  nextAt = ctx.currentTime + 0.5
})

// --- voices ----------------------------------------------------------------------------------
function padNote(t, midi, dur, pan) {
  const ctx = A.ctx
  const f = mtof(midi)
  const attack = 2.2
  const release = 2.6
  const peak = 0.028
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + attack)
  g.gain.setValueAtTime(peak, t + dur)
  g.gain.linearRampToValueAtTime(0, t + dur + release)
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  g.connect(p).connect(padFilter)
  for (const [type, cents, amp] of [['sine', -4, 1], ['triangle', 5, 0.55]]) {
    const o = ctx.createOscillator()
    o.type = type
    o.frequency.value = f
    o.detune.value = cents
    const a = ctx.createGain()
    a.gain.value = amp
    o.connect(a).connect(g)
    o.start(t)
    o.stop(t + dur + release + 0.1)
  }
}

function bass(t, midi, vel) {
  const ctx = A.ctx
  const f = mtof(midi)
  const d = EIGHTH * 6
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.15 * vel, t + 0.05)
  g.gain.setTargetAtTime(0, t + 0.15, d / 3.5)
  g.connect(out)
  for (const [mul, amp] of [[1, 1], [2, 0.22]]) {
    const o = ctx.createOscillator()
    o.frequency.value = f * mul
    const a = ctx.createGain()
    a.gain.value = amp
    o.connect(a).connect(g)
    o.start(t)
    o.stop(t + d + 0.6)
  }
}

function key(t, midi, vel) {
  if (keysOn >= MAX_KEYS) return
  keysOn++
  const ctx = A.ctx
  const f = mtof(midi)
  const life = 1.9
  setTimeout(() => keysOn--, (t - ctx.currentTime + life) * 1000)
  const p = ctx.createStereoPanner()
  p.pan.value = rnd(-0.3, 0.3)
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = Math.min(2600, f * 3.2)
  lp.Q.value = 0.4
  lp.connect(p).connect(keysBus)
  // fundamental, a soft octave and a faint tine: the classic mellow e-piano colour
  for (const [mul, amp, decay] of [[1, 1, 0.55], [2, 0.16, 0.22], [3, 0.04, 0.1]]) {
    const o = ctx.createOscillator()
    o.frequency.value = f * mul
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(0.075 * vel * amp, t + 0.012)
    g.gain.setTargetAtTime(0, t + 0.012, decay)
    o.connect(g).connect(lp)
    o.start(t)
    o.stop(t + life)
  }
}

// --- arrangement -------------------------------------------------------------------------------
function chordAt(s) {
  return CHORDS[Math.floor(s / CHORD_STEPS) % CHORDS.length]
}

function play(t, s) {
  const inChord = s % CHORD_STEPS
  const chord = chordAt(s)
  if (inChord === 0) {
    chord.pad.forEach((m, i) => padNote(t + i * 0.04, m, EIGHTH * CHORD_STEPS, i % 2 ? 0.25 : -0.25))
    // the filter breathes a little with each chord
    padFilter.frequency.setTargetAtTime(rnd(900, 1400), t, 2)
  }
  if (inChord % 8 === 0) bass(t, chord.bass, inChord === 0 ? 1 : 0.75)
  else if (inChord % 8 === 4 && Math.random() < 0.5) bass(t, chord.bass, 0.5)

  // melody: short lines with rests between them; first 4 bars are pad + bass only
  if (s < 32) return
  if (phrase <= 0) {
    if (--rest > 0) return
    phrase = 4 + Math.floor(rnd(0, 7))
    rest = 6 + Math.floor(rnd(0, 10))
  }
  phrase--
  const onBeat = s % 2 === 0
  if (Math.random() > (onBeat ? 0.6 : 0.22)) return
  const r = Math.random()
  mel += r < 0.35 ? -1 : r < 0.7 ? 1 : r < 0.85 ? -2 : r < 0.95 ? 2 : 0
  mel = Math.max(0, Math.min(MELODY.length - 1, mel))
  // drift back toward the middle so lines don't hang at the top
  if (mel >= MELODY.length - 1 && Math.random() < 0.5) mel -= 2
  key(t + rnd(0, 0.015), MELODY[mel], phrase === 0 ? 0.85 : rnd(0.6, 0.95))
}

// Every frame. s: { match, piano (0..1 closeness to the lounge piano), pianoOn }
export function update(dt, s) {
  if (!out) return
  const ctx = A.ctx
  const t = ctx.currentTime
  const fade = Math.min(1, (t - started) / M.fadeIn)
  const near = s.pianoOn ? Math.min(1, s.piano * 1.4) : 0
  const target = fade * (s.match ? M.inMatch : 1) * (1 - M.pianoDuck * near)
  if (Math.abs(target - level) > 0.01) {
    level = target
    out.gain.setTargetAtTime(level, t, 0.6)
  }
  // fell behind (a long frame, a resumed tab): skip ahead instead of firing a backlog at once
  if (nextAt < t - 0.1) nextAt = t + 0.05
  const silent = A.music.gain.value < 0.001
  while (nextAt < t + AHEAD) {
    if (!silent) play(nextAt, step)
    step++
    nextAt += EIGHTH
  }
}
